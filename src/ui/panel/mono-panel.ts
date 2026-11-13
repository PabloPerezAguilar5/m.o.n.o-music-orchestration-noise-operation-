import { css, html, LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { kitLabel } from '../../core/drum-kits';
import { gridFromPattern, type DrumPattern } from '../../core/drum-patterns';
import { clickAt } from '../../core/metronome';
import { isSequenced, MACRO_PARAM, NODE_SPECS, type NodeId, type ParamSection } from '../../core/nodes';
import type { Pattern } from '../../core/patterns';
import { randomSeed } from '../../core/random';
import { cues, pulse, store } from '../../state';
import { KIT_ORDER, KNOB_LABELS, NODE_CODES, NODE_NAMES, ROW_LABELS, SECTION_LABELS, TEXT } from '../labels';
import { Selector } from '../store-controller';
import { hardwareKey, reset } from '../styles/shared';
import { NODE_COLORS } from '../theme';
import './mono-keys';
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
import type { XyInputEvent } from './mono-xy-pad';

/** How long the node lights up after each kind of gesture. */
const PULSE_MS = { knob: 200, step: 200, type: 300, key: 450, pad: 250 } as const;

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
      .kits {
        gap: clamp(4px, 0.8vw, 8px);
      }
      /* Narrow screens: eight kits do not fit in one row, so they go in two rows of
         four, each at least 26px tall for a finger (the knob row grows a little). */
      @media (max-width: 1100px) {
        .kits {
          display: grid;
          grid-template-columns: repeat(4, auto);
          grid-auto-rows: minmax(26px, 1fr);
          align-items: stretch;
          gap: 4px;
          min-height: calc(var(--ks) + 14px);
        }
        .kits .pk {
          height: auto;
          min-width: 0;
          padding: 4px 6px 0;
          font-size: 8px;
        }
        .kits .pk.led::before {
          top: 3px;
          height: 2px;
        }
      }
    `,
  ];

  private readonly selected = new Selector(this, store, (s) => s.selected);
  private readonly params = new Selector(this, store, (s) => s.params);
  private readonly patterns = new Selector(this, store, (s) => s.patterns);
  private readonly drone = new Selector(this, store, (s) => s.drone);
  private readonly distType = new Selector(this, store, (s) => s.distType);
  private readonly bpm = new Selector(this, store, (s) => s.transport.bpm);
  private readonly step = new Selector(this, store, (s) => s.transport.step);
  private readonly drum = new Selector(this, store, (s) => s.drum);
  private readonly audio = new Selector(this, store, (s) => s.audio);
  private readonly metronome = new Selector(this, store, (s) => s.metronome);
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
   * about, else the node's name and code (DRUM: its kit).
   */
  private displayText(id: NodeId): string {
    if (this.reading) return this.reading;
    const audio = this.audio.value;
    if (audio.state === 'blocked') return TEXT.audioBlocked;
    if (audio.state === 'unavailable') return TEXT.audioUnavailable;
    const name = NODE_NAMES[id];
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
    return html`<section data-section="pattern">
      <h6>${TEXT.patternSection}</h6>
      <div class="kk">
        <button class="pk" id="rndm" aria-label=${TEXT.rndmHint} @click=${this.onRandomize}>
          ${TEXT.rndm}
        </button>
      </div>
    </section>`;
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
      case 'sequencer':
        return html`<mono-step-grid
          .rows=${ROW_LABELS[id]}
          .pattern=${id === 'drum'
            ? this.drumGridFor(this.drum.value.pattern)
            : id === 'synth' || id === 'bass'
              ? this.patterns.value[id]
              : []}
          .step=${this.step.value}
          @step-toggle=${this.onStepToggle}
        ></mono-step-grid>`;
      case 'xy':
        return html`<mono-xy-pad
          .x=${this.drone.value.x}
          .y=${this.drone.value.y}
          @xy-input=${this.onPad}
        ></mono-xy-pad>`;
      case 'type':
        return html`<mono-type-switch
          .value=${this.distType.value}
          @type-change=${this.onType}
        ></mono-type-switch>`;
      case 'wave':
        return html`<mono-wave></mono-wave>`;
      case 'keys':
        return html`<mono-keys @key-press=${this.onKey}></mono-keys>`;
      case 'tempo':
        return html`<mono-tempo
          .bpm=${this.bpm.value}
          @tempo-nudge=${this.onTempo}
          @tempo-set=${this.onTempoSet}
          @transport-toggle=${this.onTransport}
        ></mono-tempo>`;
    }
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
    else store.toggleStep(id, row, col);
    pulse(id, PULSE_MS.step);
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

  private readonly onPad = (event: XyInputEvent): void => {
    store.setDronePosition(event.detail);
    pulse('drone', PULSE_MS.pad);
  };

  private readonly onType = (event: TypeChangeEvent): void => {
    store.setDistType(event.detail.type);
    pulse('dist', PULSE_MS.type);
  };

  private readonly onKey = (): void => {
    pulse('lead', PULSE_MS.key);
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
