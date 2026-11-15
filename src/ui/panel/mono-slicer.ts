import { css, html, LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import type { LoopLoadState } from '../../core/audio-scene';
import {
  DEFAULT_LOOP,
  loopsIn,
  MAX_LOOP_BARS,
  sameLoop,
  SLICE_CATEGORIES,
  SLICES,
  type BassLoop,
  type SliceBar,
  type SliceCategory,
  type SliceLoopRef,
  type SlicePattern,
} from '../../core/slice';
import { loopLabel, SLICE_CATEGORY_LABELS, TEXT } from '../labels';
import { hardwareKey, reset, SHORT } from '../styles/shared';

/** What was touched on the SLICE zone. The panel turns it into store actions and cues. */
export type SliceAction =
  | { readonly type: 'category'; readonly category: SliceCategory }
  | { readonly type: 'loop'; readonly loop: BassLoop }
  | { readonly type: 'bar'; readonly bar: SliceBar }
  | { readonly type: 'sync' }
  | { readonly type: 'reverse' }
  | { readonly type: 'slice'; readonly slice: number }
  | { readonly type: 'step'; readonly step: number };
export type SliceActionEvent = CustomEvent<SliceAction>;

const COLUMNS = Array.from({ length: SLICES }, (_, index) => index);
const BARS = Array.from({ length: MAX_LOOP_BARS }, (_, index) => index);

/** Wave strip colours (the display family: dark glass, the node colour for what sounds). */
const WAVE_BG = '#0d0508';
const WAVE_INK = '#8f8aa8';
const WAVE_INK_SELECTED = '#ededf7';
const WAVE_LINE = '#2c2436';

/**
 * BASS in SLICE mode, under the knobs: the loop (its set and a list of its loops), the
 * bar it is cut from (BAR 1–4, AUTO), SYNC and REVERSE, the wave of that bar with its 16
 * pieces marked, and the 16 steps, each showing the piece it plays. Fires `slice-action`.
 * It scrolls inside itself when the panel is too low for it.
 */
@customElement('mono-slicer')
export class MonoSlicer extends LitElement {
  static override styles = [
    reset,
    css`
      :host {
        flex: 1;
        display: flex;
        gap: 10px;
        min-height: 0;
        min-width: 0;
        overflow: auto;
      }
      .pk {
        min-height: 22px;
        padding: 0 6px;
        border-radius: 5px;
        font-size: 8px;
        letter-spacing: 0.1em;
        ${hardwareKey}
      }
      .pk:disabled {
        opacity: 0.45;
        cursor: default;
      }
      .pk.led {
        position: relative;
        padding-top: 5px;
      }
      .pk.led::before {
        content: '';
        position: absolute;
        left: 30%;
        right: 30%;
        top: 3px;
        height: 2px;
        border-radius: 1px;
        background: #3c2a2a;
      }
      .pk.led.on::before {
        background: var(--c);
        box-shadow: 0 0 6px var(--c);
      }

      /* Loop column: set keys, then the list. */
      .lp {
        flex: none;
        width: 182px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-height: 120px;
      }
      .cats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 4px;
      }
      .cats .pk {
        padding-left: 2px;
        padding-right: 2px;
      }
      .list {
        flex: 1;
        min-height: 60px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        background: #0d0508;
        border: 1px solid #000;
        border-radius: 3px;
        box-shadow: inset 0 0 8px #000;
        scrollbar-width: thin;
        scrollbar-color: #3a3a50 transparent;
      }
      .it {
        flex: none;
        text-align: left;
        padding: 4px 10px;
        border: 0;
        border-bottom: 1px solid #ffffff0a;
        background: none;
        color: var(--c);
        opacity: 0.5;
        font-size: 10px;
        letter-spacing: 0.12em;
        white-space: nowrap;
      }
      .it.sel {
        opacity: 1;
        background: #ffffff10;
        text-shadow: 0 0 6px var(--c);
      }
      .msg {
        padding: 6px 10px;
        color: var(--c);
        opacity: 0.6;
        font-size: 9px;
        letter-spacing: 0.12em;
      }

      /* Main: toolbar, then the grid of wave and steps. */
      .mn {
        flex: 1;
        min-width: 0;
        min-height: 150px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .tb {
        display: flex;
        align-items: stretch;
        gap: 4px;
      }
      .tb .pk {
        min-width: 28px;
      }
      .tb .sp {
        flex: 1;
      }
      .lb {
        font-size: 8px;
        color: #2a2a33;
        font-weight: 700;
        align-self: center;
        letter-spacing: 0.1em;
      }
      .sq {
        flex: 1;
        min-height: 0;
        display: grid;
        gap: 3px;
        grid-template-columns: minmax(44px, max-content) repeat(16, 1fr);
        grid-template-rows: auto minmax(44px, 1fr) auto;
      }
      .sq .nm {
        text-align: center;
        font-size: 8px;
        color: #2a2a33;
        font-weight: 700;
      }
      /* The wave of the bar, with a tap target over each piece. */
      .wv {
        position: relative;
        grid-column: 2 / -1;
        display: grid;
        grid-template-columns: repeat(16, 1fr);
        min-height: 44px;
        border: 1px solid #000;
        border-radius: 3px;
        background: #0d0508;
        box-shadow: inset 0 0 8px #000;
        overflow: hidden;
      }
      .wv canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }
      .sl {
        position: relative;
        z-index: 1;
        background: none;
        border: 0;
        border-left: 1px solid #ffffff0c;
        padding: 0;
      }
      .sl:first-of-type {
        border-left: 0;
      }
      .sl:active {
        background: #ffffff14;
      }
      .ov {
        position: absolute;
        inset: 0;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--c);
        text-shadow: 0 0 6px var(--c);
        font-size: 10px;
        letter-spacing: 0.14em;
        background: #0d0508cc;
        pointer-events: none;
      }
      /* Step keys, as on the sequencer: LED on top, the piece written on the key. */
      .st {
        position: relative;
        min-height: 22px;
        background: linear-gradient(#a9a598, #8f8b7e);
        border: 1px solid #2a2a33;
        border-radius: 3px;
        box-shadow: 0 2px 0 #0006;
      }
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
      .st b {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding-top: 3px;
        font-size: 9px;
        line-height: 1;
        color: #1b1b22;
        pointer-events: none;
      }
      .st:not(.a) b {
        opacity: 0.4;
      }
      /* The step playing the piece picked on the wave. */
      .st.sel b {
        text-decoration: underline;
      }

      /* Short screens: 44 px keys and list rows; the zone scrolls when it does not fit. */
      @media ${SHORT} {
        :host {
          overscroll-behavior: contain;
        }
        .pk {
          min-height: 44px;
          min-width: 44px;
          font-size: 9px;
        }
        .pk.led {
          padding-top: 8px;
        }
        .pk.led::before {
          top: 5px;
          height: 3px;
        }
        .lp {
          width: 150px;
          min-height: 0;
        }
        .list {
          min-height: 132px;
        }
        .it {
          min-height: 44px;
          display: flex;
          align-items: center;
        }
        .mn {
          min-height: 176px;
        }
        .tb {
          flex-wrap: wrap;
        }
        .tb .pk {
          min-width: 44px;
        }
        .st {
          min-height: 34px;
        }
        /* Columns may shrink below their content, so sixteen steps fit at any width. */
        .sq {
          gap: 2px;
          grid-template-columns: minmax(32px, max-content) repeat(16, minmax(0, 1fr));
        }
      }
    `,
  ];

  /** The manifest's loops, or null until it is in. */
  @property({ attribute: false }) loops: readonly BassLoop[] | null = null;
  @property() category: SliceCategory = DEFAULT_LOOP.set;
  @property({ attribute: false }) loop: SliceLoopRef = DEFAULT_LOOP;
  /** Where the loop stands; 'none' when it has not been asked for yet. */
  @property() loopState: LoopLoadState | 'none' = 'none';
  /** Bars of the loop. */
  @property({ type: Number }) bars = 1;
  @property({ attribute: false }) bar: SliceBar = 0;
  /** The bar drawn and cut right now (under AUTO, the one playing). */
  @property({ type: Number }) shownBar = 0;
  @property({ type: Boolean }) sync = false;
  @property({ type: Boolean }) reverse = false;
  @property({ attribute: false }) pattern: SlicePattern = [];
  /** The piece picked on the wave, to put on steps. */
  @property({ type: Number }) selected = 0;
  /** Step being played, or -1. */
  @property({ type: Number }) step = -1;
  /** Peaks of the whole loop (bars × columns), or null while unknown. */
  @property({ attribute: false }) peaks: Float32Array | null = null;

  @query('canvas') private canvas?: HTMLCanvasElement;
  private observer: ResizeObserver | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    this.observer = new ResizeObserver(() => this.draw());
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.observer?.disconnect();
    this.observer = null;
  }

  /** The piece sounding on the step being played, or -1. */
  private get sounding(): number {
    const step = this.pattern[this.step];
    return step?.on ? step.slice : -1;
  }

  override render(): TemplateResult {
    const entries = this.loops ? loopsIn(this.loops, this.category) : [];
    return html`<div class="lp">
        <div class="cats" role="group" aria-label=${TEXT.categoryHint}>
          ${SLICE_CATEGORIES.map(
            (category) => html`<button
              class=${classMap({ pk: true, led: true, on: category === this.category })}
              data-category=${category}
              aria-label="${TEXT.categoryHint} ${SLICE_CATEGORY_LABELS[category]}"
              aria-pressed=${category === this.category}
              @click=${() => this.act({ type: 'category', category })}
            >
              ${SLICE_CATEGORY_LABELS[category]}
            </button>`,
          )}
        </div>
        <div class="list" role="listbox" aria-label=${TEXT.loopHint}>
          ${this.loops === null
            ? html`<span class="msg">${TEXT.loading}…</span>`
            : entries.length === 0
              ? html`<span class="msg">${TEXT.noLoops}</span>`
              : entries.map((loop) => {
                  const selected = sameLoop(loop, this.loop);
                  return html`<button
                    class=${classMap({ it: true, sel: selected })}
                    role="option"
                    data-set=${loop.set}
                    data-loop=${loop.file}
                    aria-selected=${selected}
                    aria-label="${TEXT.loopPreviewHint} ${loopLabel(loop)}"
                    @click=${() => this.act({ type: 'loop', loop })}
                  >
                    ${loopLabel(loop)}
                  </button>`;
                })}
        </div>
      </div>
      <div class="mn">
        <div class="tb">
          <span class="lb">${TEXT.bar}</span>
          ${BARS.map(
            (bar) => html`<button
              class=${classMap({ pk: true, led: true, on: this.bar === bar })}
              data-bar=${bar}
              aria-label="${TEXT.barHint} ${bar + 1}"
              aria-pressed=${this.bar === bar}
              ?disabled=${bar >= this.bars}
              @click=${() => this.act({ type: 'bar', bar })}
            >
              ${bar + 1}
            </button>`,
          )}
          <button
            class=${classMap({ pk: true, led: true, on: this.bar === 'auto' })}
            data-bar="auto"
            aria-label=${TEXT.barAutoHint}
            aria-pressed=${this.bar === 'auto'}
            ?disabled=${this.bars <= 1}
            @click=${() => this.act({ type: 'bar', bar: 'auto' })}
          >
            ${TEXT.barAuto}
          </button>
          <i class="sp"></i>
          <button
            class=${classMap({ pk: true, led: true, on: this.sync })}
            id="slice-sync"
            aria-label=${TEXT.sliceSyncHint}
            aria-pressed=${this.sync}
            @click=${() => this.act({ type: 'sync' })}
          >
            ${TEXT.sliceSync}
          </button>
          <button
            class=${classMap({ pk: true, led: true, on: this.reverse })}
            id="reverse"
            aria-label=${TEXT.reverseHint}
            aria-pressed=${this.reverse}
            @click=${() => this.act({ type: 'reverse' })}
          >
            ${TEXT.reverse}
          </button>
        </div>
        <div class="sq">
          <span></span>${COLUMNS.map((col) => html`<span class="nm">${col + 1}</span>`)}
          <span class="lb">${TEXT.waveRow}</span>
          <div class="wv">
            <canvas aria-hidden="true"></canvas>
            ${COLUMNS.map(
              (slice) => html`<button
                class="sl"
                data-slice=${slice}
                aria-label="${TEXT.sliceHint} ${slice + 1}"
                aria-pressed=${slice === this.selected}
                @click=${() => this.act({ type: 'slice', slice })}
              ></button>`,
            )}
            ${this.overlay()}
          </div>
          <span class="lb">${TEXT.stepRow}</span>
          ${COLUMNS.map((col) => {
            const step = this.pattern[col];
            const on = step?.on === true;
            return html`<button
              class=${classMap({
                st: true,
                a: on,
                g: ((col >> 2) & 1) === 1,
                ph: col === this.step,
                sel: on && step?.slice === this.selected,
              })}
              data-step=${col}
              aria-label="${TEXT.stepHint} ${col + 1}${step ? ` ${TEXT.sliceHint} ${step.slice + 1}` : ''}"
              aria-pressed=${on}
              @click=${() => this.act({ type: 'step', step: col })}
            >
              ${step ? html`<b>${step.slice + 1}${step.reverse ? 'r' : ''}</b>` : nothing}
            </button>`;
          })}
        </div>
      </div>`;
  }

  /** What covers the wave while there is nothing to draw: loading, an error, no loop. */
  private overlay(): TemplateResult | typeof nothing {
    if (this.loopState === 'failed') return html`<span class="ov">${TEXT.loadError} ${this.loop.file}</span>`;
    if (this.peaks) return nothing;
    if (this.loopState === 'loading' || this.loopState === 'ready') return html`<span class="ov">${TEXT.loading}…</span>`;
    return nothing;
  }

  protected override updated(_changed: PropertyValues): void {
    const canvas = this.canvas;
    if (canvas && this.observer) {
      this.observer.disconnect();
      this.observer.observe(canvas);
    }
    this.draw();
  }

  /** Draws the shown bar's peaks, the 16 cut points, the picked piece and the one sounding. */
  private draw(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const colour = getComputedStyle(this).getPropertyValue('--c').trim() || WAVE_INK_SELECTED;
    context.fillStyle = WAVE_BG;
    context.fillRect(0, 0, width, height);

    const sliceWidth = width / SLICES;
    const sounding = this.sounding;
    if (sounding >= 0) {
      context.fillStyle = colour;
      context.globalAlpha = 0.28;
      context.fillRect(sounding * sliceWidth, 0, sliceWidth, height);
      context.globalAlpha = 1;
    }

    const peaks = this.peaks;
    if (peaks && peaks.length > 0) {
      const columns = Math.max(1, Math.floor(peaks.length / Math.max(1, this.bars)));
      const from = Math.min(this.shownBar, this.bars - 1) * columns;
      const middle = height / 2;
      const columnWidth = width / columns;
      for (let i = 0; i < columns; i++) {
        const peak = peaks[from + i] ?? 0;
        const slice = Math.floor((i / columns) * SLICES);
        context.fillStyle = slice === sounding ? colour : slice === this.selected ? WAVE_INK_SELECTED : WAVE_INK;
        const half = Math.max(0.5 * ratio, peak * middle * 0.92);
        context.fillRect(i * columnWidth, middle - half, Math.max(1, columnWidth - 0.5 * ratio), half * 2);
      }
    }

    context.strokeStyle = WAVE_LINE;
    context.lineWidth = ratio;
    for (let slice = 1; slice < SLICES; slice++) {
      const x = Math.round(slice * sliceWidth) + 0.5;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }

    // The picked piece: a frame in the node colour.
    context.strokeStyle = colour;
    context.lineWidth = 2 * ratio;
    context.strokeRect(this.selected * sliceWidth + ratio, ratio, sliceWidth - 2 * ratio, height - 2 * ratio);
  }

  private act(action: SliceAction): void {
    this.dispatchEvent(new CustomEvent('slice-action', { detail: action }) satisfies SliceActionEvent);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mono-slicer': MonoSlicer;
  }
}
