import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioGraph, CABLE_FADE, type AudioModule } from '../../src/audio/graph';
import { MOD_SOURCE } from '../../src/audio/modulation';
import { modulatedValue, MOD_TARGETS } from '../../src/core/lfo';
import {
  cableKind,
  connect,
  createsLoop,
  reachesMaster,
  toggleCut,
  withoutNode,
  type Cable,
} from '../../src/core/routing';
import { createRng } from '../../src/core/random';
import { Live, type Lights } from '../../src/state/live';
import { sceneFromState } from '../../src/state/scene';
import { Store } from '../../src/state/store';
import type { LiveEvent } from '../../src/core/live-events';
import { FakeContext, FakeModule, FakeNode, reaches, type FakeGain } from './fake-audio';

const plugged = (from: Cable['from'], to: Cable['to']): Cable => ({ from, to, cut: false });

describe('ruteo: reglas de los cables', () => {
  it('un generador entra en un efecto o en MASTER; nunca en otro generador ni en el LFO', () => {
    expect(cableKind('bass', 'dist')).toBe('audio');
    expect(cableKind('bass', 'master')).toBe('audio');
    expect(cableKind('dist', 'master')).toBe('audio');
    expect(cableKind('bass', 'drum')).toBe('no-input');
    expect(cableKind('bass', 'lfo')).toBe('no-input');
    expect(cableKind('master', 'dist')).toBe('no-output');
  });

  it('el LFO modula lo que suena, nunca el MASTER ni a sí mismo', () => {
    for (const id of ['synth', 'bass', 'lead', 'drone', 'dist', 'drum'] as const) expect(cableKind('lfo', id)).toBe('mod');
    expect(cableKind('lfo', 'master')).toBe('no-input');
    expect(cableKind('lfo', 'lfo')).toBe('no-input');
    // Every node it can move has a main knob to move.
    for (const id of ['synth', 'bass', 'lead', 'drone', 'dist', 'drum'] as const) expect(MOD_TARGETS[id]).toBeDefined();
  });

  it('rechaza los bucles de audio, también a través de cables cortados', () => {
    expect(connect([plugged('dist', 'master')], 'dist', 'dist')).toEqual({ ok: false, reason: 'loop' });
    // The search follows any chain of sound: here, as if SYNTH had an input fed by DIST.
    const chain: Cable[] = [plugged('dist', 'synth'), { from: 'synth', to: 'master', cut: true }];
    expect(createsLoop(chain, 'synth', 'dist')).toBe(true);
    expect(createsLoop(chain, 'bass', 'dist')).toBe(false);
    // Modulation is not sound: an LFO cable never closes a loop.
    expect(createsLoop([plugged('lfo', 'dist')], 'dist', 'master')).toBe(false);
  });

  it('conectar un generador a un efecto reemplaza su cable directo al MASTER (inserción)', () => {
    const start: Cable[] = [plugged('bass', 'master'), plugged('dist', 'master')];
    const inserted = connect(start, 'bass', 'dist');
    expect(inserted).toMatchObject({ ok: true, kind: 'audio', changed: true });
    if (!inserted.ok) return;
    expect(inserted.cables).toEqual([plugged('dist', 'master'), plugged('bass', 'dist')]);
    // Plugged into MASTER again: a parallel send, the effect stays.
    const parallel = connect(inserted.cables, 'bass', 'master');
    expect(parallel.ok && parallel.cables).toEqual([plugged('dist', 'master'), plugged('bass', 'dist'), plugged('bass', 'master')]);
  });

  it('un cable que ya existe no cambia nada; uno cortado se vuelve a enchufar', () => {
    const cables = [plugged('bass', 'master')];
    expect(connect(cables, 'bass', 'master')).toMatchObject({ ok: true, changed: false });
    const cut = toggleCut(cables, 'bass', 'master');
    expect(cut).toEqual([{ from: 'bass', to: 'master', cut: true }]);
    const back = connect(cut, 'bass', 'master');
    expect(back.ok && back.cables).toEqual(cables);
  });

  it('el LFO puede modular varios destinos a la vez', () => {
    let cables: readonly Cable[] = [];
    for (const to of ['bass', 'synth', 'dist'] as const) {
      const result = connect(cables, 'lfo', to);
      expect(result).toMatchObject({ ok: true, kind: 'mod' });
      if (result.ok) cables = result.cables;
    }
    expect(cables.map((cable) => cable.to)).toEqual(['bass', 'synth', 'dist']);
  });

  it('sacar un efecto se lleva sus cables y devuelve al MASTER lo que solo lo alimentaba a él', () => {
    const cables: Cable[] = [
      plugged('dist', 'master'),
      plugged('bass', 'dist'),
      plugged('synth', 'dist'),
      plugged('synth', 'master'), // a parallel send: SYNTH keeps it and gets nothing more
      plugged('lfo', 'dist'),
    ];
    expect(withoutNode(cables, 'dist')).toEqual([plugged('synth', 'master'), plugged('bass', 'master')]);
    expect(withoutNode(cables, 'lfo')).toEqual(cables.slice(0, 4));
  });

  it('un nodo suena si su sonido llega al MASTER por cables enchufados, directo o por un efecto', () => {
    const added = ['master', 'bass', 'dist'] as const;
    const through: Cable[] = [plugged('bass', 'dist'), plugged('dist', 'master')];
    expect(reachesMaster(through, [...added], 'bass')).toBe(true);
    expect(reachesMaster(toggleCut(through, 'dist', 'master'), [...added], 'bass')).toBe(false);
    expect(reachesMaster(through, ['master', 'bass'], 'bass')).toBe(false); // DIST not on the canvas
    // An effect with nothing plugged into it makes no sound of its own, but its path is there.
    expect(reachesMaster([plugged('dist', 'master')], [...added], 'bass')).toBe(false);
  });
});

describe('ruteo en el store', () => {
  let store: Store;
  beforeEach(() => {
    store = new Store();
  });

  it('solo conecta nodos que están en el lienzo; un rechazo no toca el estado', () => {
    store.addNode('bass');
    const before = store.getState();
    expect(store.connect('bass', 'dist')).toMatchObject({ ok: false });
    store.addNode('dist');
    const withDist = store.getState();
    expect(store.connect('dist', 'dist')).toEqual({ ok: false, reason: 'loop' });
    expect(store.getState()).toBe(withDist);
    expect(before.cables).toEqual([plugged('bass', 'master')]);
  });

  it('la escena lleva solo los cables enchufados, de sonido y de modulación', () => {
    store.addNode('bass');
    store.addNode('dist');
    store.addNode('lfo');
    store.connect('bass', 'dist');
    store.connect('lfo', 'bass');
    expect(sceneFromState(store.getState()).cables).toEqual([
      { from: 'dist', to: 'master' },
      { from: 'bass', to: 'dist' },
      { from: 'lfo', to: 'bass' },
    ]);
    store.toggleCable('lfo', 'bass');
    expect(sceneFromState(store.getState()).cables).not.toContainEqual({ from: 'lfo', to: 'bass' });
  });

  it('el LFO no toca los valores guardados de las perillas que mueve', () => {
    store.addNode('bass');
    store.addNode('lfo');
    const cutoff = store.getState().params.bass.cutoff;
    store.connect('lfo', 'bass');
    expect(store.getState().params.bass.cutoff).toBe(cutoff);
    // The ring shows the value heard: the knob's own, moved by the wave, CANTIDAD and span.
    expect(modulatedValue(0.4, 1, 0.5, 0.5)).toBeCloseTo(0.65);
    expect(modulatedValue(0.4, -1, 1, 0.5)).toBe(0); // within the knob's travel
    expect(modulatedValue(0.4, 0.7, 0, 0.5)).toBe(0.4); // CANTIDAD 0: still
  });

  it('la DISTORSIÓN y el LFO pasan a la escena', () => {
    store.setDistType('crush');
    store.setParam('dist', 'output', 0.8);
    store.setLfoShape('square');
    store.toggleLfoSync();
    const scene = sceneFromState(store.getState());
    expect(scene.dist).toMatchObject({ type: 'crush', output: 0.8 });
    expect(scene.lfo).toMatchObject({ shape: 'square', sync: true });
  });
});

describe('ruteo en vivo: LEAD a través de la DISTORSIÓN', () => {
  it('toca por el efecto, y cortar la salida del efecto suelta la nota', () => {
    const store = new Store();
    const events: LiveEvent[] = [];
    const lights: Lights = { pulse: () => undefined, hold: () => undefined };
    const live = new Live(store, lights, createRng(1));
    live.listen((event) => events.push(event));
    store.addNode('lead');
    store.addNode('dist');
    store.connect('lead', 'dist');
    expect(store.getState().cables.some((cable) => cable.from === 'lead' && cable.to === 'master')).toBe(false);
    live.keyDown(1, 0);
    expect(events.at(-1)).toMatchObject({ node: 'lead', type: 'on' });
    store.toggleCable('dist', 'master'); // the effect goes silent, and the LEAD with it
    expect(events.at(-1)).toEqual({ node: 'lead', type: 'panic' });
  });
});

/** A module that, like the real ones, takes the LFO on its own input. */
class ModTarget extends FakeModule {
  readonly mod = new FakeNode();
  inputFor(source: string): FakeNode {
    return source === MOD_SOURCE ? this.mod : this.input;
  }
}

describe('ruteo en el grafo de audio', () => {
  let context: FakeContext;
  let graph: AudioGraph;
  const asModule = (module: FakeModule): AudioModule => module as unknown as AudioModule;

  beforeEach(() => {
    vi.useFakeTimers();
    context = new FakeContext();
    graph = new AudioGraph(context as unknown as BaseAudioContext);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('una entrada suma sus cables: BASS y SYNTH llegan los dos a la entrada de la DISTORSIÓN', () => {
    const [bass, synth, dist, master] = [new FakeModule(), new FakeModule(), new FakeModule(), new FakeModule()];
    graph.add('bass', asModule(bass));
    graph.add('synth', asModule(synth));
    graph.add('dist', asModule(dist));
    graph.add('master', asModule(master));
    dist.input.connect(dist.output); // the effect, standing in for its worklet
    graph.connect('bass', 'dist', 0);
    graph.connect('synth', 'dist', 0);
    graph.connect('dist', 'master', 0);
    // Each source through its own cable gain, both into the one input node (Web Audio sums them).
    const into = context.gains.filter((gain) => gain.connections.has(dist.input));
    expect(into).toHaveLength(2);
    expect(reaches(bass.output, master.input)).toBe(true);
    expect(reaches(synth.output, master.input)).toBe(true);
    expect(graph.reaches('bass', 'master')).toBe(true);
    graph.disconnect('dist', 'master', 1);
    expect(graph.reaches('bass', 'master')).toBe(false);
  });

  it('el cable del LFO llega al parámetro del destino, no a su entrada de sonido', () => {
    const [lfo, bass] = [new FakeModule(), new ModTarget()];
    graph.add('lfo', asModule(lfo));
    graph.add('bass', asModule(bass));
    graph.connect('lfo', 'bass', 0);
    expect(reaches(lfo.output, bass.mod)).toBe(true);
    expect(reaches(lfo.output, bass.input)).toBe(false);
    // Modulation is not a path for sound.
    expect(graph.reaches('lfo', 'bass', 'lfo')).toBe(false);
  });

  it('conectar y cortar funde en unos 20 ms; reconectar en medio del fundido nunca salta', () => {
    expect(CABLE_FADE).toBeCloseTo(0.02);
    const [bass, master] = [new FakeModule(), new FakeModule()];
    graph.add('bass', asModule(bass));
    graph.add('master', asModule(master));
    graph.connect('bass', 'master', 1);
    const first = context.gains.at(-1)!;
    // Cut halfway through the fade-in, plugged back 5 ms later.
    graph.disconnect('bass', 'master', 1.01);
    graph.connect('bass', 'master', 1.015);
    const second: FakeGain = context.gains.at(-1)!;
    expect(second).not.toBe(first);
    let previous = 0;
    for (let ms = 990; ms <= 1060; ms += 0.5) {
      const t = ms / 1000;
      const total = first.gain.valueAt(t) + second.gain.valueAt(t);
      expect(total).toBeLessThanOrEqual(1 + 1e-9);
      // No step bigger than a 20 ms ramp allows in half a millisecond (two ramps at most).
      expect(Math.abs(total - previous)).toBeLessThanOrEqual((2 * 0.0005) / CABLE_FADE + 1e-9);
      previous = total;
    }
    expect(second.gain.valueAt(1.1)).toBe(1);
    expect(first.gain.valueAt(1.1)).toBe(0);
  });
});
