import { css, html, LitElement, nothing, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { InstrumentId } from '../../core/nodes';
import { NODE_NAMES, TEXT } from '../labels';
import { reset } from '../styles/shared';
import { NODE_COLORS } from '../theme';
import { SHAPES } from './shapes';

export type NodeAddEvent = CustomEvent<{ id: InstrumentId }>;

/**
 * The + button with its menu of node types still available.
 * Fires `menu-toggle` and `node-add`.
 */
@customElement('mono-add-menu')
export class MonoAddMenu extends LitElement {
  static override styles = [
    reset,
    css`
      :host {
        display: contents;
      }
      #add {
        position: absolute;
        right: 14px;
        bottom: 12px;
        width: 46px;
        height: 46px;
        border-radius: 50%;
        border: 2px solid var(--ink);
        background: var(--bg);
        font-size: 26px;
        line-height: 1;
        box-shadow: 0 0 14px rgba(237, 237, 247, 0.25);
      }
      #menu {
        position: absolute;
        right: 70px;
        bottom: 10px;
        display: flex;
        gap: 7px;
      }
      .chip {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        width: 62px;
        padding: 6px 2px;
        border: 1.5px solid var(--c);
        border-radius: 10px;
        background: #1b1b2aee;
        color: var(--c);
        font-size: 9px;
        letter-spacing: 0.06em;
        animation: pop 0.18s ease-out both;
      }
      .chip svg {
        width: 26px;
        height: 26px;
      }
      @keyframes pop {
        from {
          transform: translateX(14px) scale(0.8);
          opacity: 0;
        }
      }
      #hint {
        position: absolute;
        right: 72px;
        bottom: 24px;
        font-size: 11px;
        opacity: 0.75;
        animation: blink 1.8s infinite;
      }
      @keyframes blink {
        50% {
          opacity: 0.25;
        }
      }
    `,
  ];

  /** Node types not on the canvas yet. */
  @property({ attribute: false }) free: readonly InstrumentId[] = [];
  @property({ type: Boolean }) open = false;
  @property({ type: Boolean }) hint = false;

  override render(): TemplateResult {
    return html`
      ${this.hint ? html`<div id="hint">${TEXT.hint}</div>` : nothing}
      <div id="menu">${this.open ? this.free.map((id) => this.chip(id)) : nothing}</div>
      ${this.free.length > 0
        ? html`<button id="add" aria-label=${TEXT.addNode} @click=${this.toggle}>+</button>`
        : nothing}
    `;
  }

  private chip(id: InstrumentId): TemplateResult {
    return html`<button
      class="chip"
      data-id=${id}
      style="--c:${NODE_COLORS[id]}"
      @click=${() => this.add(id)}
    >
      <svg viewBox="-40 -40 80 80">
        <path
          d=${SHAPES[id]}
          fill="none"
          stroke="currentColor"
          stroke-width="5"
          stroke-linejoin="round"
        /></svg
      >${NODE_NAMES[id]}
    </button>`;
  }

  private readonly toggle = (): void => {
    this.dispatchEvent(new CustomEvent('menu-toggle'));
  };

  private add(id: InstrumentId): void {
    this.dispatchEvent(new CustomEvent('node-add', { detail: { id } }) satisfies NodeAddEvent);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mono-add-menu': MonoAddMenu;
  }
}
