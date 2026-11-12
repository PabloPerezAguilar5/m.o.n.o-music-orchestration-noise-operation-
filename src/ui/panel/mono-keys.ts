import { css, html, LitElement, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { keyboardLayout } from '../../core/keyboard';
import { reset } from '../styles/shared';

export type KeyPressEvent = CustomEvent<{ semitone: number }>;

/** How long a key stays lit after a press. */
const PRESS_MS = 220;

/** Ten white keys from C: C D E F G A B C D E. */
const LAYOUT = keyboardLayout(10);
/** Width of one white key, in % of the keyboard. */
const WHITE_WIDTH = 100 / LAYOUT.white.length;

/** LEAD keyboard, played live. Fires `key-press` with the semitone above the lowest C. */
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
        width: 6%;
        transform: translateX(-50%);
        background: #14141f;
        border: 1px solid #3b3b55;
        border-radius: 0 0 4px 4px;
      }
      .bk.p {
        background: var(--c);
      }
    `,
  ];

  @state() private pressed: ReadonlySet<number> = new Set();
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.pressed = new Set();
  }

  override render(): TemplateResult {
    return html`${LAYOUT.white.map(
      (key) =>
        html`<div
          class=${classMap({ wk: true, p: this.pressed.has(key.semitone) })}
          data-semitone=${key.semitone}
          @pointerdown=${this.onPointerDown}
        >
          ${key.label}
        </div>`,
    )}${LAYOUT.black.map(
      (key) =>
        html`<div
          class=${classMap({ bk: true, p: this.pressed.has(key.semitone) })}
          data-semitone=${key.semitone}
          data-note=${key.label}
          style="left:${(key.after + 1) * WHITE_WIDTH}%"
          @pointerdown=${this.onPointerDown}
        ></div>`,
    )}`;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    const semitone = Number((event.currentTarget as HTMLElement).dataset.semitone);
    this.setPressed(semitone, true);
    clearTimeout(this.timers.get(semitone));
    this.timers.set(
      semitone,
      setTimeout(() => this.setPressed(semitone, false), PRESS_MS),
    );
    this.dispatchEvent(
      new CustomEvent('key-press', { detail: { semitone } }) satisfies KeyPressEvent,
    );
  };

  private setPressed(semitone: number, on: boolean): void {
    const next = new Set(this.pressed);
    if (on) next.add(semitone);
    else next.delete(semitone);
    this.pressed = next;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mono-keys': MonoKeys;
  }
}
