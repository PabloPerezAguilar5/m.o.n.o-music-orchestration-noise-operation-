import { css, html, LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import {
  BASS_MODES,
  BASS_SLIDE_ROW,
  bassDimmedCells,
  gridFromBassPattern,
  type BassMode,
  type BassPattern,
} from '../../core/bass-patterns';
import {
  DRONE_MAX_LAYERS,
  DRONE_MODES,
  DRONE_PRESETS,
  droneNoteName,
  type DroneMode,
  type DronePreset,
} from '../../core/drone';
import { kitLabel } from '../../core/drum-kits';
import {
  inScale,
  LEAD_BASE_MIDI,
  LEAD_KEY_COUNT,
  LEAD_OCTAVE_MAX,
  LEAD_OCTAVE_MIN,
  leadOctaveName,
  leadRangeName,
} from '../../core/lead';
import { gridFromPattern, type DrumPattern } from '../../core/drum-patterns';
import { clickAt } from '../../core/metronome';
import { isSequenced, MACRO_PARAM, NODE_SPECS, type NodeId, type ParamSection } from '../../core/nodes';
import type { Pattern } from '../../core/patterns';
import { randomSeed } from '../../core/random';
import { ROOTS } from '../../core/scales';
import {
  gridFromSynthPattern,
  synthDimmedCells,
  SYNTH_DUR_ROW,
  SYNTH_MODES,
  synthDurLabels,
  type SynthMode,
  type SynthPattern,
} from '../../core/synth-patterns';
import { SYNTH_PRESETS, type SynthPreset } from '../../core/synth-voices';
import { cues, live, pulse, store } from '../../state';
import {
  BASS_MODE_LABELS,
  bassRowLabels,
  DRONE_MODE_LABELS,
  DRONE_PRESET_LABELS,
  KIT_ORDER,
  KNOB_LABELS,
  NODE_CODES,
  NODE_NAMES,
  ROW_LABELS,
  SCALE_LABELS,
  SECTION_LABELS,
  SYNTH_MODE_LABELS,
  SYNTH_PRESET_LABELS,
  synthRowLabels,
  TEXT,
} from '../labels';
import { Selector } from '../store-controller';
import { hardwareKey, reset } from '../styles/shared';
import { NODE_COLORS } from '../theme';
import './mono-keys';
import type { KeyDownEvent, KeyUpEvent } from './mono-keys';
import './mono-knob';
import type { KnobInputEvent } from './mono-knob';
import './mono-step-grid';
import type { StepToggleEvent } from './mono-step-grid';
import './mono-tempo';
import type { TempoNudgeEvent, TempoSetEvent } from './mono-tempo';
import './mono-type-switch';
import type { TypeChangeEvent } from './mono-type-switch';
import './mono-wave';
import './mono-xy-pad';
import type { PadDot, PadDownEvent, PadUpEvent } from './mono-xy-pad';

/** How long the node lights up after each kind of gesture. */
const PULSE_MS = { knob: 200, step: 200, type: 300 } as const;

/**
 * Hardware panel of the selected node: neon frame in the node's colour, a
 * header with the display, and a cream chassis with knobs plus the node's
 * own performance zone.
 */
@customElement('mono-panel')
export class MonoPanel extends LitElement {
  static override styles = [
    reset,
    css`
      /* The host is the neon frame; #panel sits 1.5px inside it. */
      :host {
        display: block;
        flex: 1;
        min-height: 0;
        padding: 1.5px;
        background: var(--c);
        clip-path: polygon(
          16px 0,
          calc(100% - 16px) 0,
          100% 16px,
          100% 100%,
          0 100%,
          0 16px
        );
        filter: drop-shadow(0 0 8px var(--c));
      }
      #panel {
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 7px 14px 10px;
        clip-path: polygon(
          15px 0,
          calc(100% - 15px) 0,
          100% 15px,
          100% 100%,
          0 100%,
          0 15px
        );
        background:
          radial-gradient(circle at 12px 11px, #777 0 2.5px, transparent 3.5px),
          radial-gradient(circle at calc(100% - 12px) 11px, #777 0 2.5px, transparent 3.5px),
          #15151f;
      }

      /* Header */
      .hd {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 12px;
        letter-spacing: 0.14em;
        color: var(--c);
      }
      .plq {
        background: #0b0b12;
        border: 1px solid #3a3a50;
        border-radius: 3px;
        padding: 3px 8px;
        font-weight: 700;
        letter-spacing: 0.18em;
        font-size: 11px;
        color: #c9c9dc;
      }
      .lcd {
        flex: 1;
        max-width: 340px;
        background: #0d0508;
        border: 1px solid #000;
        box-shadow: inset 0 0 8px #000;
        border-radius: 3px;
        padding: 3px 10px;
        font-size: 13px;
        letter-spacing: 0.14em;
        color: var(--c);
        text-shadow: 0 0 8px var(--c);
        white-space: nowrap;
        overflow: hidden;
      }
      .hz {
        margin-left: auto;
        width: 70px;
        height: 6px;
        background: repeating-linear-gradient(135deg, #ffea00 0 6px, #14141f 6px 12px);
        opacity: 0.55;
      }
      #rm {
        border: 1px solid var(--dim);
        border-radius: 6px;
        width: 26px;
        height: 22px;
        font-size: 11px;
        color: #c9c9dc;
        background: #0b0b12;
      }

      /* Cream chassis */
      .plate {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 7px 10px 8px;
        border-radius: 4px;
        background: linear-gradient(180deg, #d6d2c6, #b9b5a8);
        color: #1b1b22;
        box-shadow:
          inset 0 1px 0 #fff8,
          inset 0 -2px 6px #0004;
      }
      .kr {
        display: flex;
        align-items: stretch;
        gap: 10px;
      }
      .kr section {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .kr section:last-child {
        margin-left: auto;
      }
      .kr h6 {
        margin: 0;
        padding: 2px 8px;
        background: #14141c;
        color: var(--c);
        font-size: 9px;
        letter-spacing: 0.16em;
        font-weight: 700;
        border-radius: 2px;
        text-align: center;
      }
      .kk {
        display: flex;
        gap: clamp(8px, 1.6vw, 16px);
        justify-content: center;
        align-items: flex-end;
        border-bottom: 1.5px solid #1b1b2244;
        padding-bottom: 4px;
      }
      .zn {
        flex: 1;
        min-height: 0;
        display: flex;
      }
      /* Hardware keys of the PATRÓN section (DRUM), as tall as a knob. */
      .pk {
        height: var(--ks);
        min-width: calc(var(--ks) * 1.2);
        padding: 0 8px;
        border-radius: 6px;
        font-size: 9px;
        letter-spacing: 0.12em;
        ${hardwareKey}
      }
      .pk:disabled {
        opacity: 0.45;
        cursor: default;
      }
      .pk:active:not(:disabled) {
        box-shadow: inset 0 3px 0 var(--c);
      }
      /* Keys with an LED on top (KIT, CLICK), like the sequencer steps. */
      .pk.led {
        position: relative;
        padding-top: 6px;
      }
      .pk.led::before {
        content: '';
        position: absolute;
        left: 30%;
        right: 30%;
        top: 4px;
        height: 3px;
        border-radius: 1px;
        background: #3c2a2a;
      }
      .pk.led.on::before {
        background: var(--c);
        box-shadow: 0 0 6px var(--c);
      }
      /* Beat 1 of the bar: a stronger flash. */
      .pk.led.on.acc::before {
        left: 22%;
        right: 22%;
        box-shadow:
          0 0 4px var(--c),
          0 0 12px var(--c);
      }
      .kits,
      .modes {
        gap: clamp(4px, 0.8vw, 8px);
      }
      /* Five keys in rows of three (DRONE: SONIDO). */
      .trio {
        display: grid;
        grid-template-columns: repeat(3, auto);
        grid-auto-rows: minmax(22px, 1fr);
        align-items: stretch;
        gap: 4px;
        height: calc(var(--ks) + 14px);
        box-sizing: content-box;
      }
      .trio .pk {
        height: auto;
        min-width: 0;
        padding: 4px 6px 0;
        font-size: 8px;
      }
      .trio .pk.led::before {
        top: 3px;
        height: 2px;
      }
      /* Four keys in two rows of two, at every width (SYNTH: SONIDO, MODO). */
      .quad {
        display: grid;
        grid-template-columns: repeat(2, auto);
        grid-auto-rows: minmax(22px, 1fr);
        align-items: stretch;
        gap: 4px;
        height: calc(var(--ks) + 14px);
        box-sizing: content-box;
      }
      .quad .pk {
        height: auto;
        min-width: 0;
        padding: 4px 8px 0;
        font-size: 8px;
      }
      .quad .pk.led::before {
        top: 3px;
        height: 2px;
      }
      /* Two controls stacked in the height of a knob and its caption (BASS: OSC, ESCALA). */
      .stack {
        flex-direction: column;
        align-items: stretch;
        justify-content: stretch;
        gap: 4px;
        height: calc(var(--ks) + 14px);
        box-sizing: content-box;
      }
      .stack > * {
        flex: 1;
        min-height: 0;
      }
      .stack .pk {
        height: auto;
        min-width: 0;
        font-size: 8px;
      }
      .stack .pk.led {
        padding-top: 5px;
      }
      .stack .pk.led::before {
        top: 3px;
        height: 2px;
      }
      /* − value + : a small display between two keys. */
      .stp {
        display: flex;
        gap: 3px;
      }
      .stp .pk {
        padding: 0;
        width: 26px;
        font-size: 12px;
      }
      .mini {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 7ch;
        padding: 0 6px;
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
      .stp.wide .mini {
        min-width: 12ch;
      }
      /* Narrow screens: eight kits do not fit in one row, so they go in two rows of
         four, each at least 26px tall for a finger (the knob row grows a little). */
      @media (max-width: 1100px) {
        .kits,
        .modes {
          display: grid;
          grid-template-columns: repeat(4, auto);
          grid-auto-rows: minmax(26px, 1fr);
          align-items: stretch;
          gap: 4px;
          min-height: calc(var(--ks) + 14px);
        }
        .modes {
          grid-template-columns: repeat(3, auto);
        }
        .stack {
          height: auto;
          min-height: calc(var(--ks) + 14px);
        }
        .stack > * {
          min-height: 26px;
        }
        .kits .pk,
        .modes .pk {
          height: auto;
          min-width: 0;
          padding: 4px 6px 0;
          font-size: 8px;
        }
        .kits .pk.led::before,
        .modes .pk.led::before {
          top: 3px;
          height: 2px;
        }
      }
    `,
  ];

  private readonly selected = new Selector(this, store, (s) => s.selected);
  private readonly params = new Selector(this, store, (s) => s.params);
  private readonly key = new Selector(this, store, (s) => s.key);
  private readonly synth = new Selector(this, store, (s) => s.synth);
  /** On/off view of the SYNTH pattern, recomputed only when the pattern changes. */
  private synthGrid: { pattern: SynthPattern; grid: Pattern; dimmed: Pattern } | null = null;
  private readonly lead = new Selector(this, store, (s) => s.lead);
  private readonly drone = new Selector(this, store, (s) => s.drone);
  /** What is being played by hand: LEAD keys down, DRONE layers. */
  private readonly live = new Selector(this, live, (s) => s);
  private readonly distType = new Selector(this, store, (s) => s.distType);
  private readonly bpm = new Selector(this, store, (s) => s.transport.bpm);
  private readonly step = new Selector(this, store, (s) => s.transport.step);
  private readonly drum = new Selector(this, store, (s) => s.drum);
  private readonly audio = new Selector(this, store, (s) => s.audio);
  private readonly metronome = new Selector(this, store, (s) => s.metronome);
  private readonly bass = new Selector(this, store, (s) => s.bass);
  /** On/off view of the BASS pattern, recomputed only when the pattern changes. */
  private bassGrid: { pattern: BassPattern; slides: boolean; grid: Pattern; dimmed: Pattern } | null = null;
  /** On/off view of the DRUM pattern, recomputed only when the pattern changes. */
  private drumGrid: { pattern: DrumPattern; grid: Pattern } | null = null;

  /** Last knob reading, shown on the display until another node is selected. */
  @state() private reading: string | null = null;
  private shownNode: NodeId | null = null;

  protected override willUpdate(_changed: PropertyValues): void {
    const id = this.selected.value;
    if (id === this.shownNode) return;
    this.shownNode = id;
    this.reading = null;
    this.style.setProperty('--c', NODE_COLORS[id]);
  }

  override render(): TemplateResult {
    const id = this.selected.value;
    const spec = NODE_SPECS[id];
    const values = this.params.value[id];
    const sections: readonly ParamSection[] = spec.sections ?? [{ id, params: spec.params }];

    return html`<div id="panel">
      <div class="hd">
        <span class="plq">${TEXT.plaque}</span>
        <div class="lcd" id="lcd">${this.displayText(id)}</div>
        <i class="hz"></i>
        ${id !== 'master'
          ? html`<button id="rm" aria-label=${TEXT.removeNode} @click=${this.onRemove}>✕</button>`
          : nothing}
      </div>
      <div class="plate">
        <div class="kr">
          ${sections.map(
            (section) => html`<section data-section=${section.id}>
              <h6>${SECTION_LABELS[section.id] ?? NODE_NAMES[id]}</h6>
              <div class="kk">
                ${section.params.map((param) =>
                  this.knob(param, this.knobLabel(id, param), values[param] ?? 0, false),
                )}
              </div>
            </section>`,
          )}
          ${id === 'drum' ? [this.patternKeys(), this.kitKeys()] : nothing}
          ${id === 'bass' ? this.bassKeys() : nothing}
          ${id === 'synth' ? this.synthKeys() : nothing}
          ${id === 'lead' ? this.leadKeys() : nothing}
          ${id === 'drone' ? this.droneKeys() : nothing}
          ${id === 'master' ? this.metronomeKeys() : nothing}
          <section>
            <h6>${TEXT.macroSection}</h6>
            <div class="kk">
              ${this.knob(MACRO_PARAM, TEXT.macroKnob, values[MACRO_PARAM] ?? 0, true)}
            </div>
          </section>
        </div>
        <div class="zn">${this.zone(id)}</div>
      </div>
    </div>`;
  }

  /**
   * The display: a knob reading while turning, else an audio problem worth knowing
   * about, else the node's name and code (DRUM: its kit; BASS: its key).
   */
  private displayText(id: NodeId): string {
    if (this.reading) return this.reading;
    const audio = this.audio.value;
    if (audio.state === 'blocked') return TEXT.audioBlocked;
    if (audio.state === 'unavailable') return TEXT.audioUnavailable;
    const name = NODE_NAMES[id];
    const { root, scale } = this.key.value;
    if (id === 'bass') return `${name} · ${ROOTS[root]} ${SCALE_LABELS[scale]}`;
    if (id === 'synth') {
      return `${name} · ${SYNTH_PRESET_LABELS[this.synth.value.preset]} · ${ROOTS[root]} ${SCALE_LABELS[scale]}`;
    }
    if (id === 'drone') {
      return `${name} · ${DRONE_PRESET_LABELS[this.drone.value.preset]} · ${ROOTS[root]} ${SCALE_LABELS[scale]}`;
    }
    if (id === 'lead') {
      const { octave, scaleLock } = this.lead.value;
      const range = leadRangeName(octave);
      return scaleLock ? `${name} · ${range} · ${ROOTS[root]} ${SCALE_LABELS[scale]}` : `${name} · ${range}`;
    }
    if (id !== 'drum') return `${name} · ${NODE_CODES[id]}`;

    const { kit } = this.drum.value;
    const missing = audio.missing[kit] ?? audio.missing['*'] ?? [];
    if (missing.length > 0) {
      const more = missing.length > 1 ? ` +${missing.length - 1}` : '';
      return `${name} · ${TEXT.missing} ${missing[0]}${more}`;
    }
    return `${name} · ${kitLabel(kit)}`;
  }

  private knobLabel(id: NodeId, param: string): string {
    return KNOB_LABELS[id][NODE_SPECS[id].params.indexOf(param)] ?? param;
  }

  /** Knob name for the display; prefixed with its group when the node has several (DRUM: "SNR VOL"). */
  private readingLabel(id: NodeId, param: string, label: string): string {
    const section = NODE_SPECS[id].sections?.find((s) => s.params.includes(param));
    const group = section ? SECTION_LABELS[section.id] : undefined;
    return group ? `${group} ${label}` : label;
  }

  /** DRUM: RNDM makes a new pattern. */
  private patternKeys(): TemplateResult {
    // Stacked: with eight kit keys in one row, two keys side by side would not fit at 1280 px.
    return html`<section data-section="pattern">
      <h6>${TEXT.patternSection}</h6>
      <div class="kk stack">
        <button class="pk" id="rndm" aria-label=${TEXT.rndmHint} @click=${this.onRandomize}>
          ${TEXT.rndm}
        </button>
        ${this.clearKey()}
      </div>
    </section>`;
  }

  /** BORRAR: every step of the selected node's pattern goes blank. */
  private clearKey(): TemplateResult {
    return html`<button class="pk" id="clear" aria-label=${TEXT.clearHint} @click=${this.onClear}>
      ${TEXT.clear}
    </button>`;
  }

  /** DRUM: one key per kit, the active one with its LED on. Off until the manifest is in. */
  private kitKeys(): TemplateResult {
    const available = this.audio.value.kits;
    const active = this.drum.value.kit;
    const kits = [...KIT_ORDER, ...available.filter((kit) => !KIT_ORDER.includes(kit))];
    return html`<section data-section="kit">
      <h6>${TEXT.kitSection}</h6>
      <div class="kk kits">
        ${kits.map(
          (kit) => html`<button
            class=${classMap({ pk: true, led: true, on: kit === active })}
            data-kit=${kit}
            aria-label="${TEXT.kitHint} ${kitLabel(kit)}"
            aria-pressed=${kit === active}
            ?disabled=${!available.includes(kit)}
            @click=${() => this.onKit(kit)}
          >
            ${kitLabel(kit)}
          </button>`,
        )}
      </div>
    </section>`;
  }

  /** MASTER: metronome on/off with an LED that flashes on each beat, and its volume. */
  private metronomeKeys(): TemplateResult {
    const { on, volume } = this.metronome.value;
    const click = on ? clickAt(this.step.value) : null;
    return html`<section data-section="metronome">
      <h6>${TEXT.clickSection}</h6>
      <div class="kk">
        <button
          class=${classMap({ pk: true, led: true, on: click !== null, acc: click === 'accent' })}
          id="click"
          data-on=${on}
          aria-label=${TEXT.clickHint}
          aria-pressed=${on}
          @click=${this.onClickToggle}
        >
          ${TEXT.click}
        </button>
        <mono-knob
          data-param="clickVolume"
          .label=${TEXT.clickVolume}
          .value=${volume}
          @knob-input=${this.onClickVolume}
        ></mono-knob>
      </div>
    </section>`;
  }

  private drumGridFor(pattern: DrumPattern): Pattern {
    if (this.drumGrid?.pattern !== pattern) this.drumGrid = { pattern, grid: gridFromPattern(pattern) };
    return this.drumGrid.grid;
  }

  private bassGridFor(pattern: BassPattern, slides: boolean): { grid: Pattern; dimmed: Pattern } {
    const cached = this.bassGrid;
    if (cached?.pattern !== pattern || cached.slides !== slides) {
      this.bassGrid = {
        pattern,
        slides,
        grid: gridFromBassPattern(pattern),
        dimmed: bassDimmedCells(pattern, slides),
      };
    }
    return this.bassGrid!;
  }

  private synthGridFor(pattern: SynthPattern): { grid: Pattern; dimmed: Pattern } {
    if (this.synthGrid?.pattern !== pattern) {
      this.synthGrid = { pattern, grid: gridFromSynthPattern(pattern), dimmed: synthDimmedCells(pattern) };
    }
    return this.synthGrid;
  }

  /** The step grid of a sequenced node: on/off cells, dimmed cells, where the gap goes. */
  private gridOf(id: NodeId): { grid: Pattern; dimmed: Pattern | null; split: number | null } {
    if (id === 'drum') return { grid: this.drumGridFor(this.drum.value.pattern), dimmed: null, split: null };
    if (id === 'bass') {
      const { pattern, slides } = this.bass.value;
      return { ...this.bassGridFor(pattern, slides), split: BASS_SLIDE_ROW };
    }
    if (id === 'synth') return { ...this.synthGridFor(this.synth.value.pattern), split: SYNTH_DUR_ROW };
    return { grid: [], dimmed: null, split: null };
  }

  /**
   * BASS: OSC (wave and sub), ESCALA (the shared key), MODO (fck-synth's five modes)
   * and DICE, which makes a new pattern in the current mode.
   */
  private bassKeys(): TemplateResult[] {
    const { wave, sub, mode } = this.bass.value;
    return [
      html`<section data-section="osc">
        <h6>${TEXT.oscSection}</h6>
        <div class="kk stack">
          <button class="pk" id="wave" data-wave=${wave} aria-label=${TEXT.waveHint} @click=${this.onWave}>
            ${TEXT.waves[wave]}
          </button>
          <button
            class=${classMap({ pk: true, led: true, on: sub })}
            id="sub"
            aria-label=${TEXT.subHint}
            aria-pressed=${sub}
            @click=${this.onSub}
          >
            ${TEXT.sub}
          </button>
        </div>
      </section>`,
      this.keySection(),
      this.ledKeys('mode', TEXT.modeSection, 'modes', BASS_MODES, BASS_MODE_LABELS, mode, (m) => this.onBassMode(m)),
      this.diceSection(this.onBassDice, html`${this.slidesKey()}${this.clearKey()}`),
    ];
  }

  /** SYNTH: SONIDO (presets), ESCALA (the shared key), MODO (DICE styles) and DICE. */
  private synthKeys(): TemplateResult[] {
    const { preset, mode } = this.synth.value;
    return [
      this.ledKeys('sound', TEXT.soundSection, 'quad', SYNTH_PRESETS, SYNTH_PRESET_LABELS, preset, (p) =>
        this.onPreset(p),
      ),
      this.keySection(),
      this.ledKeys('mode', TEXT.modeSection, 'quad', SYNTH_MODES, SYNTH_MODE_LABELS, mode, (m) => this.onSynthMode(m)),
      this.diceSection(this.onSynthDice, this.clearKey()),
    ];
  }

  /** ESCALA: tonic and scale, shared by BASS, SYNTH, LEAD and DRONE. */
  private keySection(): TemplateResult {
    const { root, scale } = this.key.value;
    return html`<section data-section="key">
      <h6>${TEXT.keySection}</h6>
      <div class="kk stack">
        <div class="stp">
          <button class="pk" data-root="-1" aria-label=${TEXT.rootDown} @click=${() => this.onRoot(-1)}>−</button>
          <span class="mini" id="root">${ROOTS[root]}</span>
          <button class="pk" data-root="1" aria-label=${TEXT.rootUp} @click=${() => this.onRoot(1)}>+</button>
        </div>
        <div class="stp wide">
          <button class="pk" data-scale="-1" aria-label=${TEXT.scaleDown} @click=${() => this.onScale(-1)}>−</button>
          <span class="mini" id="scale">${SCALE_LABELS[scale]}</span>
          <button class="pk" data-scale="1" aria-label=${TEXT.scaleUp} @click=${() => this.onScale(1)}>+</button>
        </div>
      </div>
    </section>`;
  }

  /**
   * LEAD: TECLADO (OCT − and +, SCALE LOCK) and ESCALA (the key SCALE LOCK follows,
   * shared with BASS and SYNTH).
   */
  private leadKeys(): TemplateResult[] {
    const { octave, scaleLock } = this.lead.value;
    return [
      html`<section data-section="keyboard">
        <h6>${TEXT.keyboardSection}</h6>
        <div class="kk stack">
          <div class="stp">
            <button
              class="pk"
              id="oct-down"
              aria-label=${TEXT.octaveDown}
              ?disabled=${octave <= LEAD_OCTAVE_MIN}
              @click=${() => this.onOctave(-1)}
            >
              −
            </button>
            <span class="mini" id="octave">${TEXT.octave} ${leadOctaveName(octave)}</span>
            <button
              class="pk"
              id="oct-up"
              aria-label=${TEXT.octaveUp}
              ?disabled=${octave >= LEAD_OCTAVE_MAX}
              @click=${() => this.onOctave(1)}
            >
              +
            </button>
          </div>
          <button
            class=${classMap({ pk: true, led: true, on: scaleLock })}
            id="lock"
            aria-label=${TEXT.scaleLockHint}
            aria-pressed=${scaleLock}
            @click=${this.onScaleLock}
          >
            ${TEXT.scaleLock}
          </button>
        </div>
      </section>`,
      this.keySection(),
    ];
  }

  /** DRONE: SONIDO (presets), MODO (TOUCH or HOLD), CAPAS (STOP, CLEAR) and ESCALA. */
  private droneKeys(): TemplateResult[] {
    const { preset, mode } = this.drone.value;
    const layers = this.live.value.layers.length;
    return [
      this.ledKeys('sound', TEXT.soundSection, 'trio', DRONE_PRESETS, DRONE_PRESET_LABELS, preset, (p) =>
        this.onDronePreset(p),
      ),
      this.ledKeys('mode', TEXT.modeSection, 'stack', DRONE_MODES, DRONE_MODE_LABELS, mode, (m) => this.onDroneMode(m)),
      html`<section data-section="layers">
        <h6 id="layers">${TEXT.layersSection} ${layers}/${DRONE_MAX_LAYERS}</h6>
        <div class="kk stack">
          <button class="pk" id="stop" aria-label=${TEXT.layersStopHint} @click=${this.onDroneStop}>
            ${TEXT.layersStop}
          </button>
          <button class="pk" id="clear-layers" aria-label=${TEXT.clearLayersHint} @click=${this.onDroneClear}>
            ${TEXT.clearLayers}
          </button>
        </div>
      </section>`,
      this.keySection(),
    ];
  }

  /** A row of keys with LEDs, one lit: modes, presets. `layout` picks how they wrap. */
  private ledKeys<T extends string>(
    name: 'mode' | 'sound',
    title: string,
    layout: 'modes' | 'quad' | 'trio' | 'stack',
    ids: readonly T[],
    labels: Readonly<Record<T, string>>,
    current: T,
    pick: (id: T) => void,
  ): TemplateResult {
    return html`<section data-section=${name}>
      <h6>${title}</h6>
      <div class="kk ${layout}">
        ${ids.map(
          (id) => html`<button
            class=${classMap({ pk: true, led: true, on: id === current })}
            data-mode=${name === 'mode' ? id : nothing}
            data-preset=${name === 'sound' ? id : nothing}
            aria-label="${title} ${labels[id]}"
            aria-pressed=${id === current}
            @click=${() => pick(id)}
          >
            ${labels[id]}
          </button>`,
        )}
      </div>
    </section>`;
  }

  /** PATRÓN: DICE, plus any extra keys (BASS: SLIDE ON/OFF). */
  private diceSection(onDice: () => void, extra: TemplateResult | typeof nothing = nothing): TemplateResult {
    return html`<section data-section="pattern">
      <h6>${TEXT.patternSection}</h6>
      <div class="kk">
        <button class="pk" id="dice" aria-label=${TEXT.diceHint} @click=${onDice}>${TEXT.dice}</button>
        ${extra}
      </div>
    </section>`;
  }

  /** SLIDE ON/OFF: LED on while slides play; off keeps the marks but ignores them. */
  private slidesKey(): TemplateResult {
    const on = this.bass.value.slides;
    return html`<button
      class=${classMap({ pk: true, led: true, on })}
      id="slides"
      aria-label=${TEXT.slidesHint}
      aria-pressed=${on}
      @click=${this.onSlides}
    >
      ${TEXT.slides}
    </button>`;
  }

  private knob(param: string, label: string, value: number, big: boolean): TemplateResult {
    return html`<mono-knob
      data-param=${param}
      .label=${label}
      .value=${value}
      ?big=${big}
      @knob-input=${(event: KnobInputEvent) => this.onKnob(param, label, event.detail.value)}
    ></mono-knob>`;
  }

  /** The performance surface under the knobs. */
  private zone(id: NodeId): TemplateResult {
    switch (NODE_SPECS[id].zone) {
      case 'sequencer': {
        const { grid, dimmed, split } = this.gridOf(id);
        return html`<mono-step-grid
          .rows=${this.rowLabels(id)}
          .pattern=${grid}
          .dimmed=${dimmed}
          .split=${split}
          .texts=${id === 'synth' ? { row: SYNTH_DUR_ROW, values: synthDurLabels(this.synth.value.pattern) } : null}
          .step=${this.step.value}
          @step-toggle=${this.onStepToggle}
        ></mono-step-grid>`;
      }
      case 'xy':
        return html`<mono-xy-pad
          .dots=${this.padDots()}
          .noteCaption=${TEXT.padNote}
          .motionCaption=${TEXT.padMotion}
          @pad-down=${this.onPadDown}
          @pad-move=${this.onPadMove}
          @pad-up=${this.onPadUp}
        ></mono-xy-pad>`;
      case 'type':
        return html`<mono-type-switch
          .value=${this.distType.value}
          @type-change=${this.onType}
        ></mono-type-switch>`;
      case 'wave':
        return html`<mono-wave></mono-wave>`;
      case 'keys':
        return html`<mono-keys
          .held=${this.live.value.keys}
          .dimmed=${this.outOfScale()}
          .octave=${4 + this.lead.value.octave}
          @key-down=${this.onKeyDown}
          @key-move=${this.onKeyMove}
          @key-up=${this.onKeyUp}
        ></mono-keys>`;
      case 'tempo':
        return html`<mono-tempo
          .bpm=${this.bpm.value}
          @tempo-nudge=${this.onTempo}
          @tempo-set=${this.onTempoSet}
          @transport-toggle=${this.onTransport}
        ></mono-tempo>`;
    }
  }

  /** DRONE layers as the pad draws them, each with its note. */
  private padDots(): PadDot[] {
    const { root, scale } = this.key.value;
    return this.live.value.layers.map((layer) => ({
      id: layer.id,
      x: layer.x,
      y: layer.y,
      touched: layer.touch !== null,
      label: droneNoteName(layer.x, root, scale),
    }));
  }

  /** LEAD keys outside the scale, dimmed while SCALE LOCK is on (they play its nearest note). */
  private outOfScale(): ReadonlySet<number> {
    const { octave, scaleLock } = this.lead.value;
    const { root, scale } = this.key.value;
    const out = new Set<number>();
    if (!scaleLock) return out;
    for (let semitone = 0; semitone < LEAD_KEY_COUNT; semitone++) {
      if (!inScale(LEAD_BASE_MIDI + octave * 12 + semitone, root, scale)) out.add(semitone);
    }
    return out;
  }

  /** Step grid captions; BASS and SYNTH name their note rows after the key. */
  private rowLabels(id: NodeId): readonly string[] {
    const { root, scale } = this.key.value;
    if (id === 'bass') return bassRowLabels(root, scale);
    if (id === 'synth') return synthRowLabels(root, scale);
    return ROW_LABELS[id];
  }

  private onKnob(param: string, label: string, value: number): void {
    const id = this.selected.value;
    store.setParam(id, param, value);
    pulse(id, PULSE_MS.knob);
    this.reading = `${NODE_NAMES[id]} ${this.readingLabel(id, param, label)} ${Math.round(value * 127)}`;
  }

  private readonly onRemove = (): void => {
    store.removeNode(this.selected.value);
  };

  private readonly onStepToggle = (event: StepToggleEvent): void => {
    const id = this.selected.value;
    if (!isSequenced(id)) return;
    const { row, col } = event.detail;
    if (id === 'drum') store.toggleDrumStep(row, col);
    else if (id === 'bass') store.toggleBassStep(row, col);
    else store.toggleSynthStep(row, col);
    pulse(id, PULSE_MS.step);
  };

  private readonly onWave = (): void => {
    store.toggleBassWave();
    pulse('bass', PULSE_MS.type);
  };

  private readonly onClear = (): void => {
    const id = this.selected.value;
    store.clearPattern(id);
    pulse(id, PULSE_MS.type);
    this.reading = null;
  };

  private readonly onSlides = (): void => {
    store.toggleBassSlides();
    pulse('bass', PULSE_MS.type);
  };

  private readonly onSub = (): void => {
    store.toggleBassSub();
    pulse('bass', PULSE_MS.type);
  };

  /** Tonic and scale are shared: the reading names the node being looked at. */
  private onRoot(direction: 1 | -1): void {
    store.nudgeRoot(direction);
    this.reading = `${NODE_NAMES[this.selected.value]} ${TEXT.root} ${ROOTS[store.getState().key.root]}`;
  }

  private onScale(direction: 1 | -1): void {
    store.nudgeScale(direction);
    this.reading = `${NODE_NAMES[this.selected.value]} ${TEXT.scale} ${SCALE_LABELS[store.getState().key.scale]}`;
  }

  private onBassMode(mode: BassMode): void {
    store.setBassMode(mode);
    this.reading = `${NODE_NAMES.bass} ${TEXT.modeSection} ${BASS_MODE_LABELS[mode]}`;
  }

  private readonly onBassDice = (): void => {
    store.randomizeBass(randomSeed);
    this.reading = null;
  };

  private onSynthMode(mode: SynthMode): void {
    store.setSynthMode(mode);
    this.reading = `${NODE_NAMES.synth} ${TEXT.modeSection} ${SYNTH_MODE_LABELS[mode]}`;
  }

  private onPreset(preset: SynthPreset): void {
    store.setSynthPreset(preset);
    pulse('synth', PULSE_MS.type);
    this.reading = `${NODE_NAMES.synth} ${TEXT.soundSection} ${SYNTH_PRESET_LABELS[preset]}`;
  }

  private readonly onSynthDice = (): void => {
    store.randomizeSynth(randomSeed);
    this.reading = null;
  };

  /** Picks the kit (it switches in at the next bar) and plays its kick right away. */
  private onKit(kit: string): void {
    store.selectKit(kit);
    cues.send({ type: 'audition', kit });
    this.reading = null;
  }

  private readonly onRandomize = (): void => {
    store.randomize(randomSeed);
    this.reading = null;
  };

  private readonly onClickToggle = (): void => {
    store.toggleMetronome();
  };

  private readonly onClickVolume = (event: KnobInputEvent): void => {
    store.setMetronomeVolume(event.detail.value);
    this.reading = `${NODE_NAMES.master} ${TEXT.clickSection} ${TEXT.clickVolume} ${Math.round(event.detail.value * 127)}`;
  };

  private onOctave(direction: 1 | -1): void {
    store.nudgeLeadOctave(direction);
    this.reading = null;
  }

  private readonly onScaleLock = (): void => {
    store.toggleScaleLock();
    this.reading = null;
  };

  private readonly onKeyDown = (event: KeyDownEvent): void => {
    live.keyDown(event.detail.touch, event.detail.semitone);
  };

  private readonly onKeyMove = (event: KeyDownEvent): void => {
    live.keyMove(event.detail.touch, event.detail.semitone);
  };

  private readonly onKeyUp = (event: KeyUpEvent): void => {
    live.keyUp(event.detail.touch);
  };

  private onDronePreset(preset: DronePreset): void {
    store.setDronePreset(preset);
    this.reading = null;
  }

  private onDroneMode(mode: DroneMode): void {
    store.setDroneMode(mode);
    this.reading = `${NODE_NAMES.drone} ${TEXT.modeSection} ${DRONE_MODE_LABELS[mode]}`;
  }

  private readonly onDroneStop = (): void => {
    live.stopDrone();
  };

  private readonly onDroneClear = (): void => {
    live.clearDrone();
  };

  private readonly onPadDown = (event: PadDownEvent): void => {
    const { touch, x, y } = event.detail;
    live.padDown(touch, { x, y });
  };

  private readonly onPadMove = (event: PadDownEvent): void => {
    const { touch, x, y } = event.detail;
    live.padMove(touch, { x, y });
  };

  private readonly onPadUp = (event: PadUpEvent): void => {
    live.padUp(event.detail.touch);
  };

  private readonly onType = (event: TypeChangeEvent): void => {
    store.setDistType(event.detail.type);
    pulse('dist', PULSE_MS.type);
  };

  private readonly onTempo = (event: TempoNudgeEvent): void => {
    store.nudgeBpm(event.detail.direction);
  };

  private readonly onTempoSet = (event: TempoSetEvent): void => {
    store.setBpm(event.detail.bpm);
  };

  private readonly onTransport = (): void => {
    store.togglePlay();
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'mono-panel': MonoPanel;
  }
}
