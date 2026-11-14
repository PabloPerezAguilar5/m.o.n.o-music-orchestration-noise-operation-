import type { AudioScene, BassScene, SliceScene } from '../../core/audio-scene';
import { BassSequencer } from '../../core/bass-patterns';
import { BASS_VOICES } from '../../core/bass-voices';
import { bassMidi } from '../../core/scales';
import {
  gateFraction,
  loopBar,
  loopId,
  sliceRate,
  SliceSequencer,
  sliceSeconds,
  sliceWindow,
  type BassLoop,
} from '../../core/slice';
import type { AudioModule } from '../graph';
import { VoiceTrack, type Track, type TrackSpec } from '../voice/voice-track';
import { BassModule } from './bass-module';
import { bassParamsFromScene } from './bass-voice';
import { SliceModule, type SliceHit } from './slice-module';

/** Level of the 303 into the BASS output. */
export const BASS_LEVEL = 0.9;
/** A loop heard from the list: its first beat (four pieces). */
const PREVIEW_SLICES = 4;

/** The 303 on a VoiceTrack: one mono voice, notes with slide and accent, the mode's gate. */
export function bassTrackSpec(): TrackSpec<BassScene> {
  const sequencer = new BassSequencer();
  return {
    id: 'bass',
    instrument: 'bass',
    level: BASS_LEVEL,
    part: (scene) => scene.bass,
    params: bassParamsFromScene,
    events: (part, step, time, duration) =>
      sequencer.step(
        part.pattern,
        step,
        time,
        duration,
        (degree) => bassMidi(part.root, part.scale, degree),
        BASS_VOICES[part.mode].gate,
        part.slides,
      ),
    reset: () => sequencer.reset(),
  };
}

/** Where the decoded loops come from (the backend's SliceLibrary). */
export interface LoopSource {
  get(loop: BassLoop): AudioBuffer | undefined;
  /** Asks for a loop to be loaded; the owner applies it at the bar once it is in. */
  request(loop: BassLoop): void;
}

/** Builds the SLICE module (replaced in tests). */
export type SlicerFactory = (context: BaseAudioContext, scene: AudioScene) => SliceModule;

/** The 303 side, as the track drives it (a VoiceTrack; replaced in tests). */
export type SynthTrack = Pick<
  VoiceTrack<BassScene>,
  'update' | 'pending' | 'commit' | 'create' | 'flush' | 'drop' | 'play'
>;

/** What SLICE is playing now (committed at the bar). */
interface Committed {
  readonly voice: 'synth' | 'slice';
  readonly slice: SliceScene;
}

const sliceKnobs = (slice: SliceScene) => ({ volume: slice.volume, filter: slice.filter, drive: slice.drive });

/**
 * BASS as the backend runs it: the 303 (a VoiceTrack on the shared engine) and SLICE
 * (pieces of a loop), one module in the graph, one voice playing at a time.
 *
 * Applies at once: knobs, SYNC, REVERSE, hand edits of the pattern. Waits for the bar:
 * the voice (SYNTH or SLICE), a regenerated pattern, BAR, and a new loop once it is
 * decoded (until then the previous one keeps playing). Switching voice at the bar
 * releases what the other was playing, so nothing is left hanging.
 */
export class BassTrack implements Track {
  readonly id = 'bass' as const;
  private readonly sequencer = new SliceSequencer();
  private module: BassModule | null = null;
  private committed: Committed | null = null;
  private scene: AudioScene | null = null;

  /**
   * `voiceReady`: whether the voice worklet loaded (without it the 303 stays silent and
   * SLICE still plays).
   */
  constructor(
    private readonly loops: LoopSource,
    private readonly voiceReady: () => boolean,
    private readonly createSlicer: SlicerFactory = (context, scene) =>
      new SliceModule(context, sliceKnobs(scene.bass.slice)),
    private readonly synth: SynthTrack = new VoiceTrack(bassTrackSpec()),
  ) {}

  update(scene: AudioScene, time: number): void {
    this.scene = scene;
    this.synth.update(scene);
    const part = scene.bass.slice;
    this.module?.slicer.setKnobs(sliceKnobs(part), time);
    const committed = this.committed;
    if (!committed) {
      this.committed = { voice: scene.bass.voice, slice: part };
      this.module?.slicer.setBuffer(part.loop ? (this.loops.get(part.loop) ?? null) : null);
    } else if (part.generation === committed.slice.generation) {
      // Hand edits, SYNC and REVERSE sound from the next step; the loop and BAR wait for the bar.
      this.committed = { ...committed, slice: { ...part, loop: committed.slice.loop, bar: committed.slice.bar } };
    }
    if (scene.bass.voice === 'slice' && part.loop && !this.loops.get(part.loop)) this.loops.request(part.loop);
  }

  pending(scene: AudioScene): boolean {
    const committed = this.committed;
    if (!committed) return false;
    const part = scene.bass.slice;
    const loopChange =
      !!part.loop && idOf(part.loop) !== idOf(committed.slice.loop) && this.loops.get(part.loop) !== undefined;
    return (
      this.synth.pending(scene) ||
      scene.bass.voice !== committed.voice ||
      part.generation !== committed.slice.generation ||
      part.bar !== committed.slice.bar ||
      loopChange
    );
  }

  commit(scene: AudioScene, time: number): void {
    this.synth.commit(scene);
    const previous = this.committed;
    const part = scene.bass.slice;
    // A loop still decoding does not switch in: the one playing stays until it is ready.
    const loop = part.loop && this.loops.get(part.loop) ? part.loop : (previous?.slice.loop ?? null);
    this.committed = { voice: scene.bass.voice, slice: { ...part, loop } };
    if (previous && previous.voice !== scene.bass.voice) {
      if (previous.voice === 'synth') this.synth.flush(time);
      else this.module?.slicer.flush(time);
      this.sequencer.reset();
    }
    // A new loop or a new BAR starts the cycle count over: AUTO begins at the loop's first bar.
    if (idOf(loop) !== idOf(previous?.slice.loop ?? null) || part.bar !== previous?.slice.bar) this.sequencer.reset();
    this.module?.slicer.setBuffer(loop ? (this.loops.get(loop) ?? null) : null);
  }

  create(context: BaseAudioContext, scene: AudioScene): AudioModule {
    const voice = this.voiceReady() ? this.synth.create(context, scene) : null;
    const slicer = this.createSlicer(context, scene);
    const loop = this.committed?.slice.loop ?? scene.bass.slice.loop;
    slicer.setBuffer(loop ? (this.loops.get(loop) ?? null) : null);
    this.module = new BassModule(context, voice, slicer);
    return this.module;
  }

  /** Silences from `time`: the 303 drops its notes, SLICE releases its pieces. */
  flush(time: number): void {
    this.synth.flush(time);
    this.module?.slicer.flush(time);
    this.sequencer.reset();
  }

  drop(time: number): void {
    this.flush(time);
    this.synth.drop(time);
    this.module = null;
  }

  /** Schedules one step on the voice that is playing. Returns whether it sounds (the node lights). */
  play(step: number, time: number, duration: number): boolean {
    const committed = this.committed;
    if (!committed) return false;
    if (committed.voice === 'synth') return this.synth.play(step, time, duration);
    const module = this.module;
    const { slice } = committed;
    const loop = slice.loop;
    if (!module || !loop) return false;
    const buffer = this.loops.get(loop);
    if (!buffer) {
      this.loops.request(loop);
      return false;
    }
    module.slicer.setBuffer(buffer);
    // The pattern, loop and BAR are what the bar committed; SYNC, REVERSE and the knobs are live.
    const live = this.scene?.bass.slice ?? slice;
    const event = this.sequencer.step(slice.pattern, step, loop.bars, slice.bar, live.reverse, time, duration);
    if (!event) return false;
    const bpm = this.scene?.bpm ?? loop.bpm;
    module.slicer.play(this.hit(loop, event.bar, event.slice, event.reverse, time, bpm, live));
    return true;
  }

  /** The bar of the loop SLICE is playing from, when it plays. */
  sliceBar(): number | undefined {
    return this.committed?.voice === 'slice' ? this.sequencer.currentBar : undefined;
  }

  /** One piece of the loop that is in, now, with the SLICE knobs (a tap on the wave). */
  previewSlice(index: number, time: number): void {
    const module = this.module;
    const scene = this.scene;
    const slice = this.committed?.slice ?? scene?.bass.slice;
    const loop = slice?.loop;
    if (!module || !scene || !slice || !loop) return;
    const buffer = this.loops.get(loop);
    if (!buffer) {
      this.loops.request(loop);
      return;
    }
    const bar = slice.bar === 'auto' ? this.sequencer.currentBar : loopBar(slice.bar, 0, loop.bars);
    const live = scene.bass.slice;
    module.slicer.play(this.hit(loop, bar, index, live.reverse, time, scene.bpm, live), buffer);
  }

  /** The first beat of any decoded loop, now, with the SLICE knobs (a tap on the list). */
  previewLoop(loop: BassLoop, buffer: AudioBuffer, time: number): void {
    const module = this.module;
    const scene = this.scene;
    if (!module || !scene) return;
    const slice = scene.bass.slice;
    module.slicer.play(
      {
        time,
        start: 0,
        end: PREVIEW_SLICES * sliceSeconds(loop.bpm),
        rate: sliceRate(slice.sync, scene.bpm, loop.bpm, slice.pitch),
        reverse: false,
        gate: 1,
      },
      buffer,
    );
  }

  private hit(
    loop: BassLoop,
    bar: number,
    slice: number,
    reverse: boolean,
    time: number,
    bpm: number,
    knobs: SliceScene,
  ): SliceHit {
    const window = sliceWindow(loop, bar, slice);
    return {
      time,
      start: window.start,
      end: window.end,
      rate: sliceRate(knobs.sync, bpm, loop.bpm, knobs.pitch),
      reverse,
      gate: gateFraction(knobs.gate),
    };
  }
}

const idOf = (loop: BassLoop | null): string | null => (loop ? loopId(loop) : null);
