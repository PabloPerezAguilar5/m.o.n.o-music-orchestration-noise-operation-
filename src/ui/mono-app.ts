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

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('keydown', this.onKeyDown);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.onKeyDown);
  }

  /**
   * Space plays and stops, from anywhere except while typing (e.g. the tempo field) or
   * when a focused control already used it (the tempo display opens its field). It also
   * keeps the space from pressing whatever key has the focus.
   */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Space' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.defaultPrevented) return;
    // Shadow DOM retargets the event; the first element of the path is the real target.
    const target = event.composedPath()[0];
    if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) {
      return;
    }
    event.preventDefault();
    if (!event.repeat) store.togglePlay();
  };

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
