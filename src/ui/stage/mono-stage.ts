import { css, html, LitElement, type TemplateResult } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { CANVAS, type Point } from '../../core/geometry';
import { MOD_TARGETS } from '../../core/lfo';
import { INSTRUMENT_IDS, NODE_SPECS, type NodeId } from '../../core/nodes';
import { cableKind, createsLoop, hasAudioInput, type Cable, type ConnectRefusal } from '../../core/routing';
import { activity, cues, lfoMonitor, pulse, store } from '../../state';
import { KNOB_LABELS, NODE_NAMES, TEXT } from '../labels';
import { NODE_COLORS } from '../theme';
import { Selector } from '../store-controller';
import { reset } from '../styles/shared';
import './mono-add-menu';
import type { NodeAddEvent } from './mono-add-menu';
import { cableView, nodeView, OUTPUT_PORT, wireView } from './node-view';

/** A press that travels less than this (in screen px) is a tap, not a drag. */
const DRAG_THRESHOLD_PX = 6;
/** How long a node stays lit when it joins the canvas. */
const ADD_PULSE_MS = 700;
/** A cable dropped this close to a node's centre (canvas units) lands on it. */
const DROP_RADIUS = 52;

interface Drag {
  readonly id: NodeId;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  /** Node centre minus the grab point, in canvas units. */
  readonly offsetX: number;
  readonly offsetY: number;
  moved: boolean;
}

/** A cable being pulled out of a node's output port. */
interface Wire {
  readonly from: NodeId;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  /** The loose end, in canvas units. */
  end: Point;
  moved: boolean;
}

/** Whether a cable dragged from `from` could land on `to` (a loop or a node with no input could not). */
export function canLand(cables: readonly Cable[], from: NodeId, to: NodeId): boolean {
  const kind = cableKind(from, to);
  if (kind === 'mod') return true;
  return kind === 'audio' && !createsLoop(cables, from, to);
}

/**
 * The canvas: MASTER fixed at the centre, draggable nodes, the cables between them, the
 * play button and the add menu.
 *
 * Patching: each node has an output port (a small circle on its right edge). Dragging it
 * pulls a cable out; the nodes it can land on light their input port; dropping it on one
 * plugs it in (routing.ts decides: inserting an effect, refusing loops; the reason shows on
 * the display). Dragging the node's body still moves it. Tapping a cable cuts it, or
 * plugs it back.
 */
@customElement('mono-stage')
export class MonoStage extends LitElement {
  static override styles = [
    reset,
    css`
      :host {
        display: block;
        position: relative;
        flex: 1.1;
        min-height: 0;
        border: 1px solid #2c2c44;
        border-radius: 14px;
        overflow: hidden;
        background:
          radial-gradient(
            circle at 50% 46%,
            transparent 0 78px,
            #ffffff0d 79px 80px,
            transparent 81px 150px,
            #ffffff0a 151px 152px,
            transparent 153px
          ),
          radial-gradient(#ffffff16 1px, transparent 1.5px) 0 0 / 22px 22px,
          radial-gradient(ellipse at 50% 45%, #242439, #1b1b2a 72%);
      }
      #svg {
        width: 100%;
        height: 100%;
        display: block;
        --p: 0;
      }
      #svg,
      #svg * {
        touch-action: none;
      }
      .logo {
        position: absolute;
        left: 14px;
        top: 10px;
        font-weight: 700;
        letter-spacing: 0.14em;
        font-size: 15px;
      }
      #play {
        position: absolute;
        left: 14px;
        top: 38px;
        width: 38px;
        height: 30px;
        border: 1.5px solid var(--dim);
        border-radius: 8px;
        background: #1b1b2a;
        font-size: 13px;
      }
      #play.on {
        border-color: var(--ink);
        box-shadow: 0 0 12px rgba(237, 237, 247, 0.35);
      }

      /* Nodes are grey until they sound; then they take their own colour. */
      .nd {
        cursor: grab;
      }
      .nd path {
        fill: #202034;
        stroke: var(--dim);
        stroke-width: 2.5;
        stroke-linejoin: round;
        transition:
          stroke 0.15s,
          fill 0.3s,
          filter 0.3s;
      }
      .nd.lfo path {
        fill: none;
      }
      .nd .hit {
        fill: transparent;
      }
      .nd .ring {
        fill: none;
        stroke: none;
      }
      .nd.sel .ring {
        stroke: var(--c);
        stroke-width: 1;
        stroke-dasharray: 3 5;
        opacity: 0.55;
      }
      .nd text {
        fill: #6b6b88;
        font-size: 11px;
        letter-spacing: 0.1em;
        font-family: var(--mono);
      }
      .nd.on path {
        stroke: var(--c);
        filter: drop-shadow(0 0 9px var(--c));
        fill: color-mix(in srgb, var(--c) 18%, #202034);
      }
      .nd.lfo.on path {
        fill: none;
      }
      .nd.on text,
      .nd.sel text {
        fill: var(--c);
      }
      /* The LFO, while it moves something, glows with its own wave (--p, 0..1). */
      #svg.moving .nd.lfo path {
        stroke: color-mix(in srgb, var(--c) calc(var(--p) * 100%), var(--dim));
        filter: drop-shadow(0 0 calc(var(--p) * 9px) var(--c));
      }

      /* Ports: an output on every node but MASTER; inputs show while a cable is dragged. */
      .port {
        cursor: crosshair;
      }
      .port .phit {
        fill: transparent;
      }
      .port .pdot {
        fill: #1b1b2a;
        stroke: var(--dim);
        stroke-width: 1.5;
        transition: stroke 0.15s;
      }
      .nd.on .port .pdot,
      .port:hover .pdot,
      .nd.src .port .pdot {
        stroke: var(--c);
      }
      .pin {
        fill: color-mix(in srgb, var(--w) 25%, #1b1b2a);
        stroke: var(--w);
        stroke-width: 2;
        filter: drop-shadow(0 0 6px var(--w));
      }
      .nd.tg .ring {
        stroke: var(--w);
        stroke-width: 1;
        stroke-dasharray: 3 5;
        opacity: 0.8;
      }

      /* Cables take the colour of the node they come from: faint at rest, bright when lit. */
      .cb {
        stroke: color-mix(in srgb, var(--c) 30%, #2e2e45);
        stroke-width: 2;
        transition: stroke 0.15s;
      }
      .cb.on {
        stroke: var(--c);
        filter: drop-shadow(0 0 5px var(--c));
      }
      .cb.off {
        stroke-dasharray: 2 7;
        opacity: 0.45;
      }
      /* Modulation: dotted, glowing with the LFO's wave. */
      .cb.mod {
        stroke-dasharray: 0.1 7;
        stroke-linecap: round;
        stroke-width: 3;
      }
      #svg.moving .cb.mod:not(.off) {
        stroke: color-mix(in srgb, var(--c) calc(30% + var(--p) * 70%), #2e2e45);
        filter: drop-shadow(0 0 calc(var(--p) * 5px) var(--c));
      }
      .cb.mod.off {
        opacity: 0.35;
      }
      .wire {
        stroke: var(--c);
        stroke-width: 2;
        filter: drop-shadow(0 0 5px var(--c));
        pointer-events: none;
      }
      .wire.mod {
        stroke-dasharray: 0.1 7;
        stroke-linecap: round;
        stroke-width: 3;
      }
      /* Invisible, wide tap target over each cable. */
      .cbh {
        stroke: transparent;
        stroke-width: 18;
        pointer-events: stroke;
        cursor: pointer;
      }
    `,
  ];

  private readonly added = new Selector(this, store, (s) => s.added);
  private readonly selected = new Selector(this, store, (s) => s.selected);
  private readonly positions = new Selector(this, store, (s) => s.positions);
  private readonly playing = new Selector(this, store, (s) => s.transport.playing);
  private readonly lit = new Selector(this, activity, (lit) => lit);
  private readonly cables = new Selector(this, store, (s) => s.cables);

  @state() private menuOpen = false;
  @state() private wire: Wire | null = null;
  @query('#svg') private svg!: SVGSVGElement;
  private drag: Drag | null = null;
  private frame = 0;

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.drag = null;
    this.wire = null;
  }

  override render(): TemplateResult {
    const added = this.added.value;
    const selected = this.selected.value;
    const positions = this.positions.value;
    const playing = this.playing.value;
    const cables = this.cables.value.filter((cable) => added.includes(cable.from) && added.includes(cable.to));
    const lit = this.effectiveLit(cables);
    const wire = this.wire?.moved ? this.wire : null;
    const free = INSTRUMENT_IDS.filter((id) => !added.includes(id));
    const moving = cables.some((cable) => cable.from === 'lfo' && !cable.cut);

    return html`
      <div class="logo">${TEXT.logo}</div>
      <button
        id="play"
        class=${classMap({ on: playing })}
        aria-label=${playing ? TEXT.stop : TEXT.play}
        @click=${this.onPlay}
      >
        ${playing ? '■' : '▶'}
      </button>
      <svg
        id="svg"
        class=${classMap({ moving })}
        viewBox="0 0 ${CANVAS.width} ${CANVAS.height}"
        preserveAspectRatio="xMidYMid meet"
      >
        <g id="cables" @click=${this.onCableClick}>
          ${repeat(
            cables,
            (cable) => `${cable.from}-${cable.to}`,
            (cable) => cableView(cable, positions[cable.from], positions[cable.to], lit.has(cable.from)),
          )}
        </g>
        <g id="nodes" @pointerdown=${this.onPointerDown}>
          ${repeat(
            added,
            (id) => id,
            (id) =>
              nodeView(id, positions[id], {
                selected: id === selected,
                lit: lit.has(id),
                target: !!wire && wire.from !== id && canLand(this.cables.value, wire.from, id),
                wire: wire ? NODE_COLORS[wire.from] : null,
              }),
          )}
        </g>
        ${wire ? wireView(wire.from, this.portOf(wire.from), wire.end) : null}
      </svg>
      <mono-add-menu
        .free=${free}
        .open=${this.menuOpen}
        .hint=${added.length === 1 && !this.menuOpen}
        @menu-toggle=${this.onMenuToggle}
        @node-add=${this.onNodeAdd}
      ></mono-add-menu>
    `;
  }

  protected override updated(): void {
    // The LFO's glow follows its wave on every frame while it moves something.
    const moving = this.svg.classList.contains('moving');
    if (moving && !this.frame) this.frame = requestAnimationFrame(this.glow);
  }

  private readonly glow = (): void => {
    if (!this.svg?.classList.contains('moving')) {
      this.frame = 0;
      this.svg?.style.setProperty('--p', '0');
      return;
    }
    const depth = store.getState().params.lfo.depth ?? 0;
    const value = lfoMonitor.latest();
    this.svg.style.setProperty('--p', depth > 0 ? ((value + 1) / 2).toFixed(3) : '0');
    this.frame = requestAnimationFrame(this.glow);
  };

  /**
   * Lit nodes, plus an effect lit by what goes through it: DISTORSIÓN lights while a
   * lit node plays into it (and so does its cable on to MASTER).
   */
  private effectiveLit(cables: readonly Cable[]): ReadonlySet<NodeId> {
    const lit = this.lit.value;
    const fed = cables.filter((cable) => !cable.cut && hasAudioInput(cable.to) && cable.to !== 'master' && lit.has(cable.from));
    if (fed.length === 0) return lit;
    return new Set([...lit, ...fed.map((cable) => cable.to)]);
  }

  /** A node's output port, in canvas units. */
  private portOf(id: NodeId): Point {
    const centre = this.positions.value[id];
    return { x: centre.x + OUTPUT_PORT.x, y: centre.y + OUTPUT_PORT.y };
  }

  private readonly onPlay = (): void => {
    store.togglePlay();
  };

  /** Tapping a cable cuts it, or plugs it back. The sound follows at the next bar. */
  private readonly onCableClick = (event: MouseEvent): void => {
    const hit = (event.target as Element).closest<SVGLineElement>('.cbh');
    const from = hit?.dataset.from as NodeId | undefined;
    const to = hit?.dataset.to as NodeId | undefined;
    if (!from || !to) return;
    this.menuOpen = false;
    store.toggleCable(from, to);
  };

  private readonly onMenuToggle = (): void => {
    this.menuOpen = !this.menuOpen;
  };

  private readonly onNodeAdd = (event: NodeAddEvent): void => {
    const { id } = event.detail;
    this.menuOpen = false;
    if (store.addNode(id)) pulse(id, ADD_PULSE_MS);
  };

  /** Screen coordinates to canvas (viewBox) coordinates. */
  private toCanvas(event: PointerEvent): Point {
    const matrix = this.svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  }

  /** The node whose body is under a canvas point, the nearest one if several. */
  private nodeAt(point: Point): NodeId | null {
    let best: NodeId | null = null;
    let bestDistance = DROP_RADIUS;
    for (const id of this.added.value) {
      const centre = this.positions.value[id];
      const distance = Math.hypot(centre.x - point.x, centre.y - point.y);
      if (distance < bestDistance) {
        best = id;
        bestDistance = distance;
      }
    }
    return best;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    const port = (event.target as Element).closest<SVGGElement>('.port')?.dataset.port as NodeId | undefined;
    if (port) {
      this.wire = {
        from: port,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        end: this.portOf(port),
        moved: false,
      };
      return;
    }
    const group = (event.target as Element).closest<SVGGElement>('.nd');
    const id = group?.dataset.id as NodeId | undefined;
    if (!id) return;
    const grab = this.toCanvas(event);
    const centre = this.positions.value[id];
    this.drag = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: centre.x - grab.x,
      offsetY: centre.y - grab.y,
      moved: false,
    };
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const wire = this.wire;
    if (wire && event.pointerId === wire.pointerId) {
      const travelled = Math.hypot(event.clientX - wire.startX, event.clientY - wire.startY);
      if (!wire.moved && travelled < DRAG_THRESHOLD_PX) return;
      this.wire = { ...wire, moved: true, end: this.toCanvas(event) };
      return;
    }
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moved) {
      const travelled = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (travelled < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
    }
    const point = this.toCanvas(event);
    // The store keeps MASTER fixed and clamps everything else to the canvas.
    store.moveNode(drag.id, { x: point.x + drag.offsetX, y: point.y + drag.offsetY });
  };

  /** Releasing a node selects it, whether it was tapped or dragged. A cable lands where it is dropped. */
  private readonly onPointerUp = (event: PointerEvent): void => {
    const wire = this.wire;
    if (wire && event.pointerId === wire.pointerId) {
      this.wire = null;
      this.menuOpen = false;
      if (wire.moved) this.land(wire.from, this.toCanvas(event));
      else store.selectNode(wire.from); // a tap on the port is a tap on the node
      return;
    }
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.drag = null;
    this.menuOpen = false;
    store.selectNode(drag.id);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.drag?.pointerId === event.pointerId) this.drag = null;
    if (this.wire?.pointerId === event.pointerId) this.wire = null;
  };

  /** A cable from `from` dropped at `point`: plugged in, or the display says why not. */
  private land(from: NodeId, point: Point): void {
    const to = this.nodeAt(point);
    // Dropped on empty canvas, or back on its own node (that has no input): nothing happens.
    if (!to || (to === from && !hasAudioInput(from))) return;
    const result = store.connect(from, to);
    if (!result.ok) {
      cues.send({ type: 'notice', text: refusalText(result.reason, from, to) });
      return;
    }
    pulse(from, ADD_PULSE_MS);
    cues.send({ type: 'notice', text: connectedText(from, to) });
  }
}

/** What the display says when a cable cannot be made. */
export function refusalText(reason: ConnectRefusal, from: NodeId, to: NodeId): string {
  if (reason === 'loop') return TEXT.cableLoop;
  if (from === 'lfo' && to === 'master') return TEXT.cableLfoMaster;
  return `${NODE_NAMES[to]} ${TEXT.cableNoInput}`;
}

/** What the display says when a cable is made: "BASS → DISTORSIÓN", "LFO → BASS CUTOFF". */
export function connectedText(from: NodeId, to: NodeId): string {
  const param = MOD_TARGETS[to]?.params[0];
  if (from === 'lfo' && param) {
    const knob = KNOB_LABELS[to][NODE_SPECS[to].params.indexOf(param)] ?? '';
    return `${NODE_NAMES.lfo} → ${NODE_NAMES[to]} ${knob}`;
  }
  return `${NODE_NAMES[from]} → ${NODE_NAMES[to]}`;
}

declare global {
  interface HTMLElementTagNameMap {
    'mono-stage': MonoStage;
  }
}
