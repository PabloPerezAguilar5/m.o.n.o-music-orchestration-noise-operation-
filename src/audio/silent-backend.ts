import { INITIAL_AUDIO_STATUS, type AudioScene, type AudioStatus } from '../core/audio-scene';
import { BassSequencer } from '../core/bass-patterns';
import { clickAt, type Click } from '../core/metronome';
import type { NodeId } from '../core/nodes';
import { bassMidi, synthMidi } from '../core/scales';
import { LookaheadScheduler } from '../core/scheduler';
import { SynthSequencer } from '../core/synth-patterns';
import type { VoiceEvent } from '../core/voice-events';
import type { AudioBackend, StatusListener, StepListener } from './backend';

/**
 * Soundless backend for tests. Nothing runs on its own: the test moves time with
 * advanceTo(), and steps are delivered as they become due. A node counts as sounding
 * on a step when its cable is plugged in and it plays something there.
 */
export class SilentBackend implements AudioBackend {
  readonly scenes: AudioScene[] = [];
  /** Kits asked to be heard, in order. */
  readonly auditions: string[] = [];
  /** Metronome clicks, with the time the scheduler gave their step. */
  readonly clicks: { step: number; time: number; click: Click }[] = [];
  /** Voice events, as the real backend would send them to the worklets. */
  readonly bassEvents: VoiceEvent[] = [];
  readonly synthEvents: VoiceEvent[] = [];
  private readonly bassSequencer = new BassSequencer();
  private readonly synthSequencer = new SynthSequencer();
  unlocks = 0;
  private readonly scheduler = new LookaheadScheduler();
  private readonly statusListeners = new Set<StatusListener>();
  private listener: StepListener | null = null;
  private now = 0;

  get playing(): boolean {
    return this.scheduler.running;
  }

  unlock(): void {
    this.unlocks++;
  }

  start(onStep: StepListener): void {
    this.listener = onStep;
    this.scheduler.start(this.now);
  }

  stop(): void {
    this.listener = null;
    this.scheduler.stop(this.now);
    this.bassSequencer.reset();
    this.synthSequencer.reset();
  }

  update(scene: AudioScene): void {
    this.scenes.push(scene);
    this.scheduler.setBpm(scene.bpm);
  }

  audition(kit: string): void {
    this.auditions.push(kit);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Reports a status, as the real backend would. */
  emitStatus(status: AudioStatus = INITIAL_AUDIO_STATUS): void {
    for (const listener of this.statusListeners) listener(status);
  }

  /** Moves time to `now` (seconds) and delivers the steps that became due. */
  advanceTo(now: number): void {
    this.now = now;
    for (const { step, time, duration } of this.scheduler.advance(now)) {
      const scene = this.scenes.at(-1);
      const click = scene?.metronome.on ? clickAt(step) : null;
      if (click) this.clicks.push({ step, time, click });
      const sounding: NodeId[] = [];
      if (scene?.cables.includes('drum') && scene.drum.pattern.some((row) => (row[step]?.length ?? 0) > 0)) {
        sounding.push('drum');
      }
      if (scene?.cables.includes('bass')) {
        const { pattern, root, scale } = scene.bass;
        const events = this.bassSequencer.step(pattern, step, time, duration, (d) => bassMidi(root, scale, d));
        this.bassEvents.push(...events);
        if (events.some((event) => event.type === 'on')) sounding.push('bass');
      }
      if (scene?.cables.includes('synth')) {
        const { pattern, root, scale } = scene.synth;
        const events = this.synthSequencer.step(pattern, step, time, duration, (n) => synthMidi(root, scale, n));
        this.synthEvents.push(...events);
        if (events.some((event) => event.type === 'on')) sounding.push('synth');
      }
      this.listener?.({ step, sounding });
    }
  }
}
