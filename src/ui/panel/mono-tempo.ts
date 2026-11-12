import { css, html, LitElement, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { TEXT } from '../labels';
import { hardwareKey, reset } from '../styles/shared';

export type TempoNudgeEvent = CustomEvent<{ direction: 1 | -1 }>;

/** MASTER zone: tempo display with − / + keys and play/stop. Fires `tempo-nudge` and `transport-toggle`. */
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
      }
      button {
        border-radius: 8px;
        height: 36px;
        padding: 0 14px;
        ${hardwareKey}
      }
    `,
  ];

  @property({ type: Number }) bpm = 120;

  override render(): TemplateResult {
    return html`<div class="lcd"><span id="bv">${this.bpm}</span></div>
      <button data-b="-1" aria-label=${TEXT.slower} @click=${() => this.nudge(-1)}>−</button>
      <button data-b="1" aria-label=${TEXT.faster} @click=${() => this.nudge(1)}>+</button>
      <button id="pp" aria-label=${TEXT.playStop} @click=${this.toggle}>▶ / ■</button>`;
  }

  private nudge(direction: 1 | -1): void {
    this.dispatchEvent(
      new CustomEvent('tempo-nudge', { detail: { direction } }) satisfies TempoNudgeEvent,
    );
  }

  private readonly toggle = (): void => {
    this.dispatchEvent(new CustomEvent('transport-toggle'));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'mono-tempo': MonoTempo;
  }
}
