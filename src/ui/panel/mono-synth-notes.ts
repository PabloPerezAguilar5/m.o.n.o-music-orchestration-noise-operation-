import { css, html, LitElement, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { STEPS } from '../../core/patterns';
import { DEGREES } from '../../core/scales';
import { SYNTH_PANEL_LENGTHS, type SynthPattern } from '../../core/synth-patterns';
import { TEXT } from '../labels';
import { hardwareKey, reset, SHORT, stepKey } from '../styles/shared';

export type NoteTapEvent = CustomEvent<{ step: number; note: number }>;
export type LengthSetEvent = CustomEvent<{ step: number; length: number }>;

const COLUMNS = Array.from({ length: STEPS }, (_, index) => index);

/**
 * The SYNTH's performance zone: a keyboard with one key per note of the scale (two
 * octaves, lowest on the left), the 16 steps, and LARGO for the step being edited.
 *
 * Tapping a step picks it; the keys then show its notes lit, and tapping one adds that
 * note or takes it out. With no step picked, the first key tapped picks step 1. AUTO
 * moves to the next step after each key, to load a sequence quickly. The picked step
 * lives here (it is a hand on the panel, not part of the pattern); the pattern itself is
 * edited by whoever listens to `note-tap` and `length-set`.
 */
@customElement('mono-synth-notes')
export class MonoSynthNotes extends LitElement {
  static override styles = [
    reset,
    stepKey,
    css`
      :host {
        flex: 1;
        min-width: 0;
        display: flex;
      }
      .zone {
        flex: 1;
        min-width: 0;
        display: grid;
        grid-template-rows: minmax(52px, 1fr) auto auto;
        gap: 6px;
      }

      /* Keyboard: ten keys, and a narrow empty track between the octaves (the keys keep their width). */
      .keys {
        display: grid;
        grid-template-columns: repeat(5, 1fr) 0 repeat(5, 1fr);
        gap: 4px;
        min-height: 0;
      }
      .nk {
        position: relative;
        min-width: 0;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        padding: 0 0 6px;
        border: 1px solid #2a2a33;
        border-radius: 3px 3px 7px 7px;
        background: linear-gradient(#ebe7da, #cdc8b9);
        box-shadow: 0 3px 0 #0006;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        color: #1b1b22;
      }
      .nk.oct {
        grid-column: 7;
      }
      .nk:active {
        transform: translateY(1px);
        box-shadow: 0 2px 0 #0006;
      }
      /* A note of the step being edited: the key lights up with the node's colour. */
      .nk.on {
        background: linear-gradient(var(--c), var(--c));
        box-shadow:
          0 3px 0 #0006,
          0 0 10px var(--c);
      }
      .nk .led {
        position: absolute;
        left: 22%;
        right: 22%;
        top: 5px;
        height: 3px;
        border-radius: 1px;
        background: #3c2a2a;
      }
      .nk.on .led {
        background: #14141c;
      }

      /* The 16 steps: numbered keys with an LED, like DRUM's. */
      .steps {
        display: grid;
        grid-template-columns: repeat(16, 1fr);
        gap: 4px;
      }
      .st {
        min-width: 0;
        min-height: clamp(30px, 6vh, 38px);
        padding: 8px 0 0;
        font-size: 10px;
        font-weight: 700;
        color: #1b1b22;
      }
      .st::before {
        top: 3px;
      }
      /* The step being edited: a dark key with its number lit, apart from the playhead outline. */
      .st.sel {
        background: linear-gradient(#26262f, #14141c);
        color: var(--c);
        text-shadow: 0 0 6px var(--c);
      }

      /* LARGO, a readout and AUTO. */
      .opts {
        display: flex;
        align-items: stretch;
        gap: 6px;
      }
      .opts h6 {
        margin: 0;
        display: flex;
        align-items: center;
        padding: 0 8px;
        background: #14141c;
        color: var(--c);
        font-size: 9px;
        letter-spacing: 0.16em;
        font-weight: 700;
        border-radius: 2px;
      }
      .len {
        display: flex;
        gap: 4px;
      }
      .len.dim {
        opacity: 0.4;
      }
      .pk {
        position: relative;
        min-width: 44px;
        min-height: clamp(30px, 5.5vh, 38px);
        padding: 6px 8px 0;
        border-radius: 6px;
        font-size: 11px;
        letter-spacing: 0.08em;
        ${hardwareKey}
      }
      .pk::before {
        content: '';
        position: absolute;
        left: 30%;
        right: 30%;
        top: 4px;
        height: 2px;
        border-radius: 1px;
        background: #3c2a2a;
      }
      .pk.on::before {
        background: var(--c);
        box-shadow: 0 0 6px var(--c);
      }
      .pk:active {
        box-shadow: inset 0 3px 0 var(--c);
      }
      .lcd {
        display: flex;
        align-items: center;
        padding: 0 10px;
        background: #0d0508;
        border: 1px solid #000;
        border-radius: 3px;
        box-shadow: inset 0 0 6px #000;
        color: var(--c);
        text-shadow: 0 0 6px var(--c);
        font-size: 10px;
        letter-spacing: 0.08em;
        white-space: nowrap;
      }
      #auto {
        margin-left: auto;
      }

      /* Short screens: keys and buttons of 44 px; the sixteen steps keep the width they have. */
      @media ${SHORT} {
        .zone {
          grid-template-rows: minmax(64px, 1fr) auto auto;
          gap: 8px;
        }
        .keys {
          gap: 2px;
        }
        .nk {
          font-size: 10px;
        }
        .steps {
          gap: 3px;
        }
        .st {
          min-height: 34px;
          padding-top: 10px;
          font-size: 9px;
        }
        .pk {
          min-height: 44px;
          padding-top: 8px;
        }
        .opts {
          flex-wrap: wrap;
        }
        .lcd {
          min-height: 44px;
        }
      }
    `,
  ];

  @property({ attribute: false }) pattern: SynthPattern = [];
  /** Key captions, lowest note first (`Bb4`). */
  @property({ attribute: false }) names: readonly string[] = [];
  /** Step being played, or -1. */
  @property({ type: Number }) step = -1;

  /** The step being edited (0..15), or null. */
  @state() private selected: number | null = null;
  @state() private auto = false;

  override render(): TemplateResult {
    const selected = this.selected;
    const current = selected === null ? undefined : this.pattern[selected];
    const lit = new Set(current?.notes ?? []);
    const length = current?.length ?? 0;
    // LARGO does nothing on a step without notes (and on no step at all): dimmed, as DRUM's rows do.
    const dim = !current || current.notes.length === 0;
    return html`<div class="zone">
      <div class="keys" role="group" aria-label=${TEXT.keyboardSection}>
        ${this.names.map(
          (name, note) => html`<button
            class=${classMap({ nk: true, on: lit.has(note), oct: note === DEGREES })}
            data-note=${note}
            aria-label="${TEXT.synthKeyHint} ${name}"
            aria-pressed=${lit.has(note)}
            @click=${() => this.onKey(note)}
          >
            <i class="led"></i>${name}
          </button>`,
        )}
      </div>
      <div class="steps" role="group" aria-label=${TEXT.synthStepsSection}>
        ${COLUMNS.map((col) => {
          const notes = this.pattern[col]?.notes.length ?? 0;
          return html`<button
            class=${classMap({
              st: true,
              a: notes > 0,
              g: ((col >> 2) & 1) === 1,
              ph: col === this.step,
              sel: col === selected,
            })}
            data-c=${col}
            aria-label="${TEXT.stepHint} ${col + 1}"
            aria-pressed=${col === selected}
            @click=${() => (this.selected = col)}
          >
            ${col + 1}
          </button>`;
        })}
      </div>
      <div class="opts">
        <h6>${TEXT.lengthSection}</h6>
        <div class=${classMap({ len: true, dim })} id="length">
          ${SYNTH_PANEL_LENGTHS.map(
            (value) => html`<button
              class=${classMap({ pk: true, on: current !== undefined && length === value })}
              data-len=${value}
              aria-label="${TEXT.lengthHint}: ${value}"
              aria-pressed=${current !== undefined && length === value}
              aria-disabled=${selected === null}
              @click=${() => this.onLength(value)}
            >
              ${value}
            </button>`,
          )}
        </div>
        <span class="lcd" id="step-readout">${this.readout(selected, length)}</span>
        <button
          class=${classMap({ pk: true, on: this.auto })}
          id="auto"
          aria-label=${TEXT.autoHint}
          aria-pressed=${this.auto}
          @click=${() => (this.auto = !this.auto)}
        >
          ${TEXT.auto}
        </button>
      </div>
    </div>`;
  }

  /** The step being edited; a length LARGO has no key for (8 or 16, from AMBIENTE) is written out. */
  private readout(selected: number | null, length: number): string {
    if (selected === null) return TEXT.noStep;
    const base = `${TEXT.stepHint.toUpperCase()} ${selected + 1}`;
    return (SYNTH_PANEL_LENGTHS as readonly number[]).includes(length) ? base : `${base} · ${TEXT.lengthSection} ${length}`;
  }

  /** A key: it edits the step being edited (step 1 when none is), then AUTO moves on. */
  private onKey(note: number): void {
    const step = this.selected ?? 0;
    this.selected = this.auto ? (step + 1) % STEPS : step;
    this.dispatchEvent(new CustomEvent('note-tap', { detail: { step, note } }) satisfies NoteTapEvent);
  }

  private onLength(length: number): void {
    if (this.selected === null) return;
    this.dispatchEvent(new CustomEvent('length-set', { detail: { step: this.selected, length } }) satisfies LengthSetEvent);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mono-synth-notes': MonoSynthNotes;
  }
}
