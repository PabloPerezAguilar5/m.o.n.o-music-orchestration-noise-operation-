import { css, html, LitElement, type TemplateResult } from 'lit';
import { customElement } from 'lit/decorators.js';
import { reset } from '../styles/shared';

/** Four sine cycles across a 400x60 box; the SVG is twice the display width so it can scroll. */
const SINE_POINTS = Array.from(
  { length: 81 },
  (_, i) => `${i * 5},${30 - Math.sin((i / 20) * Math.PI * 2) * 22}`,
).join(' ');

/** LFO display: a scrolling waveform. Decorative until the LFO exists. */
@customElement('mono-wave')
export class MonoWave extends LitElement {
  static override styles = [
    reset,
    css`
      :host {
        flex: 1;
        display: block;
        overflow: hidden;
        border: 1px solid #000;
        border-radius: 6px;
        background: #0d0508;
      }
      svg {
        width: 200%;
        height: 100%;
        animation: slide 3s linear infinite;
      }
      @keyframes slide {
        to {
          transform: translateX(-50%);
        }
      }
    `,
  ];

  override render(): TemplateResult {
    return html`<svg viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points=${SINE_POINTS}
        fill="none"
        stroke="var(--c)"
        stroke-width="2"
        vector-effect="non-scaling-stroke"
      />
    </svg>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mono-wave': MonoWave;
  }
}
