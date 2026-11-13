import { css, html, LitElement, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { keyboardLayout } from '../../core/keyboard';
import { LEAD_WHITE_KEYS } from '../../core/lead';
import { reset } from '../styles/shared';

/** A finger (pointer id) on a key, as semitones above the keyboard's first C. */
export type KeyDownEvent = CustomEvent<{ touch: number; semitone: number }>;
export type KeyUpEvent = CustomEvent<{ touch: number }>;

/** Two octaves from C plus the top C. */
const LAYOUT = keyboardLayout(LEAD_WHITE_KEYS);
/** Width of one white key, in % of the keyboard. */
const WHITE_WIDTH = 100 / LAYOUT.white.length;

/**
 * LEAD keyboard, played live with any number of fingers. Fires `key-down` when a finger
 * lands on a key, `key-move` when it slides onto another one and `key-up` when it lifts.
 * Controlled: the keys lit are `held`; `dimmed` keys (outside the scale under SCALE
 * LOCK) still play.
 */
@customElement('mono-keys')
export class MonoKeys extends LitElement {
  static override styles = [
    reset,
    css`
      :host {
        position: relative;
        display: flex;
        flex: 1;
        gap: 2px;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
      }
      .wk {
        flex: 1;
        background: linear-gradient(#d8d8ea, #9a9ab4);
        border-radius: 0 0 5px 5px;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        padding-bottom: 3px;
        color: #2a2a40;
        font-size: 10px;
      }
      .wk.p {
        background: var(--c);
        box-shadow: 0 0 14px var(--c);
      }
      .bk {
        position: absolute;
        top: 0;
        height: 58%;
        width: calc(${WHITE_WIDTH}% * 0.6);
        transform: translateX(-50%);
        background: #14141f;
        border: 1px solid #3b3b55;
        border-radius: 0 0 4px 4px;
      }
      .bk.p {
        background: var(--c);
      }
      /* Outside the scale under SCALE LOCK: they play the nearest note of the scale. */
      .wk.out:not(.p) {
        background: linear-gradient(#a9a9bb, #7a7a90);
        color: #4a4a60;
      }
      .bk.out:not(.p) {
        background: #2a2a38;
      }
    `,
  ];

  /** Keys lit (held down), as semitones. */
  @property({ attribute: false }) held: ReadonlySet<number> = new Set();
  @property({ attribute: false }) dimmed: ReadonlySet<number> = new Set();
  /** Octave number of the first C (labels C4, C5…). */
  @property({ type: Number }) octave = 4;

  /** Finger → key it is on. */
  private readonly fingers = new Map<number, number>();

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const touch of [...this.fingers.keys()]) this.lift(touch);
  }

  override render(): TemplateResult {
    return html`${LAYOUT.white.map(
      (key) =>
        html`<div
          class=${classMap({ wk: true, p: this.held.has(key.semitone), out: this.dimmed.has(key.semitone) })}
          data-semitone=${key.semitone}
          @pointerdown=${this.onPointerDown}
        >
          ${key.label === 'C' ? `C${this.octave + Math.floor(key.semitone / 12)}` : key.label}
        </div>`,
    )}${LAYOUT.black.map(
      (key) =>
        html`<div
          class=${classMap({ bk: true, p: this.held.has(key.semitone), out: this.dimmed.has(key.semitone) })}
          data-semitone=${key.semitone}
          data-note=${key.label}
          style="left:${(key.after + 1) * WHITE_WIDTH}%"
          @pointerdown=${this.onPointerDown}
        ></div>`,
    )}`;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button > 0) return;
    const semitone = Number((event.currentTarget as HTMLElement).dataset.semitone);
    const touch = event.pointerId;
    // The keyboard follows the finger from here on, also across keys and outside.
    try {
      this.setPointerCapture(touch);
    } catch {
      // A synthetic event without a live pointer: the key still plays.
    }
    if (this.fingers.has(touch)) this.lift(touch);
    this.fingers.set(touch, semitone);
    this.fire('key-down', { touch, semitone });
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const current = this.fingers.get(event.pointerId);
    if (current === undefined) return;
    const key = this.shadowRoot
      ?.elementsFromPoint(event.clientX, event.clientY)
      .find((element): element is HTMLElement => element instanceof HTMLElement && 'semitone' in element.dataset);
    if (!key) return; // off the keyboard: the note stays
    const semitone = Number(key.dataset.semitone);
    if (semitone === current) return;
    this.fingers.set(event.pointerId, semitone);
    this.fire('key-move', { touch: event.pointerId, semitone });
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.lift(event.pointerId);
  };

  private lift(touch: number): void {
    if (!this.fingers.delete(touch)) return;
    this.fire('key-up', { touch });
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('pointermove', this.onPointerMove);
    this.addEventListener('pointerup', this.onPointerUp);
    this.addEventListener('pointercancel', this.onPointerUp);
    this.addEventListener('lostpointercapture', this.onPointerUp);
  }

  private fire(type: 'key-down' | 'key-move' | 'key-up', detail: { touch: number; semitone?: number }): void {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mono-keys': MonoKeys;
  }
}
