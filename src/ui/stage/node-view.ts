import { nothing, svg, type SVGTemplateResult } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { MASTER_POSITION, type Point } from '../../core/geometry';
import type { NodeId } from '../../core/nodes';
import { NODE_NAMES } from '../labels';
import { NODE_COLORS } from '../theme';
import { SHAPES } from './shapes';

/** A node on the canvas: hit area, selection ring, outline and caption. */
export const nodeView = (
  id: NodeId,
  position: Point,
  selected: boolean,
  lit: boolean,
): SVGTemplateResult => svg`
  <g
    class=${classMap({ nd: true, [id]: true, sel: selected, on: lit })}
    id="nd-${id}"
    data-id=${id}
    transform="translate(${position.x} ${position.y})"
    style="--c:${NODE_COLORS[id]}"
  >
    <circle r="48" class="hit" />
    <circle r="46" class="ring" />
    <path d=${SHAPES[id]} />
    <text y="60" text-anchor="middle">${NODE_NAMES[id]}</text>
  </g>`;

/** The cable from a node to MASTER. The LFO carries modulation, so its cable is dashed. */
export const cableView = (id: NodeId, position: Point, lit: boolean): SVGTemplateResult => svg`
  <line
    class=${classMap({ cb: true, on: lit })}
    id="cb-${id}"
    x1=${position.x}
    y1=${position.y}
    x2=${MASTER_POSITION.x}
    y2=${MASTER_POSITION.y}
    style="--c:${NODE_COLORS[id]}"
    stroke-dasharray=${id === 'lfo' ? '6 6' : nothing}
  />`;
