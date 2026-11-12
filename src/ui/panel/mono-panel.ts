import { css, html, LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { isSequenced, MACRO_PARAM, NODE_SPECS, type NodeId } from '../../core/nodes';
import { pulse, store } from '../../state';
import { KNOB_LABELS, NODE_CODES, NODE_NAMES, ROW_LABELS, TEXT } from '../labels';
import { Selector } from '../store-controller';
import { reset } from '../styles/shared';
import { NODE_COLORS } from '../theme';
import './mono-keys';
import './mono-knob';
import type { KnobInputEvent } from './mono-knob';
import './mono-step-grid';
import type { StepToggleEvent } from './mono-step-grid';
import './mono-tempo';
import type { TempoNudgeEvent } from './mono-tempo';
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
    `,
  ];

  private readonly selected = new Selector(this, store, (s) => s.selected);
  private readonly params = new Selector(this, store, (s) => s.params);
  private readonly patterns = new Selector(this, store, (s) => s.patterns);
  private readonly drone = new Selector(this, store, (s) => s.drone);
  private readonly distType = new Selector(this, store, (s) => s.distType);
  private readonly bpm = new Selector(this, store, (s) => s.transport.bpm);
  private readonly step = new Selector(this, store, (s) => s.transport.step);

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
    const name = NODE_NAMES[id];
    const values = this.params.value[id];
    const labels = KNOB_LABELS[id];

    return html`<div id="panel">
      <div class="hd">
        <span class="plq">${TEXT.plaque}</span>
        <div class="lcd" id="lcd">${this.reading ?? `${name} · ${NODE_CODES[id]}`}</div>
        <i class="hz"></i>
        ${id !== 'master'
          ? html`<button id="rm" aria-label=${TEXT.removeNode} @click=${this.onRemove}>✕</button>`
          : nothing}
      </div>
      <div class="plate">
        <div class="kr">
          <section>
            <h6>${name}</h6>
            <div class="kk">
              ${NODE_SPECS[id].params.map((param, index) =>
                this.knob(param, labels[index] ?? param, values[param] ?? 0, false),
              )}
            </div>
          </section>
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
          .pattern=${isSequenced(id) ? this.patterns.value[id] : []}
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
          @transport-toggle=${this.onTransport}
        ></mono-tempo>`;
    }
  }

  private onKnob(param: string, label: string, value: number): void {
    const id = this.selected.value;
    store.setParam(id, param, value);
    pulse(id, PULSE_MS.knob);
    this.reading = `${NODE_NAMES[id]} ${label} ${Math.round(value * 127)}`;
  }

  private readonly onRemove = (): void => {
    store.removeNode(this.selected.value);
  };

  private readonly onStepToggle = (event: StepToggleEvent): void => {
    const id = this.selected.value;
    if (!isSequenced(id)) return;
    store.toggleStep(id, event.detail.row, event.detail.col);
    pulse(id, PULSE_MS.step);
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

  private readonly onTransport = (): void => {
    store.togglePlay();
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'mono-panel': MonoPanel;
  }
}
