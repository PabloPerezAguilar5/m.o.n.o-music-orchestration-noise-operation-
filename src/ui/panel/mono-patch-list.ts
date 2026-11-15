import { css, html, LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { MAX_PATCH_NAME } from '../../core/patch';
import type { PatchSummary } from '../../state/patch-storage';
import { TEXT } from '../labels';
import { hardwareKey, reset, SHORT } from '../styles/shared';

/** What was touched on the list. The panel turns it into Patches calls. */
export type PatchListAction =
  | { readonly type: 'open'; readonly id: string }
  | { readonly type: 'rename'; readonly id: string; readonly name: string }
  | { readonly type: 'delete'; readonly id: string }
  | { readonly type: 'close' };
export type PatchListActionEvent = CustomEvent<PatchListAction>;

/** A saved patch's date, short, in the device's locale. */
export function patchDateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * LOAD on the MASTER panel: the saved patches, newest first, each with ABRIR, RENOMBRAR
 * (an inline field) and BORRAR (asks once more). A display-style list that scrolls
 * inside itself. Names are text, never markup. Fires `patch-action`.
 */
@customElement('mono-patch-list')
export class MonoPatchList extends LitElement {
  static override styles = [
    reset,
    css`
      :host {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-height: 0;
        min-width: 0;
      }
      .hd {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 9px;
        letter-spacing: 0.14em;
        font-weight: 700;
        color: #2a2a33;
      }
      .hd .warn {
        color: #7a1f1f;
      }
      .hd .sp {
        flex: 1;
      }
      .pk {
        min-height: 26px;
        padding: 0 10px;
        border-radius: 5px;
        font-size: 8px;
        letter-spacing: 0.1em;
        ${hardwareKey}
      }
      .pk.danger {
        color: #5a0f0f;
      }
      .pk:active {
        box-shadow: inset 0 3px 0 var(--c);
      }
      .list {
        flex: 1;
        min-height: 60px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        background: #0d0508;
        border: 1px solid #000;
        border-radius: 3px;
        box-shadow: inset 0 0 8px #000;
        scrollbar-width: thin;
        scrollbar-color: #3a3a50 transparent;
      }
      .row {
        flex: none;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 10px;
        border-bottom: 1px solid #ffffff0a;
        color: var(--c);
        text-shadow: 0 0 6px var(--c);
        font-size: 11px;
        letter-spacing: 0.1em;
      }
      .row .nm {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .row .dt {
        flex: none;
        opacity: 0.6;
        font-size: 9px;
        white-space: nowrap;
      }
      .row input {
        flex: 1;
        min-width: 0;
        padding: 2px 6px;
        border: 1px solid var(--c);
        border-radius: 3px;
        background: #000;
        color: var(--c);
        font: inherit;
        letter-spacing: inherit;
        caret-color: var(--c);
      }
      .row input:focus {
        outline: none;
      }
      .msg {
        padding: 10px;
        color: var(--c);
        opacity: 0.6;
        font-size: 10px;
        letter-spacing: 0.12em;
      }
      /* Short screens: 44 px keys; each row wraps its keys under the name if it must. */
      @media ${SHORT} {
        .pk {
          min-height: 44px;
          min-width: 44px;
        }
        .list {
          min-height: 100px;
        }
        .row {
          flex-wrap: wrap;
          padding: 4px 8px;
        }
        .row input {
          min-height: 44px;
          font-size: 12px;
        }
      }
    `,
  ];

  @property({ attribute: false }) patches: readonly PatchSummary[] = [];
  @property({ type: Boolean }) persistent = true;
  /** The row whose name is being edited. */
  @state() private renaming: string | null = null;
  /** The row whose BORRAR was pressed once. */
  @state() private confirming: string | null = null;
  @query('input') private input?: HTMLInputElement;

  protected override updated(changed: PropertyValues): void {
    if (changed.has('renaming') && this.renaming !== null && this.input) {
      this.input.focus();
      this.input.select();
    }
  }

  override render(): TemplateResult {
    return html`<div class="hd">
        <span>${TEXT.patchListTitle}</span>
        ${this.persistent ? nothing : html`<span class="warn">${TEXT.patchNotPersistent}</span>`}
        <i class="sp"></i>
        <button class="pk" id="patch-close" @click=${() => this.act({ type: 'close' })}>${TEXT.close}</button>
      </div>
      <div class="list" role="list">
        ${this.patches.length === 0
          ? html`<span class="msg">${TEXT.noPatches}</span>`
          : this.patches.map((patch) => this.row(patch))}
      </div>`;
  }

  private row(patch: PatchSummary): TemplateResult {
    const renaming = this.renaming === patch.id;
    const confirming = this.confirming === patch.id;
    return html`<div class="row" role="listitem" data-id=${patch.id}>
      ${renaming
        ? html`<input
            type="text"
            maxlength=${MAX_PATCH_NAME}
            aria-label=${TEXT.patchName}
            .value=${patch.name}
            @keydown=${(event: KeyboardEvent) => this.onRenameKey(event, patch.id)}
            @blur=${() => (this.renaming = null)}
          />`
        : html`<span class="nm">${patch.name}</span><span class="dt">${patchDateLabel(patch.date)}</span>`}
      <button class="pk" data-open=${patch.id} @click=${() => this.act({ type: 'open', id: patch.id })}>
        ${TEXT.open}
      </button>
      <button class="pk" data-rename=${patch.id} @click=${() => this.startRename(patch.id)}>${TEXT.rename}</button>
      <button
        class=${classMap({ pk: true, danger: confirming })}
        data-delete=${patch.id}
        @click=${() => this.onDelete(patch.id)}
        @blur=${() => (this.confirming = null)}
      >
        ${confirming ? TEXT.confirmDelete : TEXT.delete}
      </button>
    </div>`;
  }

  private startRename(id: string): void {
    this.confirming = null;
    this.renaming = id;
  }

  private onRenameKey(event: KeyboardEvent, id: string): void {
    if (event.key === 'Enter') {
      const name = this.input?.value.trim() ?? '';
      this.renaming = null;
      if (name) this.act({ type: 'rename', id, name });
    } else if (event.key === 'Escape') {
      this.renaming = null;
    }
  }

  /** BORRAR twice on the same row deletes it. */
  private onDelete(id: string): void {
    if (this.confirming === id) {
      this.confirming = null;
      this.act({ type: 'delete', id });
    } else {
      this.confirming = id;
    }
  }

  private act(action: PatchListAction): void {
    this.dispatchEvent(new CustomEvent('patch-action', { detail: action }) satisfies PatchListActionEvent);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mono-patch-list': MonoPatchList;
  }
}
