import { css, html, LitElement, nothing, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { STEPS, type Pattern } from '../../core/patterns';
import { reset } from '../styles/shared';

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
      /* A key that does nothing right now (e.g. ACCENT on a step without a note). Still tappable. */
      .st.dim {
        opacity: 0.4;
      }
      /* Many rows (SYNTH: ten notes and DUR): tighter, so they fit the zone. */
      .sq.dense {
        gap: 2px;
      }
      .dense .st {
        min-height: 9px;
        box-shadow: 0 1px 0 #0006;
      }
      .dense .st::before {
        top: 1px;
        height: 2px;
      }
      /* A value written on the key (SYNTH: the length of each step). */
      .st b {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding-top: 2px;
        font-size: 8px;
        line-height: 1;
        color: #1b1b22;
        pointer-events: none;
      }
    `,
  ];

  /** Row captions, top to bottom. */
  @property({ attribute: false }) rows: readonly string[] = [];
  @property({ attribute: false }) pattern: Pattern = [];
  /** Text written on the keys of one row (e.g. SYNTH's DURACIÓN), or null. */
  @property({ attribute: false }) texts: { readonly row: number; readonly values: readonly string[] } | null = null;
  /** Rows from this index on are set apart by a gap (BASS and SYNTH: below the notes), or null. */
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
      class=${count > 8 ? 'sq dense' : 'sq'}
      style="grid-template-rows:${rows}"
      @click=${this.onClick}
    >
      <span></span>${COLUMNS.map((col) => html`<span class="nm">${col + 1}</span>`)}
      ${this.rows.map((label, row) => this.row(label, row))}
    </div>`;
  }

  private row(label: string, row: number): TemplateResult {
    const cells = this.pattern[row] ?? [];
    const texts = this.texts?.row === row ? this.texts.values : null;
    const dimmed = this.dimmed?.[row];
    return html`${row === this.split ? html`<i class="gap"></i>` : nothing}<span>${label}</span>${COLUMNS.map(
        (col) => {
        const active = cells[col] === true;
        const text = texts?.[col] ?? '';
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
          aria-label="${label} ${col + 1}${text ? ` ${text}` : ''}"
          aria-pressed=${active}
        >${text ? html`<b>${text}</b>` : nothing}</button>`;
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
