import {
  channelGain,
  INITIAL_AUDIO_STATUS,
  masterGain,
  type AudioScene,
  type AudioStatus,
} from '../core/audio-scene';
import { pickVariant } from '../core/drum-kits';
import type { DrumPattern } from '../core/drum-patterns';
import { lfoRate } from '../core/lfo';
import type { LiveEvent } from '../core/live-events';
import { clickAt } from '../core/metronome';
import { DRUM_ROWS, type NodeId } from '../core/nodes';
import type { Link } from '../core/routing';
import { LookaheadScheduler, type ScheduledStep } from '../core/scheduler';
import { startTicker, type AudioTicker } from './audio-clock';
import type { AudioBackend, LfoTraceListener, StatusListener, StepEvent, StepListener } from './backend';
import { bassTrackSpec } from './bass/bass-track';
import { DistModule, loadDistProcessor } from './distortion/dist-module';
import { DroneModule } from './drone/drone-module';
import { DrumModule, type LoadedKit } from './drum-module';
import { AudioGraph, type AudioModule } from './graph';
import { LeadTrack } from './lead/lead-track';
import type { LfoSettings } from './lfo/lfo-dsp';
import { LfoModule, loadLfoProcessor } from './lfo/lfo-module';
import { MasterBus, type MixMeter } from './master';
import { MetronomeVoice } from './metronome';
import { MANIFEST_FILE, SampleLibrary } from './sample-library';
import { Strip } from './strip';
import { synthTrackSpec } from './synth/synth-track';
import { loadVoiceProcessor } from './voice/voice-module';
import { VoiceTrack, type TrackScene } from './voice/voice-track';

/** Steps are scheduled this far ahead of the audio clock, seconds. */
const LOOKAHEAD = 0.1;
/** Gap between pressing play and the first step, seconds. */
const START_DELAY = 0.05;
/** Render quanta between scheduler wake-ups (4 × 128 frames ≈ 11 ms at 48 kHz). */
const TICK_QUANTA = 4;
/** A kit's sample hit, when its key is touched: a little after now, at this velocity. */
const AUDITION_DELAY = 0.01;
const AUDITION_VELOCITY = 0.9;

const MASTER = 'master';
const DRUM: NodeId = 'drum';
const LEAD: NodeId = 'lead';
const DRONE: NodeId = 'drone';
const DIST: NodeId = 'dist';
const LFO: NodeId = 'lfo';

type LevelKnob = 'drumLevel' | 'bassLevel' | 'synthLevel' | 'leadLevel' | 'droneLevel';

/** The level knob on MASTER of each instrument, applied at the instrument's output. */
const LEVEL_KNOBS: Readonly<Partial<Record<NodeId, LevelKnob>>> = {
  drum: 'drumLevel',
  bass: 'bassLevel',
  synth: 'synthLevel',
  lead: 'leadLevel',
  drone: 'droneLevel',
};

/** Nodes that make sound: each is released when its sound stops reaching MASTER. */
const INSTRUMENTS: readonly NodeId[] = [DRUM, 'bass', 'synth', LEAD, DRONE];

/** Played by hand: they join, leave and have their own cables changed at once. */
const isLive = (id: NodeId): boolean => id === LEAD || id === DRONE;
const sameLink = (a: { from: string; to: string }, b: { from: string; to: string }): boolean =>
  a.from === b.from && a.to === b.to;

const lfoSettings = (scene: AudioScene): LfoSettings => ({
  shape: scene.lfo.shape,
  sync: scene.lfo.sync,
  chaos: scene.lfo.chaos,
  rate: lfoRate(scene.lfo.rate, scene.lfo.sync, scene.bpm),
});

/** What DRUM is playing now; it catches up with the latest scene as allowed. */
interface Applied {
  kit: string | null;
  seed: number;
  generation: number;
  pattern: DrumPattern;
}

/** Where a worklet processor (voices, DISTORSIÓN, LFO) stands in this context. */
type WorkletLoad = 'loading' | 'ready' | 'failed';

interface PendingVisual {
  readonly time: number;
  readonly event: StepEvent;
}

/**
 * The real backend, on the Web Audio API.
 *
 * One clock: a LookaheadScheduler read against AudioContext.currentTime and woken up by
 * an AudioWorklet. Each step is scheduled with its exact time, and its visual event is
 * delivered when that time is heard (output latency included).
 *
 * Applies at once: tempo, levels, every knob (DISTORSIÓN and LFO included), keys and
 * presets, hand edits of a pattern, and everything played live (LEAD notes, DRONE
 * layers). Waits for the next bar while playing: adding or removing nodes, making or
 * cutting cables (sound and modulation), changing kit, a regenerated pattern, tonic and
 * scale. LEAD and DRONE are the exception: played by hand, they join, leave and have
 * their own cables made or cut at once (applyLive).
 *
 * Routing: every cable of the scene is a real connection in the AudioGraph, from a
 * node's output (after its level) to another node's input; an input sums its cables.
 * An instrument whose sound stops reaching MASTER (its cable cut, the effect it went
 * through unplugged) lets go of what it was playing, so nothing comes back later.
 */
export class WebAudioBackend implements AudioBackend {
  private context: AudioContext | null = null;
  private initialized = false;
  private graph: AudioGraph | null = null;
  private master: MasterBus | null = null;
  private drum: DrumModule | null = null;
  /** BASS and SYNTH, on the shared voice engine. */
  private readonly tracks: readonly VoiceTrack<TrackScene>[] = [
    new VoiceTrack(bassTrackSpec()),
    new VoiceTrack(synthTrackSpec()),
  ];
  /** LEAD, live on the shared voice engine. */
  private readonly lead = new LeadTrack();
  /** DRONE, live on native Web Audio nodes. */
  private drone: DroneModule | null = null;
  private dist: DistModule | null = null;
  private lfo: LfoModule | null = null;
  /** Each instrument's level, at its output. */
  private readonly strips = new Map<NodeId, Strip>();
  /** Instruments whose sound reaches MASTER in the graph as it is now. */
  private heard = new Set<NodeId>();
  private voiceLoad: WorkletLoad = 'loading';
  private distLoad: WorkletLoad = 'loading';
  private lfoLoad: WorkletLoad = 'loading';
  private readonly lfoListeners = new Set<LfoTraceListener>();
  private metronome: MetronomeVoice | null = null;
  /** Kit waiting to be heard (its samples may still be loading). */
  private pendingAudition: string | null = null;
  private library: SampleLibrary | null = null;
  private ticker: AudioTicker | null = null;
  private readonly scheduler = new LookaheadScheduler(undefined, { lookahead: LOOKAHEAD });

  private scene: AudioScene | null = null;
  private applied: Applied | null = null;
  private structuralQueued = false;
  private readonly kits = new Map<string, LoadedKit>();
  /** Kits asked for once already; a kit that failed is not retried (its rows use the fallback voice). */
  private readonly kitRequests = new Set<string>();
  private resumeSettled = false;

  private listener: StepListener | null = null;
  private wantPlaying = false;
  private visuals: PendingVisual[] = [];

  private status: AudioStatus = INITIAL_AUDIO_STATUS;
  private readonly statusListeners = new Set<StatusListener>();

  // AudioBackend ---------------------------------------------------------------------------------

  unlock(): void {
    if (this.status.state === 'unavailable') return;
    if (!this.context) {
      try {
        this.context = new AudioContext({ latencyHint: 'interactive' });
      } catch (error) {
        console.warn('M.O.N.O.: este navegador no tiene Web Audio.', error);
        this.setStatus({ state: 'unavailable' });
        return;
      }
      this.context.addEventListener('statechange', this.onContextState);
      this.setStatus({ state: 'starting' });
      void this.initialize(this.context);
    }
    const context = this.context;
    if (context.state !== 'running') {
      // resume() must start inside the gesture; it settles later.
      const settle = (): void => {
        this.resumeSettled = true;
        this.onContextState();
      };
      void context.resume().then(settle, settle);
    }
  }

  start(onStep: StepListener): void {
    this.listener = onStep;
    this.wantPlaying = true;
    this.begin();
  }

  stop(): void {
    this.wantPlaying = false;
    this.listener = null;
    this.visuals = [];
    const now = this.context?.currentTime ?? 0;
    // Changes waiting for a bar that will not come apply now.
    this.scheduler.stop(now);
    this.drum?.cancelAfter(now);
    for (const track of this.tracks) track.flush(now);
    // Live voices are released too: nothing is left hanging when the transport stops.
    this.lead.flush(now);
    this.drone?.stop(now);
    this.metronome?.cancelAfter(now);
  }

  perform(event: LiveEvent): void {
    const context = this.context;
    if (!this.initialized || !context) return;
    const now = context.currentTime;
    if (event.node === 'lead') this.lead.play(event, now);
    else this.drone?.play(event, now);
  }

  audition(kit: string): void {
    this.pendingAudition = kit;
    this.playAudition();
  }

  update(scene: AudioScene): void {
    this.scene = scene;
    if (this.initialized) this.apply(scene);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  onLfoTrace(listener: LfoTraceListener): () => void {
    this.lfoListeners.add(listener);
    return () => this.lfoListeners.delete(listener);
  }

  /** RMS of the master output (0 = silence). For meters and tests. */
  level(): number {
    return this.master?.level() ?? 0;
  }

  /** Peaks of the mix before and after the master's limiter, and its gain reduction. For tests. */
  mix(): MixMeter {
    return this.master?.mix() ?? { bus: 0, out: 0, reduction: 0 };
  }

  /** Peak of the metronome output, which bypasses the master. For tests. */
  clickLevel(): number {
    return this.metronome?.level() ?? 0;
  }

  /** The cables in the audio graph right now, as "from->to". For tests. */
  cables(): string[] {
    return this.graph?.cableIds() ?? [];
  }

  // Start-up -------------------------------------------------------------------------------------

  private async initialize(context: AudioContext): Promise<void> {
    this.master = new MasterBus(context);
    this.master.output.connect(context.destination);
    const keepAlive = context.createGain();
    keepAlive.gain.value = 0;
    keepAlive.connect(context.destination);
    this.graph = new AudioGraph(context, keepAlive);
    this.graph.add(MASTER, this.master);
    this.metronome = new MetronomeVoice(context, context.destination);
    this.library = new SampleLibrary((data) => context.decodeAudioData(data));

    void this.library.loadManifest().then(
      (manifest) => this.setStatus({ kits: manifest.kits.map((kit) => kit.id) }),
      () => this.reportMissing('*', [MANIFEST_FILE]),
    );
    const loaded = (): void => {
      if (this.initialized && this.scene) this.apply(this.scene);
    };
    void loadVoiceProcessor(context).then(
      () => {
        this.voiceLoad = 'ready';
        loaded();
      },
      (error: unknown) => {
        this.voiceLoad = 'failed';
        console.warn('M.O.N.O.: no se pudo cargar la voz de BASS, SYNTH y LEAD; quedan en silencio.', error);
      },
    );
    void loadDistProcessor(context).then(
      () => {
        this.distLoad = 'ready';
        loaded();
      },
      (error: unknown) => {
        this.distLoad = 'failed';
        console.warn('M.O.N.O.: no se pudo cargar la DISTORSIÓN; queda en silencio.', error);
      },
    );
    void loadLfoProcessor(context).then(
      () => {
        this.lfoLoad = 'ready';
        loaded();
      },
      (error: unknown) => {
        this.lfoLoad = 'failed';
        console.warn('M.O.N.O.: no se pudo cargar el LFO; no mueve nada.', error);
      },
    );

    this.ticker = await startTicker(context, this.pump, TICK_QUANTA);
    this.initialized = true;
    if (this.scene) {
      this.requestKit(this.scene.drum.kit);
      this.apply(this.scene);
    }
    this.onContextState();
    this.playAudition();
  }

  private readonly onContextState = (): void => {
    const context = this.context;
    if (!context || this.status.state === 'unavailable') return;
    if (context.state === 'running') {
      if (this.initialized) this.setStatus({ state: 'running' });
      this.begin();
    } else if (this.resumeSettled) {
      // resume() settled but the browser did not let audio run; the next gesture retries.
      this.setStatus({ state: 'blocked' });
    }
  };

  private begin(): void {
    const context = this.context;
    if (!this.wantPlaying || !this.initialized || !context || context.state !== 'running') return;
    if (this.scheduler.running) return;
    this.scheduler.start(context.currentTime + START_DELAY);
  }

  // Scene ----------------------------------------------------------------------------------------

  private apply(scene: AudioScene): void {
    const context = this.context!;
    const now = context.currentTime;

    // Continuous: from now.
    this.scheduler.setBpm(scene.bpm);
    this.master!.setVolume(masterGain(scene.master.volume), now);
    for (const [id, strip] of this.strips) strip.setLevel(this.levelOf(scene, id), now);
    this.metronome!.setVolume(scene.metronome.volume, now);
    for (const row of DRUM_ROWS) this.drum?.setRow(row, scene.drum.rows[row], now);
    for (const track of this.tracks) track.update(scene);
    this.lead.update(scene);
    this.drone?.setScene(scene, now);
    this.dist?.setSettings(scene.dist);
    this.lfo?.setSettings(lfoSettings(scene));
    this.lfo?.setDepth(scene.lfo.depth, now);

    if (!this.applied) {
      this.applied = { kit: null, seed: scene.drum.seed, generation: scene.drum.generation, pattern: scene.drum.pattern };
    } else if (scene.drum.generation === this.applied.generation) {
      // A hand edit: sounds from the next step.
      this.applied.pattern = scene.drum.pattern;
    }

    this.applyLive(scene, now);
    if (this.structuralChange(scene)) this.queueStructural();
  }

  /** Whether a node of the scene should be in the graph (worklet nodes need their processor). */
  private wants(scene: AudioScene, id: NodeId): boolean {
    if (!scene.nodes.includes(id)) return false;
    if (id === DIST) return this.distLoad === 'ready';
    if (id === LFO) return this.lfoLoad === 'ready';
    return id === DRUM || id === DRONE || this.voiceLoad === 'ready';
  }

  /** Nodes whose joining and leaving wait for the bar. */
  private barIds(): NodeId[] {
    return [DRUM, ...this.tracks.map((track) => track.id), DIST, LFO];
  }

  /** The level knob of an instrument, as a gain (1 for nodes without one). */
  private levelOf(scene: AudioScene, id: NodeId): number {
    const knob = LEVEL_KNOBS[id];
    return knob ? channelGain(scene.master[knob]) : 1;
  }

  /** Adds a module to the graph; an instrument with a level knob goes in behind its level. */
  private addModule(id: NodeId, module: AudioModule, scene: AudioScene): void {
    if (LEVEL_KNOBS[id]) {
      const strip = new Strip(this.context!, module, this.levelOf(scene, id));
      this.strips.set(id, strip);
      this.graph!.add(id, strip);
    } else {
      this.graph!.add(id, module);
    }
  }

  private removeModule(id: NodeId, time: number): void {
    this.strips.delete(id);
    this.graph!.remove(id, time);
  }

  /** The scene's cables that `pick` covers and whose two ends are in the graph. */
  private wantedLinks(scene: AudioScene, pick: (link: Link) => boolean): Link[] {
    const graph = this.graph!;
    return scene.cables.filter((link) => pick(link) && graph.has(link.from) && graph.has(link.to));
  }

  /** The graph's cables that `pick` covers. */
  private currentLinks(pick: (link: Link) => boolean): Link[] {
    return (this.graph!.links() as Link[]).filter(pick);
  }

  private structuralChange(scene: AudioScene): boolean {
    const applied = this.applied!;
    const graph = this.graph!;
    const kit = scene.drum.kit;
    // A new kit counts once it has loaded, or when it still has to be requested.
    const kitChange = kit !== applied.kit && (this.kits.has(kit) || !this.kitRequests.has(kit));
    const nodeChange = this.barIds().some((id) => this.wants(scene, id) !== graph.has(id));
    const onBar = (link: Link): boolean => !isLive(link.from);
    const wanted = this.wantedLinks(scene, onBar);
    const current = this.currentLinks(onBar);
    const cableChange =
      wanted.length !== current.length || wanted.some((link) => !current.some((other) => sameLink(link, other)));
    return (
      nodeChange ||
      cableChange ||
      kitChange ||
      scene.drum.generation !== applied.generation ||
      this.tracks.some((track) => track.pending(scene))
    );
  }

  /** Applies structural changes at the next bar, or now when stopped. Reads the latest scene then. */
  private queueStructural(): void {
    if (this.structuralQueued) return;
    const queued = this.scheduler.atNextBar((time) => {
      this.structuralQueued = false;
      this.applyStructural(time);
    });
    if (queued) this.structuralQueued = true;
    else this.applyStructural(this.context!.currentTime);
  }

  private applyStructural(time: number): void {
    const scene = this.scene;
    const graph = this.graph;
    const applied = this.applied;
    const context = this.context;
    if (!scene || !graph || !applied || !context) return;

    // Kit: switch once loaded; until then the previous one keeps playing.
    if (scene.drum.kit !== applied.kit) {
      const kit = this.kits.get(scene.drum.kit);
      if (kit) {
        applied.kit = kit.id;
        this.drum?.setKit(kit);
      } else {
        this.requestKit(scene.drum.kit);
      }
    }

    // Patterns regenerated (RNDM, DICE, modes, CAOS), tonic and scale.
    applied.generation = scene.drum.generation;
    applied.seed = scene.drum.seed;
    applied.pattern = scene.drum.pattern;
    for (const track of this.tracks) track.commit(scene);

    // Nodes.
    this.place(
      DRUM,
      scene,
      time,
      () => {
        const drum = new DrumModule(context);
        for (const row of DRUM_ROWS) drum.setRow(row, scene.drum.rows[row], time);
        drum.setKit(applied.kit ? (this.kits.get(applied.kit) ?? null) : null);
        return (this.drum = drum);
      },
      () => (this.drum = null),
    );
    for (const track of this.tracks) {
      this.place(track.id, scene, time, () => track.create(context, scene), () => track.drop(time));
    }
    this.place(DIST, scene, time, () => (this.dist = new DistModule(context, scene.dist)), () => (this.dist = null));
    this.place(
      LFO,
      scene,
      time,
      () =>
        (this.lfo = new LfoModule(context, lfoSettings(scene), scene.lfo.depth, (values) => {
          for (const listener of this.lfoListeners) listener(values);
        })),
      () => (this.lfo = null),
    );

    // Cables: each connection is made or cut here, with a short fade.
    this.patch(scene, time, () => true);
  }

  /**
   * LEAD and DRONE join, leave, and have their cables made or cut at once, playing or
   * not: they are played by hand and have no bar to line up with, and waiting for one
   * would leave the keys and the pad dead for up to a bar.
   */
  private applyLive(scene: AudioScene, time: number): void {
    const context = this.context!;
    this.place(LEAD, scene, time, () => this.lead.create(context, scene), () => this.lead.drop(time));
    this.place(
      DRONE,
      scene,
      time,
      () => (this.drone = new DroneModule(context, scene)),
      () => {
        this.drone?.stop(time);
        this.drone = null;
      },
    );
    this.patch(scene, time, (link) => isLive(link.from));
  }

  /**
   * Makes and cuts the graph's cables that `pick` covers until they match the scene, each
   * with a short fade. Then any instrument whose sound no longer reaches MASTER lets go.
   */
  private patch(scene: AudioScene, time: number, pick: (link: Link) => boolean): void {
    const graph = this.graph!;
    const wanted = this.wantedLinks(scene, pick);
    for (const link of this.currentLinks(pick)) {
      if (!wanted.some((other) => sameLink(other, link))) graph.disconnect(link.from, link.to, time);
    }
    for (const link of wanted) graph.connect(link.from, link.to, time);
    this.hear(time);
  }

  /**
   * Which instruments reach MASTER now. One that stopped (its cable cut, the effect it
   * went through unplugged or removed) is released, so nothing waits behind the cut to
   * sound when it is plugged back: BASS and SYNTH drop their scheduled notes; LEAD and
   * DRONE, unheard now, go silent at once.
   */
  private hear(time: number): void {
    const graph = this.graph!;
    const now = new Set(INSTRUMENTS.filter((id) => graph.has(id) && graph.reaches(id, MASTER, LFO)));
    for (const id of this.heard) {
      if (now.has(id)) continue;
      this.tracks.find((track) => track.id === id)?.flush(time);
      if (id === LEAD) this.lead.flush(time, true);
      if (id === DRONE) this.drone?.clear(time);
    }
    this.heard = now;
  }

  /** Adds a node's module to the graph or takes it out, as the scene wants. */
  private place(id: NodeId, scene: AudioScene, time: number, create: () => AudioModule, drop: () => void): void {
    const graph = this.graph!;
    const want = this.wants(scene, id);
    if (want && !graph.has(id)) {
      this.addModule(id, create(), scene);
    } else if (!want && graph.has(id)) {
      drop();
      this.removeModule(id, time);
    }
  }

  private requestKit(id: string): void {
    if (this.kitRequests.has(id) || !this.library) return;
    this.kitRequests.add(id);
    void this.library.loadKit(id).then((kit) => {
      this.reportMissing(id, kit.failed);
      // Without a manifest there is nothing to play: the rows keep the fallback voice.
      if (kit.failed.includes(MANIFEST_FILE)) return;
      this.kits.set(id, kit);
      if (this.scene?.drum.kit === id && this.applied?.kit !== id) this.queueStructural();
      if (this.pendingAudition === id) this.playAudition();
    });
  }

  /** Plays the pending kit's kick through DRUM, once its samples are in. */
  private playAudition(): void {
    const id = this.pendingAudition;
    const context = this.context;
    if (id === null || !this.initialized || !context) return;
    const kit = this.kits.get(id);
    if (!kit) {
      this.requestKit(id);
      return;
    }
    this.pendingAudition = null;
    this.drum?.preview(kit, 'kick', AUDITION_VELOCITY, context.currentTime + AUDITION_DELAY);
  }

  // Clock ----------------------------------------------------------------------------------------

  /** Woken by the ticker: schedules the steps inside the lookahead, then delivers heard steps. */
  private readonly pump = (): void => {
    const context = this.context;
    if (!context) return;
    for (const step of this.scheduler.advance(context.currentTime)) this.playStep(step);

    const latency = context.outputLatency || context.baseLatency || 0;
    const heard = context.currentTime - latency;
    while (this.visuals.length > 0 && this.visuals[0]!.time <= heard) {
      const { event } = this.visuals.shift()!;
      this.listener?.(event);
    }
  };

  private playStep({ step, time, duration }: ScheduledStep): void {
    // The metronome rides the same clock as every node, whatever is on the canvas.
    const click = this.scene?.metronome.on ? clickAt(step) : null;
    if (click) this.metronome?.click(click, time);
    // SYNC: the LFO starts its cycle on every bar.
    if (step === 0) this.lfo?.bar(time);

    const sounding: NodeId[] = [];
    const drum = this.drum;
    const applied = this.applied;
    if (drum && applied && this.heard.has(DRUM)) {
      let hit = false;
      DRUM_ROWS.forEach((row, index) => {
        for (const { velocity, offset } of applied.pattern[index]?.[step] ?? []) {
          const variant = pickVariant(applied.seed, row, step, drum.variants(row));
          drum.trigger(row, velocity, time + offset * duration, variant);
          hit = true;
        }
      });
      if (hit) sounding.push(DRUM);
    }
    for (const track of this.tracks) {
      if (this.heard.has(track.id) && track.play(step, time, duration)) sounding.push(track.id);
    }
    if (this.listener) this.visuals.push({ time, event: { step, sounding } });
  }

  // Status ---------------------------------------------------------------------------------------

  private reportMissing(kit: string, files: readonly string[]): void {
    const missing = { ...this.status.missing };
    if (files.length > 0) missing[kit] = files;
    else delete missing[kit];
    this.setStatus({ missing });
  }

  private setStatus(patch: Partial<AudioStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const listener of this.statusListeners) listener(this.status);
  }

  /** Releases everything. The backend cannot be used afterwards. */
  dispose(): void {
    this.stop();
    this.ticker?.dispose();
    void this.context?.close();
    this.context = null;
    this.initialized = false;
  }
}
