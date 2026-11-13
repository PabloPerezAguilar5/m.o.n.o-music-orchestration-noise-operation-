import { beforeEach, describe, expect, it } from 'vitest';
import { createLeadEngine, leadParamsFromScene } from '../../src/audio/lead/lead-voice';
import { SilentBackend } from '../../src/audio/silent-backend';
import { DRONE_MAX_LAYERS, DroneLayers, droneMidi, DRONE_PAD_NOTES } from '../../src/core/drone';
import { droneLayerSound, driftRates, type DroneKnobs } from '../../src/core/drone-sound';
import {
  inScale,
  LEAD_BASE_MIDI,
  leadGlideTime,
  leadMidi,
  LeadNotes,
  leadVariation,
  lockToScale,
} from '../../src/core/lead';
import type { LiveEvent } from '../../src/core/live-events';
import type { NodeId } from '../../src/core/nodes';
import { createRng } from '../../src/core/random';
import { SCALE_IDS, SCALE_INTERVALS } from '../../src/core/scales';
import { linkAudio } from '../../src/state/audio-link';
import { Live, type Lights } from '../../src/state/live';
import { Store } from '../../src/state/store';
import { Activity } from '../../src/state/activity';

describe('escala: SCALE LOCK y el pad', () => {
  it('SCALE LOCK lleva cada nota a la más cercana de la escala; a mitad de camino, abajo', () => {
    // C penta menor: C Eb F G Bb.
    const locked = Array.from({ length: 13 }, (_, i) => lockToScale(60 + i, 0, 'pentaMinor') - 60);
    expect(locked).toEqual([0, 0, 3, 3, 3, 5, 5, 7, 7, 10, 10, 10, 12]);
    // A note of the scale stays where it is, in every key.
    for (const scale of SCALE_IDS) {
      for (let root = 0; root < 12; root++) {
        for (const interval of SCALE_INTERVALS[scale]) {
          const midi = 48 + root + interval;
          expect(inScale(midi, root, scale)).toBe(true);
          expect(lockToScale(midi, root, scale)).toBe(midi);
        }
        // Every key lands in the scale, at most two semitones away.
        for (let midi = 40; midi < 80; midi++) {
          const note = lockToScale(midi, root, scale);
          expect(inScale(note, root, scale)).toBe(true);
          expect(Math.abs(note - midi)).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('el teclado arranca en C4, se mueve de a octava y respeta SCALE LOCK', () => {
    expect(leadMidi(0, 0, 0, 'pentaMinor', false)).toBe(LEAD_BASE_MIDI);
    expect(leadMidi(24, 0, 0, 'pentaMinor', false)).toBe(84); // C6, the top key
    expect(leadMidi(1, 1, 0, 'pentaMinor', false)).toBe(73);
    expect(leadMidi(0, -9, 0, 'major', false)).toBe(24); // clamped to OCT −3 (C1)
    expect(leadMidi(1, 0, 0, 'pentaMinor', true)).toBe(60); // C# → C
    expect(leadMidi(4, 0, 2, 'major', true)).toBe(64); // E belongs to D major (D E F# A C#)
  });

  it('el eje X del pad sube por la escala compartida, de C2 a tres octavas más', () => {
    expect(DRONE_PAD_NOTES).toBe(16);
    expect(droneMidi(0, 0, 'pentaMinor')).toBe(36);
    expect(droneMidi(1, 0, 'pentaMinor')).toBe(72);
    const notes = Array.from({ length: 101 }, (_, i) => droneMidi(i / 100, 2, 'dorian'));
    for (let i = 1; i < notes.length; i++) expect(notes[i]!).toBeGreaterThanOrEqual(notes[i - 1]!);
    expect(new Set(notes).size).toBe(16);
    for (const note of notes) expect(inScale(note, 2, 'dorian')).toBe(true);
  });
});

describe('multitoque del LEAD (voz mono)', () => {
  it('el último dedo suena; levantarlo vuelve al anterior sin redisparar; el último suelta la nota', () => {
    const notes = new LeadNotes();
    const [a] = notes.press(1, 60);
    expect(a).toMatchObject({ type: 'on', midi: 60, legato: false });
    const [b] = notes.press(2, 64);
    expect(b).toMatchObject({ type: 'on', midi: 64, legato: true });
    const [c] = notes.press(3, 67);
    expect(c).toMatchObject({ type: 'on', midi: 67, legato: true });
    expect(notes.fingers).toBe(3);

    // A finger under the sounding one lifts: nothing changes.
    expect(notes.release(2)).toEqual([]);
    // The sounding one lifts: back to the one still down, gliding.
    const [back] = notes.release(3);
    expect(back).toMatchObject({ type: 'on', midi: 60, legato: true });
    // The last one lifts: the note is released, by its own id.
    const [off] = notes.release(1);
    expect(off).toEqual({ type: 'off', id: back!.type === 'on' ? back!.id : -1 });
    expect(notes.playing).toBe(false);
    expect(notes.release(1)).toEqual([]);
  });

  it('deslizar el dedo a otra tecla cambia la nota en legato; cada nota tiene su id', () => {
    const notes = new LeadNotes();
    const [first] = notes.press(7, 60);
    const [slid] = notes.move(7, 62);
    expect(slid).toMatchObject({ type: 'on', midi: 62, legato: true });
    expect(notes.move(7, 62)).toEqual([]);
    expect(notes.move(99, 70)).toEqual([]); // a finger that is not down
    const ids = [first, slid].map((event) => (event!.type === 'on' ? event!.id : 0));
    expect(new Set(ids).size).toBe(2);
    expect(notes.releaseAll()).toEqual([{ type: 'off', id: ids[1] }]);
    expect(notes.releaseAll()).toEqual([]);
  });

  it('HOLD: el último dedo deja su nota sonando; una tecla nueva la reemplaza redisparando', () => {
    const notes = new LeadNotes();
    notes.press(1, 60);
    notes.press(2, 64);
    expect(notes.release(1, true)).toEqual([]); // not the sounding finger
    expect(notes.release(2, true)).toEqual([]); // the last one: latched
    expect(notes.latched).toBe(true);
    expect(notes.playing).toBe(true);
    // A new key over the latched note retriggers it (no finger was down).
    const [next] = notes.press(3, 67);
    expect(next).toMatchObject({ type: 'on', midi: 67, legato: false });
    expect(notes.latched).toBe(false);
    // With a finger down, HOLD let go changes nothing.
    expect(notes.releaseLatched()).toEqual([]);
    notes.release(3, true);
    const [off] = notes.releaseLatched();
    expect(off).toEqual({ type: 'off', id: next!.type === 'on' ? next!.id : -1 });
    expect(notes.playing).toBe(false);
    expect(notes.releaseLatched()).toEqual([]);
  });

  it('CAOS en 0 toca exactamente lo apretado; arriba agrega acentos, saltos y desafinación', () => {
    const random = createRng(1);
    for (let i = 0; i < 50; i++) expect(leadVariation(random, 0, false)).toEqual({ offset: 0, accent: false });
    const wild = Array.from({ length: 400 }, () => leadVariation(random, 1, false));
    expect(wild.some((v) => v.accent)).toBe(true);
    expect(wild.some((v) => Math.abs(v.offset) >= 11)).toBe(true);
    expect(wild.some((v) => v.offset !== 0 && Math.abs(v.offset) < 1)).toBe(true);
    // With SCALE LOCK, CAOS never leaves the scale: only whole octaves.
    for (const v of Array.from({ length: 200 }, () => leadVariation(random, 1, true))) {
      expect(Math.abs(v.offset % 12)).toBe(0);
    }
  });
});

describe('capas del DRONE', () => {
  it('hasta seis; en HOLD siguen al soltar y una séptima reemplaza a la más vieja sostenida', () => {
    const layers = new DroneLayers();
    for (let touch = 1; touch <= DRONE_MAX_LAYERS; touch++) {
      const [start] = layers.press(touch, { x: touch / 10, y: 0.5 });
      expect(start).toMatchObject({ type: 'start', x: touch / 10, y: 0.5 });
      expect(layers.lift(touch, 'hold')).toEqual([]);
    }
    expect(layers.list).toHaveLength(6);
    expect(layers.list.every((layer) => layer.touch === null)).toBe(true);

    const oldest = layers.list[0]!.id;
    const events = layers.press(7, { x: 0.9, y: 0.1 });
    expect(events.map((e) => e.type)).toEqual(['release', 'start']);
    expect(events[0]).toEqual({ type: 'release', layer: oldest });
    expect(layers.list).toHaveLength(6);
  });

  it('con seis dedos apoyados, un toque más se ignora', () => {
    const layers = new DroneLayers();
    for (let touch = 1; touch <= 6; touch++) layers.press(touch, { x: 0.5, y: 0.5 });
    expect(layers.press(7, { x: 0.5, y: 0.5 })).toEqual([]);
    expect(layers.list).toHaveLength(6);
  });

  it('en TOUCH la capa termina al soltar; mover la arrastra; volver a TOUCH suelta las sostenidas', () => {
    const layers = new DroneLayers();
    layers.press(1, { x: 0.2, y: 0.2 });
    expect(layers.move(1, { x: 2, y: -1 })).toEqual([{ type: 'move', layer: 1, x: 1, y: 0 }]);
    expect(layers.move(1, { x: 1, y: 0 })).toEqual([]);
    expect(layers.lift(1, 'touch')).toEqual([{ type: 'release', layer: 1 }]);
    expect(layers.list).toHaveLength(0);

    layers.press(2, { x: 0.3, y: 0.3 });
    layers.lift(2, 'hold');
    layers.press(3, { x: 0.6, y: 0.6 }); // still touched
    expect(layers.releaseHeld()).toEqual([{ type: 'release', layer: 2 }]);
    expect(layers.list.map((layer) => layer.touch)).toEqual([3]);
    expect(layers.releaseAll()).toEqual([{ type: 'release', layer: 3 }]);
    expect(layers.list).toHaveLength(0);
  });

  it('el eje Y abre el filtro y agrega movimiento; las capas se reparten el nivel; CAOS las hace derivar', () => {
    const knobs: DroneKnobs = { filter: 0.5, attack: 0.3, release: 0.4, detune: 0.3, volume: 0.7, chaos: 0, root: 0, scale: 'pentaMinor' };
    const top = droneLayerSound('drone', knobs, { x: 0.5, y: 0 }, 1);
    const bottom = droneLayerSound('drone', knobs, { x: 0.5, y: 1 }, 1);
    expect(top.cutoff).toBeGreaterThan(bottom.cutoff * 4);
    expect(top.lfoCutoff).toBeGreaterThan(0);
    expect(bottom.lfoCutoff).toBe(0);
    expect(top.lfoRate).toBeGreaterThan(bottom.lfoRate);
    expect(top.driftPitch).toBe(0);

    const six = droneLayerSound('drone', knobs, { x: 0.5, y: 0.5 }, 6);
    const one = droneLayerSound('drone', knobs, { x: 0.5, y: 0.5 }, 1);
    expect(six.gain).toBeCloseTo(one.gain / Math.sqrt(6));
    expect(droneLayerSound('drone', { ...knobs, chaos: 1 }, { x: 0.5, y: 0.5 }, 1).driftPitch).toBeGreaterThan(0);
    // Each layer drifts at its own pace.
    expect(driftRates(1)).not.toEqual(driftRates(2));
    // PAD plays an octave above the pad's note.
    expect(droneLayerSound('pad', knobs, { x: 0, y: 0.5 }, 1).frequency).toBeCloseTo(130.81, 1); // C3, not C2
  });
});

describe('GLIDE (portamento del LEAD)', () => {
  const render = (engine: ReturnType<typeof createLeadEngine>, seconds: number) => {
    const out = new Float32Array(Math.round(48_000 * seconds));
    engine.render(out, 0, out.length);
  };
  const params = (glide: number) =>
    leadParamsFromScene({ wave: 0.3, cutoff: 0.6, resonance: 0.3, attack: 0.05, release: 0.3, glide });

  it('en 0 la nota salta; arriba cada nota nueva se desliza desde la anterior', () => {
    expect(leadGlideTime(0)).toBe(0);
    expect(leadGlideTime(1)).toBeGreaterThan(0.5);

    const jump = createLeadEngine(48_000);
    jump.setParams(params(0));
    jump.noteOn(1, 60, false, false);
    render(jump, 0.05);
    jump.noteOff(1);
    render(jump, 0.05);
    jump.noteOn(2, 72, false, false);
    render(jump, 0.01);
    expect(jump.frequency).toBeCloseTo(523.25, 0);

    const glide = createLeadEngine(48_000);
    glide.setParams(params(0.6));
    glide.noteOn(1, 60, false, false);
    render(glide, 0.05);
    glide.noteOff(1);
    render(glide, 0.05);
    glide.noteOn(2, 72, false, false);
    render(glide, 0.01);
    expect(glide.frequency).toBeGreaterThan(262);
    expect(glide.frequency).toBeLessThan(400); // still on its way up
    render(glide, 1.5);
    expect(glide.frequency).toBeCloseTo(523.25, 0);
  });
});

describe('liberación en el motor de voz', () => {
  it('allOff respeta el RELEASE; allOff duro (cable cortado) calla en milisegundos', () => {
    const rms = (engine: ReturnType<typeof createLeadEngine>, seconds: number) => {
      const out = new Float32Array(Math.round(48_000 * seconds));
      engine.render(out, 0, out.length);
      return Math.sqrt(out.reduce((sum, x) => sum + x * x, 0) / out.length);
    };
    const longRelease = leadParamsFromScene({ wave: 0.3, cutoff: 0.6, resonance: 0.3, attack: 0, release: 1, glide: 0 });
    const soft = createLeadEngine(48_000);
    const hard = createLeadEngine(48_000);
    for (const engine of [soft, hard]) {
      engine.setParams(longRelease);
      engine.noteOn(1, 60, false, false);
      rms(engine, 0.1);
    }
    soft.allOff();
    hard.allOff(true);
    rms(soft, 0.03);
    rms(hard, 0.03);
    expect(rms(soft, 0.05)).toBeGreaterThan(0.01); // RELEASE at full: still ringing
    expect(rms(hard, 0.05)).toBe(0);
    expect(hard.sounding).toBe(false);
    // The next note plays normally again.
    hard.noteOn(2, 62, false, false);
    rms(hard, 0.05);
    expect(rms(hard, 0.05)).toBeGreaterThan(0.01);
  });
});

describe('Live: liberación (nada queda colgado)', () => {
  let store: Store;
  let events: LiveEvent[];
  let lit: Map<NodeId, boolean>;
  let pulses: NodeId[];
  let live: Live;

  beforeEach(() => {
    store = new Store();
    events = [];
    lit = new Map();
    pulses = [];
    const lights: Lights = {
      pulse: (id) => pulses.push(id),
      hold: (id, on) => lit.set(id, on),
    };
    live = new Live(store, lights, createRng(3));
    live.listen((event) => events.push(event));
  });

  const leadOn = () => events.filter((e) => e.node === 'lead' && e.type === 'on');

  it('sin el nodo en el lienzo, las teclas y el pad no hacen nada', () => {
    live.keyDown(1, 0);
    live.padDown(1, { x: 0.5, y: 0.5 });
    expect(events).toEqual([]);
  });

  it('una tecla suena con la octava y SCALE LOCK del store, y el nodo se enciende solo mientras suena', () => {
    store.addNode('lead');
    store.setParam('lead', 'chaos', 0);
    store.nudgeLeadOctave(-1);
    store.toggleScaleLock();
    live.keyDown(1, 1); // C#3 → C3 under C penta menor
    expect(leadOn()[0]).toMatchObject({ midi: 48, legato: false });
    expect(live.getState().keys).toEqual(new Set([1]));
    expect(lit.get('lead')).toBe(true);
    live.keyUp(1);
    expect(events.at(-1)).toMatchObject({ node: 'lead', type: 'off' });
    expect(lit.get('lead')).toBe(false);
    expect(pulses).toContain('lead'); // the release tail
    expect(live.getState().keys.size).toBe(0);
  });

  it('HOLD deja sonar la nota soltada (tecla y nodo encendidos) hasta apagar HOLD', () => {
    store.addNode('lead');
    store.toggleLeadHold();
    live.keyDown(1, 4);
    live.keyUp(1);
    expect(events.filter((e) => e.type === 'off')).toEqual([]);
    expect(live.getState().keys).toEqual(new Set([4]));
    expect(lit.get('lead')).toBe(true);
    // Another key replaces it, then stays.
    live.keyDown(2, 7);
    live.keyUp(2);
    expect(live.getState().keys).toEqual(new Set([7]));
    expect(events.filter((e) => e.type === 'off')).toEqual([]);
    // HOLD off: the note goes with its release.
    store.toggleLeadHold();
    expect(events.at(-1)).toMatchObject({ node: 'lead', type: 'off' });
    expect(live.getState().keys.size).toBe(0);
    expect(lit.get('lead')).toBe(false);
  });

  it('con HOLD, cortar el cable o parar el transporte también suelta la nota sostenida', () => {
    store.addNode('lead');
    store.toggleLeadHold();
    for (const cut of [() => store.toggleCable('lead'), () => store.togglePlay()]) {
      if (store.getState().unplugged.includes('lead')) store.toggleCable('lead');
      if (!store.getState().transport.playing) store.togglePlay();
      events = [];
      live.keyDown(1, 0);
      live.keyUp(1);
      cut();
      expect(events.at(-1)).toEqual({ node: 'lead', type: 'panic' });
      expect(live.getState().keys.size).toBe(0);
      expect(lit.get('lead')).toBe(false);
    }
  });

  it('cortar el cable, sacar el nodo o parar el transporte suelta las notas del LEAD', () => {
    store.addNode('lead');
    for (const cut of [
      () => store.toggleCable('lead'),
      () => store.removeNode('lead'),
      () => store.togglePlay(),
    ]) {
      if (!store.getState().added.includes('lead')) store.addNode('lead');
      if (store.getState().unplugged.includes('lead')) store.toggleCable('lead');
      if (!store.getState().transport.playing) store.togglePlay();
      events = [];
      live.keyDown(1, 0);
      live.keyDown(2, 4);
      pulses = [];
      cut();
      expect(events.at(-1)).toEqual({ node: 'lead', type: 'panic' });
      expect(live.getState().keys.size).toBe(0);
      expect(lit.get('lead')).toBe(false);
      // Lifting the fingers afterwards sends nothing more.
      const sent = events.length;
      live.keyUp(1);
      live.keyUp(2);
      expect(events).toHaveLength(sent);
    }
  });

  it('el LEAD suena con el transporte detenido (se toca en vivo)', () => {
    store.addNode('lead');
    store.togglePlay();
    expect(store.getState().transport.playing).toBe(false);
    live.keyDown(1, 0);
    expect(leadOn()).toHaveLength(1);
  });

  it('DRONE: TOUCH y HOLD, STOP y CLEAR, y el nodo encendido mientras haya capas', () => {
    store.addNode('drone');
    live.padDown(1, { x: 0.5, y: 0.5 });
    expect(events.at(-1)).toMatchObject({ node: 'drone', type: 'start' });
    expect(lit.get('drone')).toBe(true);
    live.padUp(1);
    expect(events.at(-1)).toMatchObject({ node: 'drone', type: 'release' });
    expect(lit.get('drone')).toBe(false);

    store.setDroneMode('hold');
    live.padDown(2, { x: 0.2, y: 0.2 });
    live.padUp(2);
    live.padDown(3, { x: 0.8, y: 0.8 });
    live.padUp(3);
    expect(live.getState().layers).toHaveLength(2);
    expect(lit.get('drone')).toBe(true);
    live.stopDrone();
    expect(events.at(-1)).toEqual({ node: 'drone', type: 'stop' });
    expect(live.getState().layers).toHaveLength(0);
    expect(lit.get('drone')).toBe(false);

    live.padDown(4, { x: 0.4, y: 0.4 });
    live.padUp(4);
    live.clearDrone();
    expect(events.at(-1)).toEqual({ node: 'drone', type: 'clear' });
    expect(live.getState().layers).toHaveLength(0);
  });

  it('volver a TOUCH suelta las capas sostenidas; cable, quitar nodo o stop sueltan todas', () => {
    store.addNode('drone');
    store.setDroneMode('hold');
    live.padDown(1, { x: 0.3, y: 0.3 });
    live.padUp(1);
    live.padDown(2, { x: 0.6, y: 0.6 }); // finger still down
    store.setDroneMode('touch');
    expect(events.at(-1)).toMatchObject({ node: 'drone', type: 'release' });
    expect(live.getState().layers).toHaveLength(1);

    const cuts: [() => void, string][] = [
      [() => store.toggleCable('drone'), 'clear'], // unheard: silence now, tails included
      [() => store.removeNode('drone'), 'clear'],
      [() => store.togglePlay(), 'stop'], // the layers fade with their release
    ];
    for (const [cut, type] of cuts) {
      if (!store.getState().added.includes('drone')) store.addNode('drone');
      if (store.getState().unplugged.includes('drone')) store.toggleCable('drone');
      if (!store.getState().transport.playing) store.togglePlay();
      store.setDroneMode('hold');
      live.padDown(9, { x: 0.5, y: 0.5 });
      live.padUp(9);
      cut();
      expect(events.at(-1)).toEqual({ node: 'drone', type });
      expect(live.getState().layers).toHaveLength(0);
      expect(lit.get('drone')).toBe(false);
    }
  });

  it('audio-link lleva los eventos en vivo al backend', () => {
    const backend = new SilentBackend();
    const activity = new Activity();
    const linked = new Live(store, { pulse: () => {}, hold: (id, on) => activity.hold(id, on) }, createRng(1));
    linkAudio(store, backend, () => {}, undefined, linked);
    store.addNode('lead');
    linked.keyDown(5, 7);
    linked.keyUp(5);
    expect(backend.live.map((e) => e.type)).toEqual(['on', 'off']);
    expect(backend.scenes.at(-1)!.master.leadLevel).toBeGreaterThan(0);
  });
});

describe('Activity: encendido sostenido', () => {
  it('hold mantiene el nodo encendido hasta soltarlo', () => {
    const activity = new Activity();
    activity.hold('lead', true);
    expect(activity.getState().has('lead')).toBe(true);
    activity.hold('lead', false);
    expect(activity.getState().has('lead')).toBe(false);
  });
});
