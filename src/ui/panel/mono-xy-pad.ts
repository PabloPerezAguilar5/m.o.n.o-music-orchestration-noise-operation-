import { css, html, LitElement, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { clamp } from '../../core/geometry';
import { reset } from '../styles/shared';

/** A finger (pointer id) on the pad, both axes 0..1 from the top-left corner. */
export type PadDownEvent = CustomEvent<{ touch: number; x: number; y: number }>;
export type PadUpEvent = CustomEvent<{ touch: number }>;

/** A layer as the pad draws it. */
export interface PadDot {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** A finger is on it (else it is held, in HOLD). */
  readonly touched: boolean;
  /** Its note, e.g. "Eb3". */
  readonly label: string;
}

/**
 * DRONE touch pad, played with any number of fingers. Fires `pad-down` when a finger
 * lands, `pad-move` while it moves and `pad-up` when it lifts. Controlled: it draws one
 * dot per layer sounding (`dots`), with its note; held layers show as a ring.
 */
@customElement('mono-xy-pad')
export class MonoXyPad extends LitElement {
  static override styles = [
    reset,
    css`
      :host {
        flex: 1;
        display: flex;
      }
      .xy {
        flex: 1;
        position: relative;
        overflow: hidden;
        border: 1px solid #14141c;
        border-radius: 6px;
        background:
          repeating-linear-gradient(0deg, transparent 0 19px, #ffffff10 19px 20px),
          repeating-linear-gradient(90deg, transparent 0 19px, #ffffff10 19px 20px),
          #14141f;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
      }
      .xy b {
        position: absolute;
        width: 16px;
        height: 16px;
        margin: -8px;
        border-radius: 50%;
        background: var(--c);
        box-shadow: 0 0 14px var(--c);
        pointer-events: none;
      }
      /* Held (HOLD, finger lifted): a ring that keeps glowing. */
      .xy b.held {
        background: transparent;
        border: 3px solid var(--c);
      }
      .xy b span {
        position: absolute;
        left: 50%;
        bottom: 18px;
        transform: translateX(-50%);
        font-size: 9px;
        font-weight: 400;
        letter-spacing: 0.08em;
        color: var(--c);
        white-space: nowrap;
      }
      .ax {
        position: absolute;
        font-size: 8px;
        letter-spacing: 0.16em;
        color: #ffffff40;
        pointer-events: none;
      }
      .ax.x {
        right: 8px;
        bottom: 5px;
      }
      .ax.y {
        left: 8px;
        top: 6px;
      }
    `,
  ];

  @property({ attribute: false }) dots: readonly PadDot[] = [];
  /** Axis captions: what X and Y do. */
  @property() noteCaption = '';
  @property() motionCaption = '';

  private readonly fingers = new Set<number>();

  override render(): TemplateResult {
    return html`<div
      class="xy"
      @pointerdown=${this.onPointerDown}
      @pointermove=${this.onPointerMove}
      @pointerup=${this.onPointerUp}
      @pointercancel=${this.onPointerUp}
      @lostpointercapture=${this.onPointerUp}
    >
      <span class="ax y">↑ ${this.motionCaption}</span>
      <span class="ax x">${this.noteCaption} →</span>
      ${repeat(
        this.dots,
        (dot) => dot.id,
        (dot) =>
          html`<b
            class=${classMap({ held: !dot.touched })}
            data-layer=${dot.id}
            style="left:${dot.x * 100}%;top:${dot.y * 100}%"
            ><span>${dot.label}</span></b
          >`,
      )}
    </div>`;
  }

  private point(pad: HTMLElement, event: PointerEvent): { x: number; y: number } {
    const rect = pad.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button > 0) return;
    const pad = event.currentTarget as HTMLElement;
    try {
      pad.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic event without a live pointer.
    }
    this.fingers.add(event.pointerId);
    this.dispatchEvent(
      new CustomEvent('pad-down', { detail: { touch: event.pointerId, ...this.point(pad, event) } }) satisfies PadDownEvent,
    );
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.fingers.has(event.pointerId)) return;
    const pad = event.currentTarget as HTMLElement;
    this.dispatchEvent(
      new CustomEvent('pad-move', { detail: { touch: event.pointerId, ...this.point(pad, event) } }) satisfies PadDownEvent,
    );
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.fingers.delete(event.pointerId)) return;
    this.dispatchEvent(new CustomEvent('pad-up', { detail: { touch: event.pointerId } }) satisfies PadUpEvent);
  };

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const touch of [...this.fingers]) {
      this.fingers.delete(touch);
      this.dispatchEvent(new CustomEvent('pad-up', { detail: { touch } }) satisfies PadUpEvent);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mono-xy-pad': MonoXyPad;
  }
}
