import { css, html, LitElement, type TemplateResult } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { CANVAS, type Point } from '../../core/geometry';
import { INSTRUMENT_IDS, type NodeId } from '../../core/nodes';
import { activity, pulse, store } from '../../state';
import { TEXT } from '../labels';
import { Selector } from '../store-controller';
import { reset } from '../styles/shared';
import './mono-add-menu';
import type { NodeAddEvent } from './mono-add-menu';
import { cableView, nodeView } from './node-view';

/** A press that travels less than this (in screen px) is a tap, not a drag. */
const DRAG_THRESHOLD_PX = 6;
/** How long a node stays lit when it joins the canvas. */
const ADD_PULSE_MS = 700;

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

/**
 * The canvas: MASTER fixed at the centre, draggable nodes wired to it,
 * the play button and the add menu.
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
      .cb {
        stroke: #2e2e45;
        stroke-width: 2;
        transition: stroke 0.15s;
      }
      .cb.on {
        stroke: var(--c);
        filter: drop-shadow(0 0 5px var(--c));
      }
    `,
  ];

  private readonly added = new Selector(this, store, (s) => s.added);
  private readonly selected = new Selector(this, store, (s) => s.selected);
  private readonly positions = new Selector(this, store, (s) => s.positions);
  private readonly playing = new Selector(this, store, (s) => s.transport.playing);
  private readonly lit = new Selector(this, activity, (lit) => lit);

  @state() private menuOpen = false;
  @query('#svg') private svg!: SVGSVGElement;
  private drag: Drag | null = null;

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
    this.drag = null;
  }

  override render(): TemplateResult {
    const added = this.added.value;
    const selected = this.selected.value;
    const positions = this.positions.value;
    const lit = this.lit.value;
    const playing = this.playing.value;
    const free = INSTRUMENT_IDS.filter((id) => !added.includes(id));

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
        viewBox="0 0 ${CANVAS.width} ${CANVAS.height}"
        preserveAspectRatio="xMidYMid meet"
      >
        <g id="cables">
          ${repeat(
            added.filter((id) => id !== 'master'),
            (id) => id,
            (id) => cableView(id, positions[id], lit.has(id)),
          )}
        </g>
        <g id="nodes" @pointerdown=${this.onPointerDown}>
          ${repeat(
            added,
            (id) => id,
            (id) => nodeView(id, positions[id], id === selected, lit.has(id)),
          )}
        </g>
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

  private readonly onPlay = (): void => {
    store.togglePlay();
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

  private readonly onPointerDown = (event: PointerEvent): void => {
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

  /** Releasing a node selects it, whether it was tapped or dragged. */
  private readonly onPointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.drag = null;
    this.menuOpen = false;
    store.selectNode(drag.id);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.drag?.pointerId === event.pointerId) this.drag = null;
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'mono-stage': MonoStage;
  }
}
