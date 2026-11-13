import { css, html, LitElement, nothing, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { clamp } from '../../core/geometry';
import { lfoMonitor } from '../../state';
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
      /* The LFO moving this knob: an LED riding the rim at the value it is heard at (--m). */
      .orbit {
        position: absolute;
        inset: -3px;
        transform: rotate(calc(-135deg + var(--m, 0) * 270deg));
        pointer-events: none;
        z-index: 2;
      }
      .orbit b {
        position: absolute;
        left: 50%;
        top: 0;
        width: 7px;
        height: 7px;
        margin-left: -3.5px;
        border-radius: 50%;
        background: var(--c);
        box-shadow:
          0 0 6px var(--c),
          0 0 0 1px #14141c;
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
  /**
   * How far the LFO moves this knob, knob units each way (CANTIDAD times the span): 0 when
   * nothing moves it. The knob keeps showing its own value; an LED on the rim shows where
   * the LFO has it right now.
   */
  @property({ type: Number }) modDepth = 0;
  private frame = 0;

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  protected override updated(): void {
    if (this.modDepth > 0 && !this.frame) this.frame = requestAnimationFrame(this.follow);
  }

  private readonly follow = (): void => {
    if (this.modDepth <= 0 || !this.isConnected) {
      this.frame = 0;
      return;
    }
    const heard = clamp(this.value + lfoMonitor.latest() * this.modDepth, 0, 1);
    this.renderRoot.querySelector<HTMLElement>('.kn')?.style.setProperty('--m', heard.toFixed(4));
    this.frame = requestAnimationFrame(this.follow);
  };

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
        ${this.modDepth > 0 ? html`<s class="orbit"><b></b></s>` : nothing}
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
