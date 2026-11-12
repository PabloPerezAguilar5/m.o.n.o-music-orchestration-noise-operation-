import { css, html, LitElement, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { STEPS, type Pattern } from '../../core/patterns';
import { reset } from '../styles/shared';

export type StepToggleEvent = CustomEvent<{ row: number; col: number }>;

const COLUMNS = Array.from({ length: STEPS }, (_, index) => index);

/**
 * 16-step sequencer: numbered columns, one row of keys per voice, an LED on
 * each key and an outline on the step being played. Fires `step-toggle`.
 */
@customElement('mono-step-grid')
export class MonoStepGrid extends LitElement {
  static override styles = [
    reset,
    css`
      :host {
        flex: 1;
        display: flex;
      }
      .sq {
        flex: 1;
        display: grid;
        gap: 3px;
        grid-template-columns: 30px repeat(16, 1fr);
      }
      .sq span {
        font-size: 8px;
        color: #2a2a33;
        font-weight: 700;
        align-self: center;
      }
      .sq .nm {
        text-align: center;
      }
      .st {
        position: relative;
        min-height: 12px;
        background: linear-gradient(#a9a598, #8f8b7e);
        border: 1px solid #2a2a33;
        border-radius: 3px;
        box-shadow: 0 2px 0 #0006;
      }
      /* Second and fourth beat: lighter keys. An active key keeps its cream colour; only its LED lights up. */
      .st.g {
        background: linear-gradient(#bfbbae, #a5a194);
      }
      .st::before {
        content: '';
        position: absolute;
        left: 22%;
        right: 22%;
        top: 2px;
        height: 3px;
        border-radius: 1px;
        background: #3c2a2a;
      }
      .st.a::before {
        background: var(--c);
        box-shadow: 0 0 6px var(--c);
      }
      .st.ph {
        outline: 2px solid #14141c;
        outline-offset: 1px;
      }
    `,
  ];

  /** Row captions, top to bottom. */
  @property({ attribute: false }) rows: readonly string[] = [];
  @property({ attribute: false }) pattern: Pattern = [];
  /** Step being played, or -1. */
  @property({ type: Number }) step = -1;

  override render(): TemplateResult {
    return html`<div
      class="sq"
      style="grid-template-rows:auto repeat(${this.rows.length},1fr)"
      @click=${this.onClick}
    >
      <span></span>${COLUMNS.map((col) => html`<span class="nm">${col + 1}</span>`)}
      ${this.rows.map((label, row) => this.row(label, row))}
    </div>`;
  }

  private row(label: string, row: number): TemplateResult {
    const cells = this.pattern[row] ?? [];
    return html`<span>${label}</span>${COLUMNS.map((col) => {
        const active = cells[col] === true;
        return html`<button
          class=${classMap({
            st: true,
            a: active,
            g: ((col >> 2) & 1) === 1,
            ph: col === this.step,
          })}
          data-r=${row}
          data-c=${col}
          aria-label="${label} ${col + 1}"
          aria-pressed=${active}
        ></button>`;
      })}`;
  }

  private readonly onClick = (event: MouseEvent): void => {
    const key = (event.target as Element).closest<HTMLElement>('.st');
    if (!key) return;
    const detail = { row: Number(key.dataset.r), col: Number(key.dataset.c) };
    this.dispatchEvent(new CustomEvent('step-toggle', { detail }) satisfies StepToggleEvent);
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'mono-step-grid': MonoStepGrid;
  }
}
