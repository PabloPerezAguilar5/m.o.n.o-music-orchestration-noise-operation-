import { nothing, svg, type SVGTemplateResult } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import type { Point } from '../../core/geometry';
import type { NodeId } from '../../core/nodes';
import { hasOutput, type Cable } from '../../core/routing';
import { NODE_NAMES, TEXT } from '../labels';
import { NODE_COLORS } from '../theme';
import { SHAPES } from './shapes';

/** Where a node's output port sits, from its centre (on the right edge of its outline). */
export const OUTPUT_PORT: Point = { x: 44, y: 0 };
/** Where a valid target shows its input while a cable is dragged (left edge). */
export const INPUT_PORT: Point = { x: -44, y: 0 };

export interface NodeLook {
  readonly selected: boolean;
  readonly lit: boolean;
  /** A cable is being dragged and it can land here: the input port lights up. */
  readonly target: boolean;
  /** Colour of the cable being dragged (the source's). */
  readonly wire: string | null;
}

/**
 * A node on the canvas: hit area, selection ring, outline, caption and its output port
 * (MASTER has none: it goes to the speakers). While a cable is dragged, the nodes it can
 * land on show their input port lit in the cable's colour.
 */
export const nodeView = (id: NodeId, position: Point, look: NodeLook): SVGTemplateResult => svg`
  <g
    class=${classMap({ nd: true, [id]: true, sel: look.selected, on: look.lit, tg: look.target })}
    id="nd-${id}"
    data-id=${id}
    transform="translate(${position.x} ${position.y})"
    style="--c:${NODE_COLORS[id]}${look.wire ? `;--w:${look.wire}` : ''}"
  >
    <circle r="48" class="hit" />
    <circle r="46" class="ring" />
    <path d=${SHAPES[id]} />
    <text y="60" text-anchor="middle">${NODE_NAMES[id]}</text>
    ${look.target ? svg`<circle class="pin" cx=${INPUT_PORT.x} cy=${INPUT_PORT.y} r="6" />` : nothing}
    ${hasOutput(id)
      ? svg`<g
          class="port"
          id="port-${id}"
          data-port=${id}
          role="button"
          aria-label=${TEXT.portHint}
          transform="translate(${OUTPUT_PORT.x} ${OUTPUT_PORT.y})"
        >
          <circle class="phit" r="20" />
          <circle class="pdot" r="5" />
        </g>`
      : nothing}
  </g>`;

/**
 * A cable from a node to another, in the colour of the node it comes from. Sound cables
 * are solid; the LFO's modulation cables are dotted. A cut cable is drawn faint (sound:
 * finely dashed). A wide invisible line on top makes it easy to tap (to cut it or plug
 * it back).
 */
export const cableView = (cable: Cable, from: Point, to: Point, lit: boolean): SVGTemplateResult => {
  const mod = cable.from === 'lfo';
  const id = `${cable.from}-${cable.to}`;
  return svg`
    <line
      class=${classMap({ cb: true, mod, on: lit && !cable.cut, off: cable.cut })}
      id="cb-${id}"
      x1=${from.x}
      y1=${from.y}
      x2=${to.x}
      y2=${to.y}
      style="--c:${NODE_COLORS[cable.from]}"
    />
    <line
      class="cbh"
      id="cbh-${id}"
      data-from=${cable.from}
      data-to=${cable.to}
      role="button"
      aria-label=${TEXT.cableHint}
      aria-pressed=${!cable.cut}
      x1=${from.x}
      y1=${from.y}
      x2=${to.x}
      y2=${to.y}
    />`;
};

/** The cable being dragged out of a port, to the pointer. */
export const wireView = (from: NodeId, start: Point, end: Point): SVGTemplateResult => svg`
  <line
    class=${classMap({ wire: true, mod: from === 'lfo' })}
    id="wire"
    x1=${start.x}
    y1=${start.y}
    x2=${end.x}
    y2=${end.y}
    style="--c:${NODE_COLORS[from]}"
  />`;
