import { DroneLayers, type DroneLayerEvent, type DroneLayer } from '../core/drone';
import { DRONE_CHARACTERS, droneReleaseTime } from '../core/drone-sound';
import type { Point } from '../core/geometry';
import { LeadNotes, leadMidi, leadReleaseTime, leadVariation, type LeadNoteEvent } from '../core/lead';
import type { LiveEvent } from '../core/live-events';
import { MACRO_PARAM, type NodeId } from '../core/nodes';
import { reachesMaster } from '../core/routing';
import { createRng, randomSeed, type RandomSource } from '../core/random';
import { Emitter, type Source } from './emitter';
import type { Store } from './store';
import type { AppState } from './types';

/** What is being played by hand right now. Never stored or saved. */
export interface LiveState {
  /** LEAD keys held down (or latched by HOLD), as semitones above the keyboard's first C. */
  readonly keys: ReadonlySet<number>;
  /** DRONE layers sounding, oldest first. */
  readonly layers: readonly DroneLayer[];
}

/** How the live instruments light their node on the canvas. */
export interface Lights {
  pulse(id: NodeId, ms: number): void;
  hold(id: NodeId, on: boolean): void;
}

export type LiveListener = (event: LiveEvent) => void;

/** A node stays lit after its sound is let go for the release tail, within these bounds. */
const MIN_TAIL_MS = 80;
const MAX_TAIL_MS = 3000;
/** The release time constant: the tail is gone after about this many. */
const TAIL_SPANS = 4;

const tailMs = (seconds: number): number => Math.min(MAX_TAIL_MS, Math.max(MIN_TAIL_MS, seconds * 1000));

/** On the canvas, its sound reaching MASTER through plugged-in cables (maybe through an effect). */
const plays = (state: AppState, id: NodeId): boolean => reachesMaster(state.cables, state.added, id);

/**
 * The live instruments, LEAD and DRONE: touches in, live events out. The panel reports
 * fingers (keys pressed, the pad touched); this turns them into notes and layers with
 * the store's settings (octave, SCALE LOCK, key, CAOS, TOUCH or HOLD) and hands the
 * events to whoever listens (the audio, through audio-link).
 *
 * Nothing is ever left hanging: cutting a node's cable, taking it off the canvas or
 * stopping the transport releases every note and layer it had sounding (DRONE: a cut
 * cable or a removed node silences at once, tails included; a stop lets them fade).
 */
export class Live extends Emitter implements Source<LiveState> {
  private state: LiveState = { keys: new Set(), layers: [] };
  private readonly notes = new LeadNotes();
  /** Finger → LEAD key under it. */
  private readonly fingers = new Map<number, number>();
  /** The key whose note HOLD keeps sounding after its finger lifted. */
  private latchedKey: number | null = null;
  private readonly layers = new DroneLayers();
  private readonly eventListeners = new Set<LiveListener>();
  private previous: AppState;
  private readonly lit = { lead: false, drone: false };

  constructor(
    private readonly store: Store,
    private readonly lights: Lights,
    private readonly random: RandomSource = createRng(randomSeed()),
  ) {
    super();
    this.previous = store.getState();
    store.subscribe(this.onStore);
  }

  readonly getState = (): LiveState => this.state;

  /** Live events as they happen. Returns an unsubscribe function. */
  listen(listener: LiveListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  // LEAD -----------------------------------------------------------------------------------------

  /** A finger goes down on a key. */
  keyDown(touch: number, semitone: number): void {
    const state = this.store.getState();
    if (!state.added.includes('lead')) return;
    const { midi, accent } = this.leadNote(state, semitone);
    this.fingers.set(touch, semitone);
    this.latchedKey = null;
    this.sendLead(this.notes.press(touch, midi, accent));
  }

  /** A finger slides onto another key: the note glides there. */
  keyMove(touch: number, semitone: number): void {
    if (!this.fingers.has(touch) || this.fingers.get(touch) === semitone) return;
    this.fingers.set(touch, semitone);
    this.sendLead(this.notes.move(touch, this.leadNote(this.store.getState(), semitone).midi));
  }

  /** A finger lifts. With HOLD on, the last one leaves its note sounding. */
  keyUp(touch: number): void {
    const semitone = this.fingers.get(touch);
    if (semitone === undefined) return;
    this.fingers.delete(touch);
    const events = this.notes.release(touch, this.store.getState().lead.hold);
    if (this.notes.latched) this.latchedKey = semitone;
    this.sendLead(events);
  }

  private leadNote(state: AppState, semitone: number): { midi: number; accent: boolean } {
    const { octave, scaleLock } = state.lead;
    const base = leadMidi(semitone, octave, state.key.root, state.key.scale, scaleLock);
    const variation = leadVariation(this.random, state.params.lead[MACRO_PARAM] ?? 0, scaleLock);
    return { midi: base + variation.offset, accent: variation.accent };
  }

  private sendLead(events: LeadNoteEvent[]): void {
    this.send(events.map((event) => ({ node: 'lead', ...event })));
    this.changed();
  }

  /** Every LEAD note off at once. */
  private releaseLead(): void {
    if (!this.notes.playing && this.fingers.size === 0) return;
    this.fingers.clear();
    this.latchedKey = null;
    this.notes.releaseAll();
    this.send([{ node: 'lead', type: 'panic' }]);
  }

  // DRONE ----------------------------------------------------------------------------------------

  /** A finger touches the pad: a new layer (both axes 0..1 from the top-left corner). */
  padDown(touch: number, point: Point): void {
    if (!this.store.getState().added.includes('drone')) return;
    this.sendDrone(this.layers.press(touch, point));
  }

  padMove(touch: number, point: Point): void {
    this.sendDrone(this.layers.move(touch, point));
  }

  /** The finger lifts: in TOUCH its layer ends, in HOLD it keeps sounding. */
  padUp(touch: number): void {
    this.sendDrone(this.layers.lift(touch, this.store.getState().drone.mode));
  }

  /** STOP: every layer fades out with its release. */
  stopDrone(): void {
    this.layers.releaseAll();
    this.send([{ node: 'drone', type: 'stop' }]);
    this.changed();
  }

  /** CLEAR: silence now, the effect tails too. */
  clearDrone(): void {
    this.layers.releaseAll();
    this.send([{ node: 'drone', type: 'clear' }]);
    this.changed();
  }

  private sendDrone(events: DroneLayerEvent[]): void {
    if (events.length === 0) return;
    this.send(events.map((event) => ({ node: 'drone', ...event })));
    this.changed();
  }

  // Store ----------------------------------------------------------------------------------------

  private readonly onStore = (): void => {
    const next = this.store.getState();
    const previous = this.previous;
    this.previous = next;
    const stopped = previous.transport.playing && !next.transport.playing;
    if (stopped || (plays(previous, 'lead') && !plays(next, 'lead'))) this.releaseLead();
    if (previous.lead.hold && !next.lead.hold) {
      this.latchedKey = null;
      this.send(this.notes.releaseLatched().map((event) => ({ node: 'lead', ...event })));
    }
    // Unheard (cable cut, node removed): silence at once, so nothing is left to come back
    // when the cable is plugged in again. Transport stopped: the layers fade with their release.
    const unplugged = plays(previous, 'drone') && !plays(next, 'drone');
    if ((stopped || unplugged) && this.layers.list.length > 0) {
      this.layers.releaseAll();
      this.send([{ node: 'drone', type: unplugged ? 'clear' : 'stop' }]);
    }
    if (previous.drone.mode === 'hold' && next.drone.mode === 'touch') {
      const held = this.layers.releaseHeld();
      this.send(held.map((event) => ({ node: 'drone', ...event })));
    }
    this.changed();
  };

  // State and lights -----------------------------------------------------------------------------

  private send(events: readonly LiveEvent[]): void {
    for (const event of events) for (const listener of [...this.eventListeners]) listener(event);
  }

  private changed(): void {
    const keys = new Set(this.fingers.values());
    if (this.latchedKey !== null) keys.add(this.latchedKey);
    const layers = this.layers.list;
    const sameKeys = keys.size === this.state.keys.size && [...keys].every((key) => this.state.keys.has(key));
    if (!sameKeys || layers !== this.state.layers) {
      this.state = { keys: sameKeys ? this.state.keys : keys, layers };
      this.emit();
    }
    const state = this.store.getState();
    this.light('lead', this.notes.playing && plays(state, 'lead'), () =>
      tailMs(leadReleaseTime(state.params.lead.release ?? 0) * TAIL_SPANS),
    );
    this.light('drone', layers.length > 0 && plays(state, 'drone'), () =>
      tailMs(droneReleaseTime(state.params.drone.release ?? 0) * DRONE_CHARACTERS[state.drone.preset].releaseScale),
    );
  }

  /** Lit while sounding; once let go, for its tail (only if the sound still reaches MASTER). */
  private light(id: 'lead' | 'drone', sounding: boolean, tail: () => number): void {
    if (this.lit[id] === sounding) return;
    this.lit[id] = sounding;
    this.lights.hold(id, sounding);
    if (!sounding && plays(this.store.getState(), id)) this.lights.pulse(id, tail());
  }
}
