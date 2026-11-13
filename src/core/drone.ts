import { clamp01, type Point } from './geometry';
import { DEGREES, ROOTS, scaleMidi, type ScaleId } from './scales';

/**
 * DRONE/NOISE, the live texture pad (from fck-synth's synthPad.ts): where the pad is
 * touched decides the note, and each touch is a layer, up to six. Pure TypeScript: the
 * UI feeds it touches, the audio receives the layer events.
 */

export const DRONE_PRESETS = ['drone', 'pad', 'glass', 'noise', 'alien'] as const;
export type DronePreset = (typeof DRONE_PRESETS)[number];

/** TOUCH: a layer sounds while the finger is down. HOLD: it keeps sounding after. */
export const DRONE_MODES = ['touch', 'hold'] as const;
export type DroneMode = (typeof DRONE_MODES)[number];

export const DRONE_MAX_LAYERS = 6;

/** Bottom of the pad's range: the tonic of C2. */
export const DRONE_BASE_MIDI = 36;
/** Notes across the pad: three octaves of the scale plus the top tonic. */
export const DRONE_PAD_NOTES = DEGREES * 3 + 1;

/**
 * MIDI note at a horizontal position (0 = left … 1 = right), on the shared key. Rising
 * from left to right; fck-synth ran each octave downwards, which reads backwards on a pad.
 */
export function droneMidi(x: number, root: number, scale: ScaleId): number {
  const index = Math.round(clamp01(x) * (DRONE_PAD_NOTES - 1));
  return scaleMidi(DRONE_BASE_MIDI, root, scale, index);
}

/**
 * Name of the note at a position, e.g. "Eb". Without its octave: some presets play an
 * octave above the pad.
 */
export const droneNoteName = (x: number, root: number, scale: ScaleId): string =>
  ROOTS[droneMidi(x, root, scale) % 12]!;

// Layers -----------------------------------------------------------------------------------------

export interface DroneLayer {
  readonly id: number;
  /** Pad position, both axes 0..1 from the top-left corner. */
  readonly x: number;
  readonly y: number;
  /** The finger on it, or null once lifted in HOLD. */
  readonly touch: number | null;
}

/** What the pad asks of the DRONE sound. */
export type DroneLayerEvent =
  | { readonly type: 'start'; readonly layer: number; readonly x: number; readonly y: number }
  | { readonly type: 'move'; readonly layer: number; readonly x: number; readonly y: number }
  | { readonly type: 'release'; readonly layer: number };

/**
 * The layers sounding on the pad, oldest first. A touch starts a layer; in TOUCH it
 * ends when the finger lifts, in HOLD it stays. With six sounding, a new touch takes
 * the place of the oldest held layer; with six fingers down it is ignored.
 */
export class DroneLayers {
  private layers: DroneLayer[] = [];
  private nextId = 1;

  get list(): readonly DroneLayer[] {
    return this.layers;
  }

  press(touch: number, point: Point): DroneLayerEvent[] {
    if (this.layers.some((layer) => layer.touch === touch)) return this.move(touch, point);
    const events: DroneLayerEvent[] = [];
    if (this.layers.length >= DRONE_MAX_LAYERS) {
      const oldest = this.layers.find((layer) => layer.touch === null);
      if (!oldest) return [];
      this.layers = this.layers.filter((layer) => layer !== oldest);
      events.push({ type: 'release', layer: oldest.id });
    }
    const layer: DroneLayer = { id: this.nextId++, x: clamp01(point.x), y: clamp01(point.y), touch };
    this.layers = [...this.layers, layer];
    events.push({ type: 'start', layer: layer.id, x: layer.x, y: layer.y });
    return events;
  }

  move(touch: number, point: Point): DroneLayerEvent[] {
    const layer = this.layers.find((other) => other.touch === touch);
    if (!layer) return [];
    const moved: DroneLayer = { ...layer, x: clamp01(point.x), y: clamp01(point.y) };
    if (moved.x === layer.x && moved.y === layer.y) return [];
    this.layers = this.layers.map((other) => (other === layer ? moved : other));
    return [{ type: 'move', layer: moved.id, x: moved.x, y: moved.y }];
  }

  /** The finger lifts: in TOUCH the layer ends, in HOLD it stays where it was. */
  lift(touch: number, mode: DroneMode): DroneLayerEvent[] {
    const layer = this.layers.find((other) => other.touch === touch);
    if (!layer) return [];
    if (mode === 'hold') {
      this.layers = this.layers.map((other) => (other === layer ? { ...layer, touch: null } : other));
      return [];
    }
    this.layers = this.layers.filter((other) => other !== layer);
    return [{ type: 'release', layer: layer.id }];
  }

  /** Ends the layers no finger is on (switching from HOLD to TOUCH). */
  releaseHeld(): DroneLayerEvent[] {
    const held = this.layers.filter((layer) => layer.touch === null);
    this.layers = this.layers.filter((layer) => layer.touch !== null);
    return held.map((layer) => ({ type: 'release', layer: layer.id }));
  }

  /** Ends every layer (STOP, CLEAR, cable cut, node removed, transport stopped). */
  releaseAll(): DroneLayerEvent[] {
    const all = this.layers;
    this.layers = [];
    return all.map((layer) => ({ type: 'release', layer: layer.id }));
  }
}
