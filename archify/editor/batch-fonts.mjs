export const fontCategories = [
  ['node-label', '模块名称'], ['node-sublabel', '模块说明'], ['node-tag', '模块标签'],
  ['edge-label', '连线文字'], ['boundary-label', '分组标题'], ['legend', '图例文字'],
  ['card-title', '说明卡片标题'], ['card-items', '说明卡片正文'],
];

function field(owner, key) {
  return {
    get: () => owner.font_sizes?.[key],
    set: value => {
      if (value == null) {
        delete owner.font_sizes?.[key];
        if (owner.font_sizes && !Object.keys(owner.font_sizes).length) delete owner.font_sizes;
      } else { owner.font_sizes ||= {}; owner.font_sizes[key] = value; }
    },
  };
}

export function fontTargets(spec, category) {
  if (category.startsWith('node-')) {
    const key = category.slice(5);
    if (!['label', 'sublabel', 'tag'].includes(key)) throw Error('Unknown text category');
    return (spec.components || []).filter(node => node[key]).map(node => field(node, key));
  }
  if (category === 'edge-label' || category === 'boundary-label')
    return (spec[category === 'edge-label' ? 'connections' : 'boundaries'] || []).filter(item => item.label).map(item => field(item, 'label'));
  if (category === 'card-title') return (spec.cards || []).filter(card => card.title).map(card => field(card, 'title'));
  if (category === 'card-items') return (spec.cards || []).flatMap(card => card.items.flatMap((text, index) => text ? [{
    get: () => card.font_sizes?.items?.[index],
    set: value => {
      if (value == null && !card.font_sizes?.items) return;
      card.font_sizes ||= {}; card.font_sizes.items ||= card.items.map(() => null);
      card.font_sizes.items[index] = value;
      if (card.font_sizes.items.every(size => size == null)) delete card.font_sizes.items;
      if (!Object.keys(card.font_sizes).length) delete card.font_sizes;
    },
  }] : []));
  if (category === 'legend') {
    if (spec.meta.legend?.mode === 'hidden') return [];
    const present = new Set((spec.components || []).map(node => node.type));
    const kinds = ['frontend', 'backend', 'database', 'cloud', 'security', 'messagebus', 'external'];
    return kinds.filter(kind => {
      const override = spec.meta.legend?.entries?.[kind];
      return override?.visible === true || ((spec.meta.legend?.mode === 'all' || present.has(kind)) && override?.visible !== false);
    }).map(kind => ({
      get: () => spec.meta.legend?.entries?.[kind]?.font_size,
      set: value => {
        if (value == null) {
          const entry = spec.meta.legend?.entries?.[kind];
          if (entry) { delete entry.font_size; if (!Object.keys(entry).length) delete spec.meta.legend.entries[kind]; }
          if (spec.meta.legend?.entries && !Object.keys(spec.meta.legend.entries).length) delete spec.meta.legend.entries;
          if (spec.meta.legend && !Object.keys(spec.meta.legend).length) delete spec.meta.legend;
        } else {
          spec.meta.legend ||= {}; spec.meta.legend.entries ||= {};
          spec.meta.legend.entries[kind] ||= {}; spec.meta.legend.entries[kind].font_size = value;
        }
      },
    }));
  }
  throw Error('Unknown text category');
}

export function setCategoryFont(spec, category, value) {
  if (value != null && (!Number.isFinite(value) || value < 6 || value > 72 || !Number.isInteger(value * 2)))
    throw Error('字号应为 6–72px，步长 0.5。');
  const targets = fontTargets(spec, category);
  let changed = 0;
  for (const target of targets) if ((target.get() ?? null) !== value) { target.set(value); changed++; }
  return changed;
}
