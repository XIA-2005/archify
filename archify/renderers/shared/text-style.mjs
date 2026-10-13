import {DEFAULT_COMPONENT_SIZE} from './architecture-position.mjs';
import { fittedNodeFontSize } from './text-fit.mjs';
import { textUnits } from './utils.mjs';

export function textSize(owner, key, fallback) {
  return owner?.font_sizes?.[key] ?? fallback;
}

export function componentTextGeometry(node, scale = 1) {
  const [x, y] = node.pos || [0, 0];
  const [w, h] = node.size || DEFAULT_COMPONENT_SIZE;
  const explicit = node.font_sizes || {};
  const sizes = {
    label: explicit.label ?? fittedNodeFontSize(node.label, w, 11 * scale, 8 * scale),
    sublabel: explicit.sublabel ?? fittedNodeFontSize(node.sublabel, w, 9 * scale, Math.max(6, 6 * scale)),
    tag: explicit.tag ?? fittedNodeFontSize(node.tag, w, 7 * scale, Math.max(6, 6 * scale)),
  };
  const keys = ['label', ...(node.sublabel ? ['sublabel'] : []), ...(node.tag ? ['tag'] : [])];
  if (!Object.keys(explicit).length) return {
    sizes, x: x + w / 2,
    ys: { label: y + h / 2 + (node.sublabel ? -2 : 4), sublabel: y + h / 2 + 14, tag: y + h - 8 },
  };
  const total = keys.reduce((sum, key) => sum + sizes[key] * 1.3, 0) + (keys.length - 1) * 4;
  let top = y + (h - total) / 2;
  const ys = {};
  for (const key of keys) { ys[key] = top + sizes[key]; top += sizes[key] * 1.3 + 4; }
  return { sizes, ys, x: x + w / 2, requiredHeight: total + 8 };
}

export function labelGeometry(label, size, [lx, ly]) {
  const width = Math.max(30, textUnits(label) * size * 0.6 + 10);
  const height = Math.max(14, Math.ceil(size * 1.3 + 4));
  const baselineOffset = size + 2;
  return { x: lx - width / 2, y: ly - baselineOffset, width, height, lx, ly, baselineOffset };
}

export function arrowBounds(points, scale = 1) {
  if (points.length < 2) return null;
  const tip = points.at(-1), prior = [...points.slice(0, -1)].reverse().find(p => p[0] !== tip[0] || p[1] !== tip[1]);
  if (!prior) return null;
  const angle = Math.atan2(tip[1] - prior[1], tip[0] - prior[0]);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const vertices = [[-9, -3.5], [1, 0], [-9, 3.5]].map(([x, y]) => [tip[0] + scale * (x * cos - y * sin), tip[1] + scale * (x * sin + y * cos)]);
  const xs = vertices.map(p => p[0]), ys = vertices.map(p => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}
