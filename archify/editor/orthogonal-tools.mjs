// Candidate-geometry editing helpers only. Never produce an SVG d: Archify owns routing.
const copy = points => points.map(p => [p[0], p[1]]);
const equal = (a, b) => a[0] === b[0] && a[1] === b[1];
const between = (a, b, c) => b >= Math.min(a, c) && b <= Math.max(a, c);

export function axisOf(a, b) {
  if (a[1] === b[1] && a[0] !== b[0]) return 'h';
  if (a[0] === b[0] && a[1] !== b[1]) return 'v';
  return null;
}

export function isOrthogonalPath(points) {
  return Array.isArray(points) && points.length >= 2
    && points.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
    && points.slice(1).every((p, i) => equal(p, points[i]) || axisOf(points[i], p));
}

export function normalizeOrthogonalVia(via, start = null, end = null) {
  if (!Array.isArray(via) || via.some(p => !Array.isArray(p)
    || p.length !== 2 || p.some(n => !Number.isFinite(n)))) {
    throw new Error('折点必须为有限数值坐标');
  }
  const all = [...(start ? [start] : []), ...via, ...(end ? [end] : [])];
  const distinct = [];
  for (const p of all) if (!distinct.length || !equal(p, distinct.at(-1))) distinct.push([...p]);
  // Only discard a point if it lies BETWEEN its neighbors; keep intentional U-turns.
  for (let i = 1; i < distinct.length - 1;) {
    const a = distinct[i - 1], b = distinct[i], c = distinct[i + 1];
    if ((a[0] === b[0] && b[0] === c[0] && between(a[1], b[1], c[1]))
      || (a[1] === b[1] && b[1] === c[1] && between(a[0], b[0], c[0]))) {
      distinct.splice(i, 1);
      if (i > 1) i--;
    } else i++;
  }
  return distinct.slice(start ? 1 : 0, end ? -1 : undefined);
}

export function normalizeRoute(points) {
  if (!isOrthogonalPath(points)) throw new Error('只能规范化正交线路');
  const result = [points[0], ...normalizeOrthogonalVia(points.slice(1, -1), points[0], points.at(-1)), points.at(-1)];
  if (!isOrthogonalPath(result)) throw new Error('规范化后不满足正交约束');
  return copy(result);
}

export function freezeOfficialRoute(route, { startAnchor, endAnchor } = {}) {
  if (!route?.points || !isOrthogonalPath(route.points)) {
    throw new Error('请先等待有效的 Archify 官方正交线路');
  }
  const points = copy(route.points);
  // Automatic multi-edge lanes can offset endpoints by a few pixels. Archify
  // reanchors manual via routes at the center of each chosen node side.
  // Adapt only the adjacent waypoint coordinates to that official manual
  // anchor contract; do not synthesize a final path or override its renderer.
  if (points.length > 2 && startAnchor) {
    const dim = axisOf(points[0], points[1]) === 'h' ? 1 : 0;
    points[0] = [...startAnchor];
    points[1][dim] = startAnchor[dim];
  }
  if (points.length > 2 && endAnchor) {
    const last = points.length - 1;
    const dim = axisOf(points[last - 1], points[last]) === 'h' ? 1 : 0;
    points[last] = [...endAnchor];
    points[last - 1][dim] = endAnchor[dim];
  }
  if (!isOrthogonalPath(points)) throw new Error('自动路线无法安全映射到手动锚点');
  return normalizeOrthogonalVia(points.slice(1, -1), points[0], points.at(-1));
}

export function sideMidpoint(box, side) {
  const x = box.x + box.w / 2, y = box.y + box.h / 2;
  if (side === 'left') return [box.x, y];
  if (side === 'right') return [box.x + box.w, y];
  if (side === 'top') return [x, box.y];
  if (side === 'bottom') return [x, box.y + box.h];
  throw new Error('未知端点方向');
}

export function segmentHandles(points) {
  if (!isOrthogonalPath(points)) return [];
  return points.slice(0, -1).flatMap((p, i) => {
    const next = points[i + 1], axis = axisOf(p, next);
    // First/last segments are anchored to nodes. Move their side handles instead.
    return i > 0 && i < points.length - 2 && axis
      && Math.abs((axis === 'h' ? next[0] - p[0] : next[1] - p[1])) >= 16
      ? [{ index: i, axis, at: [(p[0] + next[0]) / 2, (p[1] + next[1]) / 2] }]
      : [];
  });
}

export function moveSegment(points, index, coordinate) {
  if (!isOrthogonalPath(points) || !Number.isFinite(coordinate)
    || index <= 0 || index >= points.length - 2) {
    throw new Error('只能拖动不连接节点的内部正交线段');
  }
  const axis = axisOf(points[index], points[index + 1]);
  if (!axis) throw new Error('无法移动非正交线段');
  const result = copy(points), dim = axis === 'h' ? 1 : 0;
  result[index][dim] = coordinate;
  result[index + 1][dim] = coordinate;
  if (!isOrthogonalPath(result)) throw new Error('线段移动破坏了正交约束');
  return result;
}

export function moveVertex(points, index, target, shift = false) {
  if (!isOrthogonalPath(points) || index <= 0 || index >= points.length - 1
    || !Array.isArray(target) || target.some(n => !Number.isFinite(n))) {
    throw new Error('无法移动此折点');
  }
  const result = copy(points), old = points[index], next = [...target];
  if (shift) {
    if (Math.abs(next[0] - old[0]) >= Math.abs(next[1] - old[1])) next[1] = old[1];
    else next[0] = old[0];
  }
  const leftAxis = axisOf(points[index - 1], old);
  const rightAxis = axisOf(old, points[index + 1]);
  if (!leftAxis || !rightAxis) throw new Error('折点两侧须为正交线段');
  // Never move a node anchor. If the neighbor is a waypoint, slide it along
  // its previous/next segment to keep both legs orthogonal.
  if (index === 1) next[leftAxis === 'h' ? 1 : 0] = points[0][leftAxis === 'h' ? 1 : 0];
  else result[index - 1][leftAxis === 'h' ? 1 : 0] = next[leftAxis === 'h' ? 1 : 0];
  if (index === points.length - 2) next[rightAxis === 'h' ? 1 : 0] = points.at(-1)[rightAxis === 'h' ? 1 : 0];
  else result[index + 1][rightAxis === 'h' ? 1 : 0] = next[rightAxis === 'h' ? 1 : 0];
  result[index] = next;
  if (!isOrthogonalPath(result)) throw new Error('折点移动破坏了正交约束');
  return result;
}

export function nearestSegment(points, at) {
  if (!isOrthogonalPath(points)) return null;
  let best = null;
  points.slice(0, -1).forEach((a, index) => {
    const b = points[index + 1], axis = axisOf(a, b);
    if (!axis) return;
    const x = axis === 'h' ? Math.max(Math.min(a[0], b[0]), Math.min(Math.max(a[0], b[0]), at[0])) : a[0];
    const y = axis === 'v' ? Math.max(Math.min(a[1], b[1]), Math.min(Math.max(a[1], b[1]), at[1])) : a[1];
    const distance = Math.hypot(at[0] - x, at[1] - y);
    if (!best || distance < best.distance) best = { index, at: [x, y], distance };
  });
  return best;
}

export function insertOrthogonalDetour(points, index, at, offset = 24) {
  if (!isOrthogonalPath(points) || index < 0 || index >= points.length - 1) {
    throw new Error('请先等待有效的正交路线');
  }
  const a = points[index], b = points[index + 1], axis = axisOf(a, b);
  const length = axis === 'h' ? Math.abs(b[0] - a[0]) : Math.abs(b[1] - a[1]);
  if (!axis || length < 56) throw new Error('线段太短，无法插入正交绕行折点');
  const sign = (axis === 'h' ? b[0] - a[0] : b[1] - a[1]) > 0 ? 1 : -1;
  const origin = axis === 'h' ? a[0] : a[1];
  const desired = axis === 'h' ? at[0] : at[1];
  const half = Math.min(18, length / 6);
  const along = Math.max(half + 8, Math.min(length - half - 8, (desired - origin) * sign));
  const u = origin + sign * (along - half), v = origin + sign * (along + half);
  const dogleg = axis === 'h'
    ? [[u, a[1]], [u, a[1] + offset], [v, a[1] + offset], [v, a[1]]]
    : [[a[0], u], [a[0] + offset, u], [a[0] + offset, v], [a[0], v]];
  return normalizeRoute([...points.slice(0, index + 1), ...dogleg, ...points.slice(index + 1)]);
}

export function deleteOrthogonalVertex(points, index) {
  if (!isOrthogonalPath(points) || index <= 0 || index >= points.length - 1) {
    throw new Error('只能删除中间折点');
  }
  const result = copy(points), removed = result.splice(index, 1)[0];
  const before = result[index - 1], after = result[index];
  if (!equal(before, after) && !axisOf(before, after)) {
    const corners = [[before[0], after[1]], [after[0], before[1]]]
      .filter(p => !equal(p, removed));
    // Prefer removing a point rather than replacing it with another corner.
    if (index < result.length - 1) {
      for (const corner of corners) {
        const candidate = copy(result);
        candidate[index] = corner;
        if (isOrthogonalPath(candidate)) return normalizeRoute(candidate);
      }
    }
    if (index > 1) {
      for (const corner of corners) {
        const candidate = copy(result);
        candidate[index - 1] = corner;
        if (isOrthogonalPath(candidate)) return normalizeRoute(candidate);
      }
    }
    if (!corners.length) throw new Error('无法安全删除此折点');
    result.splice(index, 0, corners[0]);
  }
  return normalizeRoute(result);
}

export function nearestSide(box, at) {
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const sides = {
    left: [box.x, clamp(at[1], box.y, box.y + box.h)],
    right: [box.x + box.w, clamp(at[1], box.y, box.y + box.h)],
    top: [clamp(at[0], box.x, box.x + box.w), box.y],
    bottom: [clamp(at[0], box.x, box.x + box.w), box.y + box.h],
  };
  return Object.entries(sides).sort((a, b) =>
    Math.hypot(at[0] - a[1][0], at[1] - a[1][1])
    - Math.hypot(at[0] - b[1][0], at[1] - b[1][1]))[0][0];
}
