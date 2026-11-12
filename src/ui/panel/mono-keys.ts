import { css, html, LitElement, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { reset } from '../styles/shared';

export type KeyPressEvent = CustomEvent<{ semitone: number }>;

/** How long a key stays lit after a press. */
const PRESS_MS = 220;

/** White keys from E, with their distance in semitones from the first one. */
const WHITE_KEYS = [
  { label: 'E', semitone: 0 },
  { label: 'F', semitone: 1 },
  { label: 'G', semitone: 3 },
  { label: 'A', semitone: 5 },
  { label: 'B', semitone: 7 },
  { label: 'C', semitone: 8 },
  { label: 'D', semitone: 10 },
  { label: 'E', semitone: 12 },
  { label: 'F', semitone: 13 },
  { label: 'G', semitone: 15 },
] as const;

/** Black keys: `after` is the index of the white key on their left. */
const BLACK_KEYS = [
  { after: 1, semitone: 2 },
  { after: 2, semitone: 4 },
  { after: 3, semitone: 6 },
  { after: 5, semitone: 9 },
  { after: 6, semitone: 11 },
  { after: 8, semitone: 14 },
] as const;

/** LEAD keyboard, played live. Fires `key-press` with the semitone above the lowest key. */
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
    return html`${WHITE_KEYS.map(
      (key) =>
        html`<div
          class=${classMap({ wk: true, p: this.pressed.has(key.semitone) })}
          data-semitone=${key.semitone}
          @pointerdown=${this.onPointerDown}
        >
          ${key.label}
        </div>`,
    )}${BLACK_KEYS.map(
      (key) =>
        html`<div
          class=${classMap({ bk: true, p: this.pressed.has(key.semitone) })}
          data-semitone=${key.semitone}
          style="left:${(key.after + 1) * 10}%"
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
