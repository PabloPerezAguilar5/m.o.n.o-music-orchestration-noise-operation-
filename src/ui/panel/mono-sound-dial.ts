import { css, html, LitElement, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { hardwareKey, reset, SHORT } from '../styles/shared';

export type DialPickEvent = CustomEvent<{ id: string }>;

/** Where the pointer points for each of the four positions, in degrees from straight up. */
const ANGLES = [-45, 45, 135, -135] as const;
/** The names go clockwise from the top left; the grid cell each one sits in. */
const CELLS = ['tl', 'tr', 'br', 'bl'] as const;

/**
 * A big four-position selector: a black knob with its four names around it (SYNTH:
 * PLUCK, PAD, STAB, GLASS). Tapping a name picks it; tapping the knob moves to the next
 * one, and the arrow keys do too. The picked name has its LED on. Controlled: it shows
 * `value` and fires `dial-pick`.
 */
@customElement('mono-sound-dial')
export class MonoSoundDial extends LitElement {
  static override styles = [
    reset,
    css`
      :host {
        display: block;
        height: calc(var(--ks) + 14px);
      }
      .dial {
        height: 100%;
        display: grid;
        grid-template-columns: auto auto auto;
        grid-template-rows: 1fr 1fr;
        gap: 4px;
        align-items: stretch;
      }
      .tl {
        grid-area: 1 / 1;
      }
      .tr {
        grid-area: 1 / 3;
      }
      .bl {
        grid-area: 2 / 1;
      }
      .br {
        grid-area: 2 / 3;
      }
      .nm {
        position: relative;
        min-width: 44px;
        padding: 4px 6px 0;
        border-radius: 5px;
        font-size: 8px;
        letter-spacing: 0.1em;
        ${hardwareKey}
      }
      .nm:active {
        box-shadow: inset 0 3px 0 var(--c);
      }
      .nm::before {
        content: '';
        position: absolute;
        left: 30%;
        right: 30%;
        top: 3px;
        height: 2px;
        border-radius: 1px;
        background: #3c2a2a;
      }
      .nm.on::before {
        background: var(--c);
        box-shadow: 0 0 6px var(--c);
      }
      /* The knob sits between the names, across both rows. */
      .kn {
        grid-area: 1 / 2 / 3 / 3;
        align-self: center;
        position: relative;
        width: calc(var(--ks) + 14px);
        height: calc(var(--ks) + 14px);
        padding: 0;
        border: 0;
        border-radius: 50%;
        /* The ring: the four stops, like the notches printed around a rotary switch. */
        background: conic-gradient(
          from 0deg,
          #8b877b 0 4deg,
          transparent 0 86deg,
          #8b877b 0 94deg,
          transparent 0 176deg,
          #8b877b 0 184deg,
          transparent 0 266deg,
          #8b877b 0 274deg,
          transparent 0
        );
      }
      .kn::before {
        content: '';
        position: absolute;
        inset: 7%;
        border-radius: 50%;
        background: radial-gradient(circle at 35% 28%, #4a4a58, #0d0d13 70%);
        box-shadow: 0 2px 3px #0008;
      }
      .kn:focus-visible {
        outline: 2px solid #14141c;
        outline-offset: 2px;
      }
      /* The pointer: a light notch on the knob, turned to the picked position. */
      .ptr {
        position: absolute;
        inset: 0;
        transform: rotate(var(--a));
        transition: transform 120ms ease-out;
        pointer-events: none;
      }
      .ptr::after {
        content: '';
        position: absolute;
        left: 50%;
        top: 14%;
        width: 3px;
        height: 24%;
        margin-left: -1.5px;
        border-radius: 2px;
        background: #ededf7;
      }
      @media (prefers-reduced-motion: reduce) {
        .ptr {
          transition: none;
        }
      }
      /* Short screens: names of 44 px, a bigger knob between them. */
      @media ${SHORT} {
        :host {
          height: auto;
        }
        .dial {
          grid-template-rows: 44px 44px;
        }
        .nm {
          min-height: 44px;
          padding-top: 8px;
          font-size: 10px;
        }
        .nm::before {
          top: 5px;
          height: 3px;
        }
        .kn {
          width: 76px;
          height: 76px;
        }
      }
    `,
  ];

  @property({ attribute: false }) ids: readonly string[] = [];
  @property({ attribute: false }) labels: Readonly<Record<string, string>> = {};
  @property() value = '';
  /** Caption prefix for the names ("Sonido PAD"). */
  @property() caption = '';
  /** What the knob says to a screen reader. */
  @property() hint = '';

  override render(): TemplateResult {
    const index = Math.max(0, this.ids.indexOf(this.value));
    return html`<div class="dial">
      ${this.ids.map(
        (id, i) => html`<button
          class=${classMap({ nm: true, [CELLS[i] ?? 'tl']: true, on: id === this.value })}
          data-preset=${id}
          aria-label="${this.caption} ${this.labels[id] ?? id}"
          aria-pressed=${id === this.value}
          @click=${() => this.pick(id)}
        >
          ${this.labels[id] ?? id}
        </button>`,
      )}
      <button
        class="kn"
        id="sound-dial"
        aria-label="${this.hint} (${this.labels[this.value] ?? this.value})"
        @click=${() => this.step(1)}
        @keydown=${this.onKey}
      >
        <i class="ptr" style="--a:${ANGLES[index] ?? 0}deg"></i>
      </button>
    </div>`;
  }

  private pick(id: string): void {
    this.dispatchEvent(new CustomEvent('dial-pick', { detail: { id } }) satisfies DialPickEvent);
  }

  /** The next (or previous) position, in the order of `ids`. */
  private step(direction: 1 | -1): void {
    const count = this.ids.length;
    if (count === 0) return;
    const next = (Math.max(0, this.ids.indexOf(this.value)) + direction + count) % count;
    this.pick(this.ids[next]!);
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') this.step(1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') this.step(-1);
    else return;
    event.preventDefault();
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'mono-sound-dial': MonoSoundDial;
  }
}
