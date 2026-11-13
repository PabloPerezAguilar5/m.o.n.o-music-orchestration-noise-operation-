import { css, html, LitElement, type TemplateResult } from 'lit';
import { customElement } from 'lit/decorators.js';
import { store } from '../state';
import './panel/mono-panel';
import './stage/mono-stage';
import { Selector } from './store-controller';
import { reset } from './styles/shared';

/** App shell: the canvas on top, the selected node's hardware panel below. */
@customElement('mono-app')
export class MonoApp extends LitElement {
  static override styles = [
    reset,
    css`
      :host {
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 6px;
      }
    `,
  ];

  private readonly audioState = new Selector(this, store, (s) => s.audio.state);

  override render(): TemplateResult {
    // Exposed for styling and browser tests: idle, starting, running, blocked, unavailable.
    this.setAttribute('audio-state', this.audioState.value);
    return html`<mono-stage></mono-stage><mono-panel></mono-panel>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mono-app': MonoApp;
  }
}
