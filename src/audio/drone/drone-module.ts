import type { AudioScene, DroneScene } from '../../core/audio-scene';
import type { DronePreset } from '../../core/drone';
import { droneLayerSound } from '../../core/drone-sound';
import type { LiveEvent } from '../../core/live-events';
import { createRng } from '../../core/random';
import type { AudioModule } from '../graph';
import { DRONE_FILTER_CENTS, MOD_SOURCE } from '../modulation';
import { DroneFx, hallImpulse } from './drone-fx';
import { DroneVoice } from './drone-voice';

/** CLEAR: how fast the layers fade, seconds. */
const CLEAR_FADE = 0.03;
/** Seconds of looped noise for the NOISE preset. */
const NOISE_SECONDS = 2;

/**
 * What the DRONE node's sound does, whatever runs it. Today native Web Audio nodes
 * (DroneModule); a worklet version would implement the same and keep the rest.
 */
export interface DroneEngine {
  /** Knobs, key and tempo: every sounding layer follows at once. */
  setScene(scene: AudioScene, time: number): void;
  /** Plays a pad event (a layer starting, moving or ending, STOP, CLEAR) at `time`. */
  play(event: LiveEvent, time: number): void;
  /** Every layer fades out with its release (STOP, transport stopped). */
  stop(time: number): void;
  /** Silence in milliseconds, effect tails included (CLEAR, cable cut). */
  clear(time: number): void;
  /** Layers sounding or fading out. */
  readonly layers: number;
}

interface Layer {
  readonly preset: DronePreset;
  x: number;
  y: number;
  readonly voice: DroneVoice;
}

function noiseBuffer(context: BaseAudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * NOISE_SECONDS), context.sampleRate);
  const random = createRng(0x0015e);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
  return buffer;
}

/**
 * DRONE in the audio graph: up to six layers into the node's own delay and reverb, then
 * `output`. It makes sound rather than processing it, so `input` is unused. A layer
 * keeps the preset it started with (layers of different presets can sound together);
 * knobs, key and CAOS reach every layer.
 */
export class DroneModule implements AudioModule, DroneEngine {
  readonly input: GainNode;
  readonly output: GainNode;
  /** The LFO on FILTRO: knob units in, cents out, into every layer's filter. */
  private readonly mod: GainNode;
  private fx: DroneFx;
  private readonly impulse: AudioBuffer;
  private readonly noise: AudioBuffer;
  private readonly sounding = new Map<number, Layer>();
  private scene: DroneScene;
  private bpm: number;

  constructor(
    private readonly context: BaseAudioContext,
    scene: AudioScene,
  ) {
    this.input = context.createGain();
    this.output = context.createGain();
    this.mod = context.createGain();
    this.mod.gain.value = DRONE_FILTER_CENTS;
    this.impulse = hallImpulse(context);
    this.noise = noiseBuffer(context);
    this.scene = scene.drone;
    this.bpm = scene.bpm;
    this.fx = this.newFx(context.currentTime);
  }

  /** The LFO's cable lands on FILTRO; sound cables (none: DRONE has no input) on `input`. */
  inputFor(source: string): AudioNode {
    return source === MOD_SOURCE ? this.mod : this.input;
  }

  get layers(): number {
    return this.sounding.size;
  }

  setScene(scene: AudioScene, time: number): void {
    this.scene = scene.drone;
    if (scene.bpm !== this.bpm) {
      this.bpm = scene.bpm;
      this.fx.setTempo(scene.bpm, time);
    }
    this.retune(time);
  }

  play(event: LiveEvent, time: number): void {
    if (event.node !== 'drone') return;
    switch (event.type) {
      case 'start':
        this.start(event.layer, event.x, event.y, time);
        return;
      case 'move': {
        const layer = this.sounding.get(event.layer);
        if (!layer || layer.voice.releasing) return;
        layer.x = event.x;
        layer.y = event.y;
        layer.voice.apply(this.soundOf(layer), time);
        return;
      }
      case 'release': {
        const layer = this.sounding.get(event.layer);
        if (!layer) return;
        layer.voice.release(time, this.soundOf(layer).release);
        this.retune(time);
        return;
      }
      case 'stop':
        this.stop(time);
        return;
      case 'clear':
        this.clear(time);
        return;
    }
  }

  stop(time: number): void {
    for (const layer of this.sounding.values()) layer.voice.release(time, this.soundOf(layer).release);
  }

  /** CLEAR: every layer out in a few milliseconds, and the effect tails with them. */
  clear(time: number): void {
    for (const layer of this.sounding.values()) layer.voice.release(time, CLEAR_FADE);
    this.fx.cut(time);
    this.fx = this.newFx(time);
  }

  private start(id: number, x: number, y: number, time: number): void {
    if (this.sounding.has(id)) return;
    const preset = this.scene.preset;
    const placeholder = { preset, x, y };
    const sound = droneLayerSound(preset, this.scene, placeholder, this.active() + 1);
    const voice = new DroneVoice(
      this.context,
      this.fx,
      this.noise,
      preset,
      id,
      sound,
      time,
      () => {
        if (this.sounding.get(id)?.voice === voice) this.sounding.delete(id);
      },
      this.mod,
    );
    this.sounding.set(id, { ...placeholder, voice });
    // The others make room: each layer gets 1/√n of the level.
    this.retune(time);
  }

  /** Layers not fading out. */
  private active(): number {
    let count = 0;
    for (const layer of this.sounding.values()) if (!layer.voice.releasing) count++;
    return count;
  }

  private soundOf(layer: Layer) {
    return droneLayerSound(layer.preset, this.scene, layer, this.active());
  }

  /** Every layer that is not fading follows the knobs, the key and the layer count. */
  private retune(time: number): void {
    for (const layer of this.sounding.values()) {
      if (!layer.voice.releasing) layer.voice.apply(this.soundOf(layer), time);
    }
  }

  private newFx(time: number): DroneFx {
    const fx = new DroneFx(this.context, this.impulse, this.output);
    fx.setTempo(this.bpm, time);
    return fx;
  }

  dispose(): void {
    for (const layer of this.sounding.values()) layer.voice.dispose();
    this.sounding.clear();
    this.fx.dispose();
    this.mod.disconnect();
    this.input.disconnect();
    this.output.disconnect();
  }
}
