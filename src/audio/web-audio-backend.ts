import {
  channelGain,
  INITIAL_AUDIO_STATUS,
  masterGain,
  type AudioScene,
  type AudioStatus,
} from '../core/audio-scene';
import { BassSequencer, type BassMode, type BassPattern } from '../core/bass-patterns';
import { bassMidi, type ScaleId } from '../core/bass-scales';
import { BASS_VOICES } from '../core/bass-voices';
import { pickVariant } from '../core/drum-kits';
import type { DrumPattern } from '../core/drum-patterns';
import { clickAt } from '../core/metronome';
import { DRUM_ROWS, type NodeId } from '../core/nodes';
import { LookaheadScheduler, type ScheduledStep } from '../core/scheduler';
import { startTicker, type AudioTicker } from './audio-clock';
import type { AudioBackend, StatusListener, StepEvent, StepListener } from './backend';
import { BassModule, bassParamsFromScene, loadBassProcessor } from './bass/bass-module';
import { DrumModule, type LoadedKit } from './drum-module';
import { AudioGraph } from './graph';
import { MasterBus } from './master';
import { MetronomeVoice } from './metronome';
import { MANIFEST_FILE, SampleLibrary } from './sample-library';

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
const BASS: NodeId = 'bass';

/** What is sounding right now; it catches up with the latest scene as allowed. */
interface Applied {
  kit: string | null;
  seed: number;
  generation: number;
  pattern: DrumPattern;
}

/** The BASS line sounding now. Key, scale and mode change with a new pattern, at the bar. */
interface AppliedBass {
  generation: number;
  pattern: BassPattern;
  root: number;
  scale: ScaleId;
  mode: BassMode;
}

/** Where the BASS processor stands in this context. */
type BassLoad = 'loading' | 'ready' | 'failed';

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
 * Applies at once: tempo, levels, row volume and tone, BASS knobs, wave and sub, hand
 * edits of a pattern. Waits for the next bar while playing: adding or removing nodes,
 * cutting or plugging cables, changing kit, a regenerated pattern, BASS key and scale.
 */
export class WebAudioBackend implements AudioBackend {
  private context: AudioContext | null = null;
  private initialized = false;
  private graph: AudioGraph | null = null;
  private master: MasterBus | null = null;
  private drum: DrumModule | null = null;
  private bass: BassModule | null = null;
  private bassLoad: BassLoad = 'loading';
  private appliedBass: AppliedBass | null = null;
  private readonly bassSequencer = new BassSequencer();
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
    this.bass?.flush(now);
    this.bassSequencer.reset();
    this.metronome?.cancelAfter(now);
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

  /** RMS of the master output (0 = silence). For meters and tests. */
  level(): number {
    return this.master?.level() ?? 0;
  }

  /** Peak of the metronome output, which bypasses the master. For tests. */
  clickLevel(): number {
    return this.metronome?.level() ?? 0;
  }

  // Start-up -------------------------------------------------------------------------------------

  private async initialize(context: AudioContext): Promise<void> {
    this.master = new MasterBus(context);
    this.master.output.connect(context.destination);
    this.graph = new AudioGraph(context);
    this.graph.add(MASTER, this.master);
    this.metronome = new MetronomeVoice(context, context.destination);
    this.library = new SampleLibrary((data) => context.decodeAudioData(data));

    void this.library.loadManifest().then(
      (manifest) => this.setStatus({ kits: manifest.kits.map((kit) => kit.id) }),
      () => this.reportMissing('*', [MANIFEST_FILE]),
    );
    void loadBassProcessor(context).then(
      () => {
        this.bassLoad = 'ready';
        if (this.initialized && this.scene) this.apply(this.scene);
      },
      (error: unknown) => {
        this.bassLoad = 'failed';
        console.warn('M.O.N.O.: no se pudo cargar la voz del BASS; queda en silencio.', error);
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
    this.master!.setChannelLevel(DRUM, channelGain(scene.master.drumLevel), now);
    this.master!.setChannelLevel(BASS, channelGain(scene.master.bassLevel), now);
    this.metronome!.setVolume(scene.metronome.volume, now);
    for (const row of DRUM_ROWS) this.drum?.setRow(row, scene.drum.rows[row], now);
    this.bass?.setParams(bassParamsFromScene(scene.bass));

    if (!this.applied) {
      this.applied = { kit: null, seed: scene.drum.seed, generation: scene.drum.generation, pattern: scene.drum.pattern };
    } else if (scene.drum.generation === this.applied.generation) {
      // A hand edit: sounds from the next step.
      this.applied.pattern = scene.drum.pattern;
    }
    if (!this.appliedBass) {
      const { generation, pattern, root, scale, mode } = scene.bass;
      this.appliedBass = { generation, pattern, root, scale, mode };
    } else if (scene.bass.generation === this.appliedBass.generation) {
      this.appliedBass.pattern = scene.bass.pattern;
    }

    if (this.structuralChange(scene)) this.queueStructural();
  }

  private structuralChange(scene: AudioScene): boolean {
    const applied = this.applied!;
    const bass = this.appliedBass!;
    const graph = this.graph!;
    const kit = scene.drum.kit;
    // A new kit counts once it has loaded, or when it still has to be requested.
    const kitChange = kit !== applied.kit && (this.kits.has(kit) || !this.kitRequests.has(kit));
    // BASS can only join once its processor is loaded.
    const bassNode = scene.nodes.includes(BASS) && this.bassLoad === 'ready';
    const bassChange =
      scene.bass.generation !== bass.generation || scene.bass.root !== bass.root || scene.bass.scale !== bass.scale;
    const cableChange = [DRUM, BASS].some(
      (id) => graph.has(id) && scene.cables.includes(id) !== graph.isConnected(id, MASTER),
    );
    return (
      scene.nodes.includes(DRUM) !== graph.has(DRUM) ||
      bassNode !== graph.has(BASS) ||
      scene.drum.generation !== applied.generation ||
      kitChange ||
      bassChange ||
      cableChange
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
    if (!scene || !graph || !applied) return;

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

    // Pattern regenerated (RNDM, CAOS).
    applied.generation = scene.drum.generation;
    applied.seed = scene.drum.seed;
    applied.pattern = scene.drum.pattern;

    // BASS line: new pattern, key, scale and mode together.
    const { generation, pattern, root, scale, mode } = scene.bass;
    this.appliedBass = { generation, pattern, root, scale, mode };

    // Nodes.
    const wantDrum = scene.nodes.includes(DRUM);
    if (wantDrum && !graph.has(DRUM)) {
      const drum = new DrumModule(this.context!);
      for (const row of DRUM_ROWS) drum.setRow(row, scene.drum.rows[row], time);
      drum.setKit(applied.kit ? (this.kits.get(applied.kit) ?? null) : null);
      graph.add(DRUM, drum);
      this.drum = drum;
    } else if (!wantDrum && graph.has(DRUM)) {
      graph.remove(DRUM, time);
      this.drum = null;
    }
    const wantBass = scene.nodes.includes(BASS) && this.bassLoad === 'ready';
    if (wantBass && !graph.has(BASS)) {
      const bass = new BassModule(this.context!);
      bass.setParams(bassParamsFromScene(scene.bass));
      graph.add(BASS, bass);
      this.bass = bass;
    } else if (!wantBass && graph.has(BASS)) {
      this.bass?.flush(time);
      this.bassSequencer.reset();
      graph.remove(BASS, time);
      this.bass = null;
    }

    // Cables: each live connection is made or cut here, with a short fade.
    for (const id of [DRUM, BASS]) {
      if (!graph.has(id)) continue;
      const want = scene.cables.includes(id);
      if (want && !graph.isConnected(id, MASTER)) {
        graph.connect(id, MASTER, time);
      } else if (!want && graph.isConnected(id, MASTER)) {
        graph.disconnect(id, MASTER, time);
        if (id === BASS) {
          this.bass?.flush(time);
          this.bassSequencer.reset();
        }
      }
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

    const sounding: NodeId[] = [];
    const drum = this.drum;
    const applied = this.applied;
    if (drum && applied && this.graph?.isConnected(DRUM, MASTER)) {
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
    const bass = this.bass;
    const line = this.appliedBass;
    if (bass && line && this.graph?.isConnected(BASS, MASTER)) {
      const events = this.bassSequencer.step(
        line.pattern,
        step,
        time,
        duration,
        (degree) => bassMidi(line.root, line.scale, degree),
        BASS_VOICES[line.mode].gate,
      );
      bass.schedule(events);
      if (events.some((event) => event.type === 'on')) sounding.push(BASS);
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
