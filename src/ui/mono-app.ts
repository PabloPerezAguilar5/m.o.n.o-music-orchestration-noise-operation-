import { css, html, LitElement, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { clamp } from '../core/geometry';
import { store } from '../state';
import './panel/mono-panel';
import './stage/mono-stage';
import { Selector } from './store-controller';
import { reset, SHORT } from './styles/shared';

/** Where the divider sits on short screens: the canvas's share of the height. */
const DEFAULT_STAGE_SHARE = 0.27;
const MIN_STAGE_SHARE = 0.12;
const MAX_STAGE_SHARE = 0.6;
const KEY_STEP = 0.03;
const STORAGE_KEY = 'mono.stage-share';

/** The saved divider position, or the default. Storage may be blocked: never throws. */
function loadShare(): number {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(value) && value > 0) return clamp(value, MIN_STAGE_SHARE, MAX_STAGE_SHARE);
  } catch {
    // Private window or blocked site data: the default will do.
  }
  return DEFAULT_STAGE_SHARE;
}

function saveShare(share: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, share.toFixed(4));
  } catch {
    // Not saved; the divider still works for this visit.
  }
}

/**
 * App shell: the canvas on top, the selected node's hardware panel below. On short
 * screens a divider between them can be dragged to give either more room.
 */
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
      #split {
        display: none;
      }
      @media ${SHORT} {
        :host {
          gap: 0;
          padding: 4px 6px 6px;
        }
        mono-stage {
          flex: 0 0 calc(var(--share) * 100%);
          min-height: 88px;
        }
        mono-panel {
          min-height: 150px;
        }
        /* The line is thin; its hit area is 44 px tall (padding of the ::after). */
        #split {
          display: block;
          position: relative;
          flex: none;
          height: 12px;
          cursor: row-resize;
          touch-action: none;
        }
        #split::before {
          content: '';
          position: absolute;
          left: 50%;
          top: 4px;
          width: 56px;
          height: 4px;
          margin-left: -28px;
          border-radius: 2px;
          background: var(--dim);
        }
        #split::after {
          content: '';
          position: absolute;
          inset: -16px 0;
        }
        #split:hover::before,
        #split:focus-visible::before,
        #split.drag::before {
          background: var(--ink);
        }
        #split:focus-visible {
          outline: none;
        }
      }
    `,
  ];

  private readonly audioState = new Selector(this, store, (s) => s.audio.state);
  /** The canvas's share of the height, 0..1 (only used on short screens). */
  @state() private share = loadShare();
  private dragging = false;

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

  private setShare(share: number): void {
    this.share = clamp(share, MIN_STAGE_SHARE, MAX_STAGE_SHARE);
  }

  private readonly onSplitDown = (event: PointerEvent): void => {
    if (event.button > 0) return;
    this.dragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
    this.requestUpdate();
  };

  private readonly onSplitMove = (event: PointerEvent): void => {
    if (!this.dragging) return;
    const box = this.getBoundingClientRect();
    const style = getComputedStyle(this);
    const top = box.top + parseFloat(style.paddingTop);
    const inner = box.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    if (inner > 0) this.setShare((event.clientY - top) / inner);
  };

  private readonly onSplitUp = (): void => {
    if (!this.dragging) return;
    this.dragging = false;
    saveShare(this.share);
    this.requestUpdate();
  };

  private readonly onSplitKey = (event: KeyboardEvent): void => {
    const delta = event.key === 'ArrowUp' ? -KEY_STEP : event.key === 'ArrowDown' ? KEY_STEP : 0;
    if (delta === 0) return;
    event.preventDefault();
    this.setShare(this.share + delta);
    saveShare(this.share);
  };

  override render(): TemplateResult {
    // Exposed for styling and browser tests: idle, starting, running, blocked, unavailable.
    this.setAttribute('audio-state', this.audioState.value);
    this.style.setProperty('--share', this.share.toFixed(4));
    return html`<mono-stage></mono-stage>
      <div
        id="split"
        class=${this.dragging ? 'drag' : ''}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Divisor entre lienzo y panel"
        aria-valuemin=${Math.round(MIN_STAGE_SHARE * 100)}
        aria-valuemax=${Math.round(MAX_STAGE_SHARE * 100)}
        aria-valuenow=${Math.round(this.share * 100)}
        tabindex="0"
        @pointerdown=${this.onSplitDown}
        @pointermove=${this.onSplitMove}
        @pointerup=${this.onSplitUp}
        @pointercancel=${this.onSplitUp}
        @keydown=${this.onSplitKey}
      ></div>
      <mono-panel></mono-panel>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mono-app': MonoApp;
  }
}
