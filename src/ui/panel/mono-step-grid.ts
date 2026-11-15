import { css, html, LitElement, nothing, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { STEPS, type Pattern } from '../../core/patterns';
import { reset, SHORT, stepKey } from '../styles/shared';

export type StepToggleEvent = CustomEvent<{ row: number; col: number }>;

const COLUMNS = Array.from({ length: STEPS }, (_, index) => index);
/** Height of the spacer row before `split` (plus the grid gap on each side). */
const GAP_PX = 3;

/**
 * 16-step sequencer: numbered columns, one row of keys per voice, an LED on
 * each key and an outline on the step being played. Fires `step-toggle`.
 */
@customElement('mono-step-grid')
export class MonoStepGrid extends LitElement {
  static override styles = [
    reset,
    stepKey,
    css`
      :host {
        flex: 1;
        display: flex;
      }
      .sq {
        flex: 1;
        display: grid;
        gap: 3px;
        grid-template-columns: minmax(30px, max-content) repeat(16, 1fr);
      }
      /* Gap between the note rows and the rows that modify them (SLIDE, ACCENT, DURACIÓN):
         a row of its own, so the rows on both sides keep their height. */
      .sq > .gap {
        grid-column: 1 / -1;
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
        min-height: 12px;
      }
      /* Short screens: every key keeps a finger-sized height (sixteen columns leave less
         width, see docs/LAYOUT.md); the zone around the grid scrolls when the rows do not fit. */
      @media ${SHORT} {
        :host {
          flex: none;
          width: 100%;
          min-height: min-content;
        }
        .sq {
          gap: 4px;
        }
        .st {
          min-height: 34px;
        }
        .st::before {
          top: 3px;
          height: 3px;
        }
        .sq span {
          font-size: 9px;
        }
        .sq > span:not(.nm) {
          min-width: 36px;
        }
      }
    `,
  ];

  /** Row captions, top to bottom. */
  @property({ attribute: false }) rows: readonly string[] = [];
  @property({ attribute: false }) pattern: Pattern = [];
  /** Rows from this index on are set apart by a gap (BASS: below the notes), or null. */
  @property({ type: Number }) split: number | null = null;
  /** Keys shown dimmed, same shape as `pattern`, or null. */
  @property({ attribute: false }) dimmed: Pattern | null = null;
  /** Step being played, or -1. */
  @property({ type: Number }) step = -1;

  override render(): TemplateResult {
    const count = this.rows.length;
    const split = this.split !== null && this.split > 0 && this.split < count ? this.split : null;
    const rows =
      split === null
        ? `auto repeat(${count},1fr)`
        : `auto repeat(${split},1fr) ${GAP_PX}px repeat(${count - split},1fr)`;
    return html`<div
      class="sq"
      style="grid-template-rows:${rows}"
      @click=${this.onClick}
    >
      <span></span>${COLUMNS.map((col) => html`<span class="nm">${col + 1}</span>`)}
      ${this.rows.map((label, row) => this.row(label, row))}
    </div>`;
  }

  private row(label: string, row: number): TemplateResult {
    const cells = this.pattern[row] ?? [];
    const dimmed = this.dimmed?.[row];
    return html`${row === this.split ? html`<i class="gap"></i>` : nothing}<span>${label}</span>${COLUMNS.map(
        (col) => {
        const active = cells[col] === true;
        return html`<button
          class=${classMap({
            st: true,
            a: active,
            g: ((col >> 2) & 1) === 1,
            ph: col === this.step,
            dim: dimmed?.[col] === true,
          })}
          data-r=${row}
          data-c=${col}
          aria-label="${label} ${col + 1}"
          aria-pressed=${active}
        ></button>`;
        },
      )}`;
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
