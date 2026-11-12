import { css, html, LitElement, type PropertyValues, type TemplateResult } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { parseBpm } from '../../core/transport';
import { holdRepeat } from '../hold-repeat';
import { TEXT } from '../labels';
import { hardwareKey, reset } from '../styles/shared';

export type TempoNudgeEvent = CustomEvent<{ direction: 1 | -1 }>;
export type TempoSetEvent = CustomEvent<{ bpm: number }>;

/**
 * MASTER zone: tempo display with − / + keys and play/stop.
 * Holding − or + repeats, faster the longer it is held. Tapping the display
 * lets you type the tempo (Enter or tapping elsewhere confirms, Escape cancels).
 * Fires `tempo-nudge`, `tempo-set` and `transport-toggle`.
 */
@customElement('mono-tempo')
export class MonoTempo extends LitElement {
  static override styles = [
    reset,
    css`
      :host {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .lcd {
        font-size: clamp(26px, 7vh, 44px);
        letter-spacing: 0.1em;
        color: var(--c);
        padding: 2px 16px;
        border: 1px solid #000;
        border-radius: 6px;
        background: #0d0508;
        text-shadow: 0 0 10px var(--c);
        cursor: text;
      }
      .lcd:focus {
        outline: none;
      }
      .lcd:focus-visible {
        outline: 2px solid var(--c);
        outline-offset: 2px;
      }
      /* Three digits wide whatever the value, so the keys beside it never shift. */
      #bv,
      #bv-input {
        display: inline-block;
        min-width: calc(3ch + 0.3em);
        text-align: center;
      }
      #bv-input {
        width: calc(3ch + 0.3em);
        padding: 0;
        margin: 0;
        border: 0;
        outline: none;
        background: transparent;
        font: inherit;
        letter-spacing: inherit;
        color: inherit;
        text-shadow: inherit;
        caret-color: var(--c);
      }
      button {
        border-radius: 8px;
        height: 36px;
        padding: 0 14px;
        touch-action: none;
        ${hardwareKey}
      }
    `,
  ];

  @property({ type: Number }) bpm = 120;
  @state() private editing = false;
  @query('#bv-input') private input?: HTMLInputElement;
  private stopRepeat: (() => void) | null = null;

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.release();
  }

  protected override updated(changed: PropertyValues): void {
    if (changed.has('editing') && this.editing && this.input) {
      this.input.focus();
      this.input.select();
    }
  }

  override render(): TemplateResult {
    return html`${this.display()}
      <button
        data-b="-1"
        aria-label=${TEXT.slower}
        @pointerdown=${(event: PointerEvent) => this.press(event, -1)}
        @click=${(event: MouseEvent) => this.keyboardClick(event, -1)}
      >
        −
      </button>
      <button
        data-b="1"
        aria-label=${TEXT.faster}
        @pointerdown=${(event: PointerEvent) => this.press(event, 1)}
        @click=${(event: MouseEvent) => this.keyboardClick(event, 1)}
      >
        +
      </button>
      <button id="pp" aria-label=${TEXT.playStop} @click=${this.toggle}>▶ / ■</button>`;
  }

  private display(): TemplateResult {
    if (this.editing) {
      return html`<div class="lcd">
        <input
          id="bv-input"
          inputmode="numeric"
          maxlength="3"
          autocomplete="off"
          aria-label=${TEXT.tempoInput}
          .value=${String(this.bpm)}
          @keydown=${this.onInputKey}
          @blur=${this.commit}
        />
      </div>`;
    }
    return html`<div
      class="lcd"
      role="button"
      tabindex="0"
      aria-label=${TEXT.editTempo}
      @click=${this.startEditing}
      @keydown=${this.onDisplayKey}
    >
      <span id="bv">${this.bpm}</span>
    </div>`;
  }

  // − / +

  /** Pointer press: one step now, then repeating while held. */
  private press(event: PointerEvent, direction: 1 | -1): void {
    if (event.button !== 0) return;
    const button = event.currentTarget as HTMLElement;
    button.setPointerCapture(event.pointerId);
    this.release();
    this.stopRepeat = holdRepeat(() => this.nudge(direction));
    const end = (): void => {
      this.release();
      button.removeEventListener('pointerup', end);
      button.removeEventListener('pointercancel', end);
      button.removeEventListener('lostpointercapture', end);
    };
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    button.addEventListener('lostpointercapture', end);
  }

  /** Pointer presses are handled on pointerdown; only keyboard activation (detail 0) counts here. */
  private keyboardClick(event: MouseEvent, direction: 1 | -1): void {
    if (event.detail === 0) this.nudge(direction);
  }

  private release(): void {
    this.stopRepeat?.();
    this.stopRepeat = null;
  }

  private nudge(direction: 1 | -1): void {
    this.dispatchEvent(
      new CustomEvent('tempo-nudge', { detail: { direction } }) satisfies TempoNudgeEvent,
    );
  }

  // Typed tempo

  private readonly startEditing = (): void => {
    this.editing = true;
  };

  private readonly onDisplayKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.startEditing();
  };

  private readonly onInputKey = (event: KeyboardEvent): void => {
    if (event.key === 'Enter') this.commit();
    else if (event.key === 'Escape') this.editing = false;
  };

  /** Applies the typed value; anything that is not a number leaves the tempo as it was. */
  private readonly commit = (): void => {
    if (!this.editing) return;
    this.editing = false;
    const bpm = parseBpm(this.input?.value ?? '');
    if (bpm === null) return;
    this.dispatchEvent(new CustomEvent('tempo-set', { detail: { bpm } }) satisfies TempoSetEvent);
  };

  private readonly toggle = (): void => {
    this.dispatchEvent(new CustomEvent('transport-toggle'));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'mono-tempo': MonoTempo;
  }
}
