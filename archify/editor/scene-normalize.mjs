export function normalizeSceneGeometry(spec, camera, labelRects = [], boxOf = n => ({ x: n.pos[0], y: n.pos[1], w: n.size?.[0] || 120, h: n.size?.[1] || 60 })) {
  if (!spec.components?.length) return { dx: 0, dy: 0 };
  const boxes = spec.components.map(boxOf);
  const points = (spec.connections||[]).flatMap(e => [...(e.via || []), ...(e.labelAt ? [e.labelAt] : [])]);
  const frames = (spec.boundaries || []).flatMap(b => {
    const members = b.wraps.map(id => boxes[spec.components.findIndex(n => n.id === id)]).filter(Boolean);
    const pad = b.pad ?? 30;
    if (!members.length) return [];
    const x = Math.min(...members.map(n => n.x)) - pad;
    const y = Math.min(...members.map(n => n.y)) - Math.max(pad, (b.font_sizes?.label || 9) + 12);
    return [{ x, y, w: Math.max(...members.map(n => n.x + n.w)) + pad - x,
      h: Math.max(...members.map(n => n.y + n.h)) + pad - y }];
  });
  const minX = Math.min(...boxes.map(n => n.x), ...frames.map(n => n.x), ...points.map(p => p[0]), ...labelRects.map(r => r.x));
  const minY = Math.min(...boxes.map(n => n.y), ...frames.map(n => n.y), ...points.map(p => p[1]), ...labelRects.map(r => r.y));
  const dx = minX < 0 ? Math.ceil(16 - minX) : 0, dy = minY < 0 ? Math.ceil(16 - minY) : 0;
  if (dx || dy) {
    for (const n of spec.components) { const b=boxOf(n); n.pos=[b.x+dx,b.y+dy]; }
    for (const e of (spec.connections||[])) {
      for (const p of e.via || []) { p[0] += dx; p[1] += dy; }
      if (e.labelAt) { e.labelAt[0] += dx; e.labelAt[1] += dy; }
    }
    if (spec.layout?.origin) { spec.layout.origin[0] += dx; spec.layout.origin[1] += dy; }
    if (camera) { camera.x += dx; camera.y += dy; }
  }
  const right = Math.max(...[...boxes, ...frames].map(n => n.x + dx + n.w), ...points.map(p => p[0]), ...labelRects.map(r => r.x + dx + r.width));
  const bottom = Math.max(...[...boxes, ...frames].map(n => n.y + dy + n.h), ...points.map(p => p[1]), ...labelRects.map(r => r.y + dy + r.height));
  // Keep automatically sized diagrams automatic, including the reader-fit policy.
  const old = spec.meta.viewBox;
  if (old && (dx || dy || right > old[0] - 12 || bottom > old[1] - 12))
    spec.meta.viewBox = [Math.max(old[0] + dx, Math.ceil(right + 40)), Math.max(old[1] + dy, Math.ceil(bottom + 80))];
  return { dx, dy };
}
