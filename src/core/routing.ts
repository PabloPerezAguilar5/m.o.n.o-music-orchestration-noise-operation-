import type { NodeId } from './nodes';

/**
 * Cables between nodes: pure rules, no DOM and no audio. A cable goes from one node's
 * output to another node's input. A node may send to several inputs at once (parallel
 * sends) and an input hears the sum of its cables.
 *
 * Two kinds: audio cables (sound into an effect or into MASTER) and modulation cables
 * (the LFO moving a knob of the node at the other end).
 */

/** What a node does in the patch. */
export type NodeRole = 'generator' | 'effect' | 'modulator' | 'master';

export const NODE_ROLES: Readonly<Record<NodeId, NodeRole>> = {
  master: 'master',
  synth: 'generator',
  drum: 'generator',
  bass: 'generator',
  drone: 'generator',
  lead: 'generator',
  dist: 'effect',
  lfo: 'modulator',
};

export type CableKind = 'audio' | 'mod';

/** One cable. Plain data: the patch is saved and shared as a list of these. */
export interface Cable {
  readonly from: NodeId;
  readonly to: NodeId;
  /** Tapped: drawn faint and silent, until tapped again. */
  readonly cut: boolean;
}

/** Why a cable cannot be made. */
export type ConnectRefusal =
  /** The cable would feed a node's sound back into itself. */
  | 'loop'
  /** The target takes no cable of this kind (a generator has no input; the LFO never moves MASTER). */
  | 'no-input'
  /** The source has nothing to send (MASTER goes to the speakers). */
  | 'no-output';

export type ConnectResult =
  | { readonly ok: true; readonly cables: readonly Cable[]; readonly kind: CableKind; readonly changed: boolean }
  | { readonly ok: false; readonly reason: ConnectRefusal };

/** Whether a node has an output port: everything but MASTER. */
export const hasOutput = (id: NodeId): boolean => NODE_ROLES[id] !== 'master';

/** Whether a node takes audio cables: effects and MASTER. */
export const hasAudioInput = (id: NodeId): boolean => NODE_ROLES[id] === 'effect' || NODE_ROLES[id] === 'master';

/** Whether the LFO can move a knob of a node: everything that sounds, never MASTER or itself. */
export const isModTarget = (id: NodeId): boolean => NODE_ROLES[id] === 'generator' || NODE_ROLES[id] === 'effect';

/** The kind of cable from `from` to `to`, or why there can be none (loops aside). */
export function cableKind(from: NodeId, to: NodeId): CableKind | ConnectRefusal {
  if (!hasOutput(from)) return 'no-output';
  if (NODE_ROLES[from] === 'modulator') return isModTarget(to) ? 'mod' : 'no-input';
  if (from === to) return 'loop';
  return hasAudioInput(to) ? 'audio' : 'no-input';
}

export const sameCable = (a: { from: NodeId; to: NodeId }, b: { from: NodeId; to: NodeId }): boolean =>
  a.from === b.from && a.to === b.to;

export const isAudio = (cable: { from: NodeId }): boolean => NODE_ROLES[cable.from] !== 'modulator';

/**
 * Whether sound from `from` would come back to it if a cable `from → to` were added.
 * Cut cables count too: tapping one back in must never close a loop.
 */
export function createsLoop(cables: readonly Cable[], from: NodeId, to: NodeId): boolean {
  if (from === to) return true;
  const seen = new Set<NodeId>();
  const stack: NodeId[] = [to];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === from) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const cable of cables) if (isAudio(cable) && cable.from === node) stack.push(cable.to);
  }
  return false;
}

/**
 * Plugs `from` into `to`. A generator plugged into an effect loses its direct cable to
 * MASTER: the effect is inserted. Plugging it into MASTER again adds a parallel send. A
 * cut cable between the same two nodes is plugged back in.
 */
export function connect(cables: readonly Cable[], from: NodeId, to: NodeId): ConnectResult {
  const kind = cableKind(from, to);
  if (kind !== 'audio' && kind !== 'mod') return { ok: false, reason: kind };
  if (kind === 'audio' && createsLoop(cables, from, to)) return { ok: false, reason: 'loop' };

  const existing = cables.find((cable) => sameCable(cable, { from, to }));
  let next: readonly Cable[] = existing
    ? existing.cut
      ? cables.map((cable) => (cable === existing ? { ...cable, cut: false } : cable))
      : cables
    : [...cables, { from, to, cut: false }];
  if (NODE_ROLES[from] === 'generator' && NODE_ROLES[to] === 'effect') {
    next = next.filter((cable) => !sameCable(cable, { from, to: 'master' }));
  }
  return { ok: true, cables: next, kind, changed: next !== cables };
}

/** Cuts a cable, or plugs a cut one back in. */
export const toggleCut = (cables: readonly Cable[], from: NodeId, to: NodeId): readonly Cable[] =>
  cables.map((cable) => (sameCable(cable, { from, to }) ? { ...cable, cut: !cable.cut } : cable));

/** The cables a node comes with when added: its output to MASTER (the LFO waits to be patched). */
export const defaultCables = (id: NodeId): Cable[] =>
  hasOutput(id) && NODE_ROLES[id] !== 'modulator' ? [{ from: id, to: 'master', cut: false }] : [];

/**
 * The cables left when a node goes: all of its own go. A generator that was only feeding
 * that node is plugged straight into MASTER, so taking an effect out never leaves its
 * sources silent (like pulling a pedal out of a chain).
 */
export function withoutNode(cables: readonly Cable[], id: NodeId): Cable[] {
  const kept = cables.filter((cable) => cable.from !== id && cable.to !== id);
  const orphans = cables
    .filter((cable) => cable.to === id && NODE_ROLES[cable.from] === 'generator')
    .map((cable) => cable.from)
    .filter((source) => !kept.some((cable) => cable.from === source));
  return [...kept, ...orphans.map((source): Cable => ({ from: source, to: 'master', cut: false }))];
}

/** Cables that carry something now: not cut, both ends on the canvas. */
export const liveCables = (cables: readonly Cable[], added: readonly NodeId[]): Cable[] =>
  cables.filter((cable) => !cable.cut && added.includes(cable.from) && added.includes(cable.to));

/** A cable as the audio sees it: just its two ends. */
export interface Link<Id extends string = NodeId> {
  readonly from: Id;
  readonly to: Id;
}

/** Whether `to` can be reached from `from` following links (audio ones only). */
export function reaches<Id extends string>(links: readonly Link<Id>[], from: Id, to: Id): boolean {
  const seen = new Set<Id>();
  const stack: Id[] = [from];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === to) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const link of links) if (link.from === node && link.from !== 'lfo') stack.push(link.to);
  }
  return false;
}

/** Whether `id`'s sound reaches MASTER through cables that are plugged in. */
export const reachesMaster = (cables: readonly Cable[], added: readonly NodeId[], id: NodeId): boolean =>
  added.includes(id) && reaches(liveCables(cables, added), id, 'master');
