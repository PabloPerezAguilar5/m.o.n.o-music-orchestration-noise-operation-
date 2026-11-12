import { css, html, LitElement, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { DIST_TYPES, type DistType } from '../../core/nodes';
import { DIST_TYPE_LABELS } from '../labels';
import { hardwareKey, reset } from '../styles/shared';

export type TypeChangeEvent = CustomEvent<{ type: DistType }>;

/** DISTORSIÓN character selector: three keys, one lit. Fires `type-change`. */
@customElement('mono-type-switch')
export class MonoTypeSwitch extends LitElement {
  static override styles = [
    reset,
    css`
      :host {
        flex: 1;
        display: flex;
        gap: 10px;
      }
      button {
        flex: 1;
        border-radius: 8px;
        letter-spacing: 0.1em;
        ${hardwareKey}
      }
      button.a {
        box-shadow: inset 0 4px 0 var(--c);
      }
    `,
  ];

  @property() value: DistType = 'soft';

  override render(): TemplateResult {
    return html`${DIST_TYPES.map(
      (type) =>
        html`<button
          class=${classMap({ a: type === this.value })}
          data-type=${type}
          aria-pressed=${type === this.value}
          @click=${() => this.choose(type)}
        >
          ${DIST_TYPE_LABELS[type]}
        </button>`,
    )}`;
  }

  private choose(type: DistType): void {
    this.dispatchEvent(
      new CustomEvent('type-change', { detail: { type } }) satisfies TypeChangeEvent,
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mono-type-switch': MonoTypeSwitch;
  }
}
