import { css, html, LitElement, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { clamp, type Point } from '../../core/geometry';
import { reset } from '../styles/shared';

export type XyInputEvent = CustomEvent<Point>;

/**
 * DRONE touch pad. Controlled: it shows the dot at (x, y), both 0..1 from the
 * top-left corner, and fires `xy-input` while a finger moves over it.
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
        border: 1px solid #14141c;
        border-radius: 6px;
        background:
          repeating-linear-gradient(0deg, transparent 0 19px, #ffffff10 19px 20px),
          repeating-linear-gradient(90deg, transparent 0 19px, #ffffff10 19px 20px),
          #14141f;
        touch-action: none;
      }
      .xy b {
        position: absolute;
        width: 16px;
        height: 16px;
        margin: -8px;
        border-radius: 50%;
        background: var(--c);
        box-shadow: 0 0 14px var(--c);
      }
    `,
  ];

  @property({ type: Number }) x = 0.5;
  @property({ type: Number }) y = 0.5;

  override render(): TemplateResult {
    return html`<div class="xy" @pointerdown=${this.onPointerDown}>
      <b style="left:${this.x * 100}%;top:${this.y * 100}%"></b>
    </div>`;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    const pad = event.currentTarget as HTMLElement;
    pad.setPointerCapture(event.pointerId);

    const move = (moveEvent: PointerEvent): void => {
      const rect = pad.getBoundingClientRect();
      const detail = {
        x: clamp((moveEvent.clientX - rect.left) / rect.width, 0, 1),
        y: clamp((moveEvent.clientY - rect.top) / rect.height, 0, 1),
      };
      this.dispatchEvent(new CustomEvent('xy-input', { detail }) satisfies XyInputEvent);
    };
    const end = (): void => {
      pad.removeEventListener('pointermove', move);
      pad.removeEventListener('pointerup', end);
      pad.removeEventListener('pointercancel', end);
    };
    move(event);
    pad.addEventListener('pointermove', move);
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'mono-xy-pad': MonoXyPad;
  }
}
