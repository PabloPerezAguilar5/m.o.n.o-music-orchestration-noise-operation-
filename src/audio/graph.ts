/**
 * The live audio graph: modules (one per canvas node) and the cables between them.
 *
 * Every cable is a real connection through its own GainNode. Connecting fades it in
 * and cutting it fades it out before the nodes are disconnected, so cables can be
 * made and cut while playing without clicks or gaps. All changes take an explicit
 * audio time, so the caller can line them up with the next bar.
 */

export interface AudioModule {
  readonly input: AudioNode;
  readonly output: AudioNode;
  /** A dedicated input per source (e.g. a mixer channel on MASTER). Defaults to `input`. */
  inputFor?(source: string): AudioNode;
  dispose(): void;
}

/** Cable fade in/out, seconds. */
export const CABLE_FADE = 0.015;
/** Extra wait before releasing nodes that have faded out, seconds. */
const RELEASE_MARGIN = 0.05;

interface Cable {
  readonly from: string;
  readonly to: string;
  readonly gain: GainNode;
  readonly source: AudioNode;
  /** When the fade-in starts. */
  readonly openedAt: number;
}

const cableId = (from: string, to: string): string => `${from}->${to}`;

export class AudioGraph {
  private readonly modules = new Map<string, AudioModule>();
  private readonly cables = new Map<string, Cable>();

  /**
   * `keepAlive`: a silent path (zero gain) to the speakers that every module's output
   * also feeds. Browsers stop processing nodes that do not reach the output, so without it
   * a module whose cable is cut would freeze mid-release (and its effect tails with it)
   * and play the rest when plugged back. With it, a cut instrument keeps running unheard
   * and its tails die out as they would.
   */
  constructor(
    private readonly context: BaseAudioContext,
    private readonly keepAlive?: AudioNode,
  ) {}

  add(id: string, module: AudioModule): void {
    if (this.modules.has(id)) throw new Error(`module ${id} already in the graph`);
    this.modules.set(id, module);
    if (this.keepAlive) module.output.connect(this.keepAlive);
  }

  has(id: string): boolean {
    return this.modules.has(id);
  }

  get(id: string): AudioModule | undefined {
    return this.modules.get(id);
  }

  /** Cuts every cable of a module at `time` and disposes it once they have faded out. */
  remove(id: string, time: number): void {
    const module = this.modules.get(id);
    if (!module) return;
    for (const cable of [...this.cables.values()]) {
      if (cable.from === id || cable.to === id) this.disconnect(cable.from, cable.to, time);
    }
    this.modules.delete(id);
    this.release(time + CABLE_FADE, () => module.dispose());
  }

  /** Connects `from`'s output to `to`'s input, fading in from `time`. Returns false if already connected. */
  connect(from: string, to: string, time: number): boolean {
    const id = cableId(from, to);
    if (this.cables.has(id)) return false;
    const source = this.modules.get(from);
    const target = this.modules.get(to);
    if (!source || !target) throw new Error(`cannot connect ${id}: missing module`);

    const gain = this.context.createGain();
    // Silent until `time`: an AudioParam holds `value` before its first event.
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(1, time + CABLE_FADE);
    source.output.connect(gain);
    gain.connect(target.inputFor?.(from) ?? target.input);
    this.cables.set(id, { from, to, gain, source: source.output, openedAt: time });
    return true;
  }

  /** Fades the cable out from `time`, then disconnects it. Returns false if there was no cable. */
  disconnect(from: string, to: string, time: number): boolean {
    const id = cableId(from, to);
    const cable = this.cables.get(id);
    if (!cable) return false;
    this.cables.delete(id);

    const param = cable.gain.gain;
    // Start the fade-out from wherever the fade-in had reached at `time`.
    const opened = Math.min(1, Math.max(0, (time - cable.openedAt) / CABLE_FADE));
    param.cancelScheduledValues(time);
    param.setValueAtTime(opened, time);
    param.linearRampToValueAtTime(0, time + CABLE_FADE);
    this.release(time + CABLE_FADE, () => {
      cable.source.disconnect(cable.gain);
      cable.gain.disconnect();
    });
    return true;
  }

  isConnected(from: string, to: string): boolean {
    return this.cables.has(cableId(from, to));
  }

  /** Current cables as "from->to". */
  cableIds(): string[] {
    return [...this.cables.keys()];
  }

  /** Runs `free` once audio time has passed `time`. The timer only frees silent nodes; it plays nothing. */
  private release(time: number, free: () => void): void {
    const wait = Math.max(0, time - this.context.currentTime + RELEASE_MARGIN);
    setTimeout(free, wait * 1000);
  }
}
