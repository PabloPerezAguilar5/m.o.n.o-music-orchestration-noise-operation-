import { css, html, LitElement, type TemplateResult } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import { lfoMonitor } from '../../state';
import { reset } from '../styles/shared';

/** The display shows about this many cycles of the wave, within the bounds below. */
const CYCLES_SHOWN = 2.5;
const MIN_SECONDS = 0.4;
const MAX_SECONDS = 4;
/** Room above and below the wave at full CANTIDAD, as a share of half the height. */
const HEADROOM = 0.82;

/**
 * LFO display: the wave as the audio thread runs it, scrolling in real time (newest on
 * the right), as tall as CANTIDAD makes it. Drawn on a canvas on every animation frame.
 * Flat while there is no wave (no audio yet).
 */
@customElement('mono-lfo-scope')
export class MonoLfoScope extends LitElement {
  static override styles = [
    reset,
    css`
      :host {
        flex: 1;
        display: block;
        position: relative;
        min-height: 0;
        overflow: hidden;
        border: 1px solid #000;
        border-radius: 6px;
        background: #0d0508;
        box-shadow: inset 0 0 12px #000;
      }
      canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }
    `,
  ];

  /** Cycles per second, to fit about CYCLES_SHOWN of them across. */
  @property({ type: Number }) rate = 1;
  /** CANTIDAD, 0..1: the wave's height. */
  @property({ type: Number }) depth = 1;

  @query('canvas') private canvas!: HTMLCanvasElement;
  private frame = 0;
  private samples = new Float32Array(0);
  private colour = '#CFCFE6';

  override render(): TemplateResult {
    return html`<canvas aria-hidden="true"></canvas>`;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.frame = requestAnimationFrame(this.draw);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  protected override firstUpdated(): void {
    this.colour = getComputedStyle(this).getPropertyValue('--c').trim() || this.colour;
  }

  private readonly draw = (): void => {
    this.frame = requestAnimationFrame(this.draw);
    const canvas = this.canvas;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    context.clearRect(0, 0, width, height);
    const middle = height / 2;
    // Grid: the centre line and a quarter mark each way, faint.
    context.strokeStyle = '#ffffff14';
    context.lineWidth = ratio;
    context.beginPath();
    for (const y of [middle, middle * 0.5, middle * 1.5]) {
      context.moveTo(0, y);
      context.lineTo(width, y);
    }
    context.stroke();

    const seconds = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, CYCLES_SHOWN / Math.max(1e-3, this.rate)));
    const count = Math.max(2, Math.round(seconds * lfoMonitor.rate));
    if (this.samples.length !== count) this.samples = new Float32Array(count);
    const running = lfoMonitor.running;
    if (running) lfoMonitor.recent(count, this.samples);
    else this.samples.fill(0);

    const scale = middle * HEADROOM * Math.max(0, Math.min(1, this.depth));
    context.strokeStyle = this.colour;
    context.lineWidth = 2 * ratio;
    context.lineJoin = 'round';
    context.shadowColor = this.colour;
    context.shadowBlur = 8 * ratio;
    context.beginPath();
    for (let i = 0; i < count; i++) {
      const x = (i / (count - 1)) * width;
      const y = middle - this.samples[i]! * scale;
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
    context.shadowBlur = 0;

    // Where the wave is now: a dot on the right edge.
    const now = middle - (running ? lfoMonitor.latest() : 0) * scale;
    context.fillStyle = this.colour;
    context.beginPath();
    context.arc(width - 3 * ratio, now, 3.5 * ratio, 0, Math.PI * 2);
    context.fill();
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'mono-lfo-scope': MonoLfoScope;
  }
}
