// Deterministic, dependency-free layered placement for Architecture v1 nodes.
// This module only proposes node coordinates; Archify remains the sole edge router.
const primarySize = (node, direction) => node.size?.[direction === 'LR' ? 0 : 1] ?? (direction === 'LR' ? 120 : 60);
const crossSize = (node, direction) => node.size?.[direction === 'LR' ? 1 : 0] ?? (direction === 'LR' ? 60 : 120);

export function planAutoLayout(candidate, options = {}) {
  const {direction = 'LR', layerGap = 110, nodeGap = 56, componentGap = 120, margin = 80} = options;
  if (!['LR', 'TB'].includes(direction)) throw new Error('布局方向必须是 LR 或 TB');
  for (const [name, value, min, max] of [
    ['层间距', layerGap, 40, 320], ['节点间距', nodeGap, 24, 240],
    ['连通块间距', componentGap, 40, 400], ['边距', margin, 24, 240],
  ]) {
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(`${name}必须在 ${min}–${max} 之间`);
    }
  }
  if (!Array.isArray(candidate?.components) || (candidate?.connections!==undefined&&!Array.isArray(candidate.connections))) {
    throw new Error('缺少 Architecture 组件或连接列表');
  }
  const nodes = candidate.components;
  if (nodes.length > 300) throw new Error('MVP 最多支持 300 个节点');
  const byId = new Map();
  nodes.forEach((node, index) => {
    if (typeof node.id !== 'string' || !node.id || byId.has(node.id)) {
      throw new Error('节点 ID 不能为空或重复');
    }
    if (node.size && (!Array.isArray(node.size) || node.size.length !== 2
      || node.size.some(n => !Number.isFinite(n) || n <= 0))) {
      throw new Error(`节点 ${node.id} 的尺寸无效`);
    }
    byId.set(node.id, index);
  });

  const out = nodes.map(() => new Set()), incoming = nodes.map(() => new Set());
  let skippedEdges = 0;
  for (const edge of (candidate.connections||[])) {
    const a = byId.get(edge.from), b = byId.get(edge.to);
    if (a === undefined || b === undefined) {skippedEdges++; continue;}
    out[a].add(b);
    incoming[b].add(a);
  }

  // Collapse directed cycles so every condensed graph is a DAG.
  const visitIndex = nodes.map(() => -1), low = nodes.map(() => 0);
  const stack = [], onStack = new Set(), scc = [], groupOf = new Array(nodes.length);
  let clock = 0;
  function visit(v) {
    visitIndex[v] = low[v] = clock++;
    stack.push(v);onStack.add(v);
    for (const w of out[v]) {
      if (visitIndex[w] < 0) {visit(w);low[v] = Math.min(low[v], low[w]);}
      else if (onStack.has(w)) low[v] = Math.min(low[v], visitIndex[w]);
    }
    if (low[v] === visitIndex[v]) {
      const members = [];
      let w;
      do {w = stack.pop();onStack.delete(w);groupOf[w] = scc.length;members.push(w);} while (w !== v);
      members.sort((a, b) => a - b);
      scc.push(members);
    }
  }
  for (let i = 0; i < nodes.length; i++) if (visitIndex[i] < 0) visit(i);
  const dag = scc.map(() => new Set()), undirected = scc.map(() => new Set());
  for (let i = 0; i < nodes.length; i++) for (const j of out[i]) {
    const a = groupOf[i], b = groupOf[j];
    if (a !== b) {dag[a].add(b);undirected[a].add(b);undirected[b].add(a);}
  }
  const groupOrder = scc.map((members, id) => ({id, first: members[0]}))
    .sort((a, b) => a.first - b.first).map(g => g.id);
  // Keep disjoint top-level boundary groups in separate placement strips.
  // Nested/equal wraps share a strip; overlapping, non-nested memberships are
  // deliberately left unassigned rather than guessed.
  const boundarySets = [];
  for (const boundary of candidate.boundaries || []) {
    if (!Array.isArray(boundary.wraps)) continue;
    const members = new Set(boundary.wraps.filter(id => byId.has(id)));
    if (members.size && !boundarySets.some(other => other.size === members.size
      && [...members].every(id => other.has(id)))) boundarySets.push(members);
  }
  const maximal = boundarySets.filter(members => !boundarySets.some(other =>
    other.size > members.size && [...members].every(id => other.has(id))));
  const owner = nodes.map(node => {
    const matches = maximal.flatMap((members, index) => members.has(node.id) ? [index] : []);
    return matches.length === 1 ? matches[0] : null;
  });
  const groupOwner = scc.map(members => members.every(id => owner[id] === owner[members[0]])
    ? owner[members[0]] : null);
  const visited = new Set(), weakGroups = [];
  for (const root of groupOrder) {
    if (visited.has(root)) continue;
    if (groupOwner[root] !== null) {
      const group = groupOrder.filter(id => groupOwner[id] === groupOwner[root]);
      group.forEach(id => visited.add(id));
      weakGroups.push(group);
      continue;
    }
    const group = [], queue = [root];visited.add(root);
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];group.push(current);
      for (const next of undirected[current]) if (!visited.has(next) && groupOwner[next] === null) {
        visited.add(next);queue.push(next);
      }
    }
    weakGroups.push(group);
  }

  const positions = {};
  let crossOffset = 0, maxPrimary = 0, maxCross = 0, layerCount = 0;
  for (const group of weakGroups) {
    const inGroup = new Set(group), indegree = new Map(group.map(id => [id, 0]));
    for (const id of group) for (const next of dag[id]) {
      if (inGroup.has(next)) indegree.set(next, indegree.get(next) + 1);
    }
    const ready = group.filter(id => indegree.get(id) === 0), ranks = new Map();
    for (const id of ready) ranks.set(id, 0);
    const order = [];
    while (ready.length) {
      ready.sort((a, b) => scc[a][0] - scc[b][0]);
      const id = ready.shift();order.push(id);
      for (const next of dag[id]) {
        if (!inGroup.has(next)) continue;
        ranks.set(next, Math.max(ranks.get(next) ?? 0, ranks.get(id) + 1));
        indegree.set(next, indegree.get(next) - 1);
        if (indegree.get(next) === 0) ready.push(next);
      }
    }
    const maxRank = Math.max(0, ...order.map(id => ranks.get(id)));
    const layers = Array.from({length: maxRank + 1}, () => []);
    for (const id of order) for (const member of scc[id]) layers[ranks.get(id)].push(member);
    const rankOf = new Map(layers.flatMap((layer, rank) => layer.map(id => [id, rank])));
    // Repeated barycenter sweeps reduce crossings without introducing randomness.
    for (let sweep = 0; sweep < 6; sweep++) {
      const forward = sweep % 2 === 0;
      const indices = [...layers.keys()];
      if (!forward) indices.reverse();
      for (const rank of indices) {
        const layer = layers[rank], previous = new Map(layer.map((id, index) => [id, index]));
        const neighbors = forward ? incoming : out;
        const adjacent = layers[rank + (forward ? -1 : 1)];
        if (!adjacent) continue;
        const neighborIndex = new Map(adjacent.map((id, index) => [id, index]));
        const score = id => {
          const connected = [...neighbors[id]].filter(n => rankOf.get(n) === rank + (forward ? -1 : 1));
          return connected.length ? connected.reduce((sum, n) => sum + neighborIndex.get(n), 0) / connected.length : null;
        };
        const scores = new Map(layer.map(id => [id, score(id)]));
        layer.sort((a, b) => {
          const x = scores.get(a), y = scores.get(b);
          return x === null && y === null ? previous.get(a) - previous.get(b)
            : x === null ? 1 : y === null ? -1 : x - y || previous.get(a) - previous.get(b);
        });
      }
    }
    const widths = layers.map(layer => Math.max(...layer.map(id => primarySize(nodes[id], direction))));
    const heights = layers.map(layer => layer.reduce((sum, id) => sum + crossSize(nodes[id], direction), 0)
      + nodeGap * Math.max(0, layer.length - 1));
    const groupCross = Math.max(...heights);
    let primary = margin;
    for (let rank = 0; rank < layers.length; rank++) {
      let cross = margin + crossOffset + (groupCross - heights[rank]) / 2;
      for (const id of layers[rank]) {
        const node = nodes[id];
        const main = primary + (widths[rank] - primarySize(node, direction)) / 2;
        positions[node.id] = direction === 'LR' ? [Math.round(main), Math.round(cross)]
          : [Math.round(cross), Math.round(main)];
        cross += crossSize(node, direction) + nodeGap;
      }
      primary += widths[rank] + layerGap;
    }
    maxPrimary = Math.max(maxPrimary, primary - layerGap);
    maxCross = Math.max(maxCross, crossOffset + groupCross);
    crossOffset += groupCross + componentGap;
    layerCount += layers.length;
  }
  const bounds = direction === 'LR'
    ? {width: Math.ceil(margin + maxPrimary), height: Math.ceil(2 * margin + maxCross)}
    : {width: Math.ceil(2 * margin + maxCross), height: Math.ceil(margin + maxPrimary)};
  return {
    positions, bounds,
    stats: {
      nodes: nodes.length, groups: weakGroups.length, layers: layerCount,
      boundaryGroups: maximal.length,
      cycles: scc.filter(members => members.length > 1 || out[members[0]]?.has(members[0])).length,
      manualRoutes: (candidate.connections||[]).filter(e => e.via?.length || e.labelAt || e.fromSide
        || e.toSide || (e.route && e.route !== 'auto')).length,
      skippedEdges,
    },
  };
}

export function applyAutoLayout(candidate, plan) {
  const result = structuredClone(candidate);
  for (const node of result.components) {
    if (!Object.hasOwn(plan.positions, node.id)) throw new Error(`缺少节点 ${node.id} 的布局位置`);
    node.pos = [...plan.positions[node.id]];
  }
  if (result.components.length) {
    const maxX = Math.max(...result.components.map(n => n.pos[0] + (n.size?.[0] ?? 120)));
    const maxY = Math.max(...result.components.map(n => n.pos[1] + (n.size?.[1] ?? 60)));
    const old = result.meta.viewBox || [1743, 958];
    if (maxX > old[0] - 12 || maxY > old[1] - 12) {
      result.meta.viewBox = [Math.max(old[0], Math.ceil(maxX + 24)),
        Math.max(old[1], Math.ceil(maxY + 24))];
    }
  }
  return result;
}
