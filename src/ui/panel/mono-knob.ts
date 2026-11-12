import { css, html, LitElement, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { clamp } from '../../core/geometry';
import { reset } from '../styles/shared';

export type KnobInputEvent = CustomEvent<{ value: number }>;

/** Vertical travel, in px, that sweeps the whole range. */
const FULL_TRAVEL_PX = 110;

/**
 * Black hardware knob with a caption. Drag up or down to turn it.
 * Controlled: it shows `value` (0..1) and fires `knob-input` with the new one.
 */
@customElement('mono-knob')
export class MonoKnob extends LitElement {
  static override styles = [
    reset,
    css`
      :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        font-size: 9px;
        letter-spacing: 0.06em;
        color: #22222c;
        font-weight: 700;
      }
      .kn {
        position: relative;
        width: var(--ks);
        height: var(--ks);
        border-radius: 50%;
        touch-action: none;
        cursor: ns-resize;
        background: conic-gradient(
          from -135deg,
          #22222c calc(var(--v) * 270deg),
          #8b877b 0 270deg,
          transparent 0
        );
      }
      :host([big]) .kn {
        width: clamp(38px, 9vh, 60px);
        height: clamp(38px, 9vh, 60px);
      }
      .kn::before {
        content: '';
        position: absolute;
        inset: 12%;
        border-radius: 50%;
        background: radial-gradient(circle at 35% 28%, #4a4a58, #0d0d13 70%);
        box-shadow: 0 2px 3px #0008;
      }
      .kn i {
        position: absolute;
        left: 50%;
        bottom: 50%;
        width: 2px;
        height: 34%;
        border-radius: 2px;
        background: #f1efe6;
        transform-origin: 50% 100%;
        transform: translateX(-50%) rotate(calc(-135deg + var(--v) * 270deg));
        z-index: 1;
      }
    `,
  ];

  @property({ type: Number }) value = 0;
  @property() label = '';
  @property({ type: Boolean, reflect: true }) big = false;

  override render(): TemplateResult {
    return html`<div
        class="kn"
        role="slider"
        aria-label=${this.label}
        aria-valuemin="0"
        aria-valuemax="127"
        aria-valuenow=${Math.round(this.value * 127)}
        style="--v:${this.value}"
        @pointerdown=${this.onPointerDown}
      >
        <i></i>
      </div>
      <span>${this.label}</span>`;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    const knob = event.currentTarget as HTMLElement;
    knob.setPointerCapture(event.pointerId);
    let lastY = event.clientY;
    let value = this.value;

    const move = (moveEvent: PointerEvent): void => {
      value = clamp(value + (lastY - moveEvent.clientY) / FULL_TRAVEL_PX, 0, 1);
      lastY = moveEvent.clientY;
      this.dispatchEvent(
        new CustomEvent('knob-input', { detail: { value } }) satisfies KnobInputEvent,
      );
    };
    const end = (): void => {
      knob.removeEventListener('pointermove', move);
      knob.removeEventListener('pointerup', end);
      knob.removeEventListener('pointercancel', end);
    };
    knob.addEventListener('pointermove', move);
    knob.addEventListener('pointerup', end);
    knob.addEventListener('pointercancel', end);
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'mono-knob': MonoKnob;
  }
}
