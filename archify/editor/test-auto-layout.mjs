#!/usr/bin/env node
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {planAutoLayout, applyAutoLayout} from './auto-layout.mjs';

const node = (id, size = [160, 76]) => ({id, label:id, type:'backend', pos:[600, 300], size});
const edge = (from, to, more = {}) => ({id:`${from}-${to}`, from, to, label:'edge', ...more});
const diagram = (components, connections = []) => ({
  schema_version:1, diagram_type:'architecture',
  meta:{title:'test', output:'diagram.html', viewBox:[320, 240]},
  components, connections, boundaries:[{id:'group', label:'Group', wraps:components.map(n => n.id)}],
  cards:[{title:'Card',items:['kept']}],
});
function noOverlaps(result) {
  for (let i = 0; i < result.components.length; i++) for (let j = i + 1; j < result.components.length; j++) {
    const a = result.components[i], b = result.components[j];
    assert.ok(a.pos[0] + a.size[0] <= b.pos[0] || b.pos[0] + b.size[0] <= a.pos[0]
      || a.pos[1] + a.size[1] <= b.pos[1] || b.pos[1] + b.size[1] <= a.pos[1],
    `Nodes overlap: ${a.id}, ${b.id}`);
  }
}

test('left-to-right layout follows edges, respects mixed sizes and does not mutate input', () => {
  const input = diagram([node('a',[200,80]),node('b',[120,110]),node('c',[180,70])],
    [edge('a','b'),edge('b','c')]);
  const before = structuredClone(input);
  const plan = planAutoLayout(input,{direction:'LR',layerGap:100,nodeGap:60});
  assert.deepEqual(input,before);
  assert.ok(plan.positions.a[0] + 200 + 100 <= plan.positions.b[0]);
  assert.ok(plan.positions.b[0] + 120 + 100 <= plan.positions.c[0]);
  const applied = applyAutoLayout(input,plan);
  noOverlaps(applied);
  assert.deepEqual(input,before);
  assert.equal(plan.stats.layers,3);
  assert.ok(applied.meta.viewBox[0] >= applied.components[2].pos[0] + 180);
});

test('top-to-bottom layout orders a branching graph without overlapping nodes', () => {
  const input = diagram([node('a'),node('b',[210,96]),node('c',[120,110]),node('d')],
    [edge('a','b'),edge('a','c'),edge('b','d'),edge('c','d')]);
  const plan = planAutoLayout(input,{direction:'TB',layerGap:70,nodeGap:40});
  const applied = applyAutoLayout(input,plan);
  noOverlaps(applied);
  assert.ok(plan.positions.a[1] < plan.positions.b[1]);
  assert.ok(plan.positions.a[1] < plan.positions.c[1]);
  assert.ok(plan.positions.b[1] < plan.positions.d[1]);
  assert.ok(plan.positions.c[1] < plan.positions.d[1]);
  assert.equal(plan.stats.groups,1);
});

test('cycles, self-loops and disconnected components produce deterministic non-overlapping layouts', () => {
  const input = diagram([node('a'),node('b'),node('c'),node('d'),node('e'),node('f')],
    [edge('a','b'),edge('b','a'),edge('b','c'),edge('d','d'),edge('e','f')]);
  input.boundaries=[];
  for (const direction of ['LR','TB']) {
    const first = planAutoLayout(input,{direction});
    assert.deepEqual(first,planAutoLayout(input,{direction}));
    noOverlaps(applyAutoLayout(input,first));
    assert.equal(first.stats.cycles,2);
    assert.equal(first.stats.groups,3);
  }
});

test('manual routes, labels, endpoint sides, boundaries, cards and metadata remain intact', () => {
  const input = diagram([node('a'),node('b')], [edge('a','b',{
    route:'straight',fromSide:'right',toSide:'left',via:[[500,200],[700,200]],labelAt:[640,180],
  })]);
  const before = structuredClone(input);
  const plan = planAutoLayout(input);
  const output = applyAutoLayout(input,plan);
  assert.equal(plan.stats.manualRoutes,1);
  assert.deepEqual(output.connections,before.connections);
  assert.deepEqual(output.boundaries,before.boundaries);
  assert.deepEqual(output.cards,before.cards);
  assert.equal(output.meta.output,before.meta.output);
  assert.deepEqual(input,before);
});

test('disjoint outer boundaries stay apart while nested and identical wraps remain grouped', () => {
  const input = diagram([node('client'),node('east1'),node('east2'),node('dr'),node('monitor')],
    [edge('client','east1'),edge('east1','east2'),edge('east2','dr'),edge('east2','monitor')]);
  input.boundaries = [
    {kind:'region',wraps:['east1','east2'],pad:20},
    {kind:'security-group',wraps:['east2'],pad:14},
    {kind:'region',wraps:['dr'],pad:20},
    {kind:'security-group',wraps:['dr'],pad:14},
  ];
  const frame = (result, ids, pad) => {
    const boxes = ids.map(id => result.components.find(n => n.id === id));
    return {left:Math.min(...boxes.map(n => n.pos[0]))-pad,
      right:Math.max(...boxes.map(n => n.pos[0]+n.size[0]))+pad,
      top:Math.min(...boxes.map(n => n.pos[1]))-pad,
      bottom:Math.max(...boxes.map(n => n.pos[1]+n.size[1]))+pad};
  };
  for (const direction of ['LR','TB']) {
    const plan=planAutoLayout(input,{direction});
    const result=applyAutoLayout(input,plan);
    noOverlaps(result);
    const east=frame(result,['east1','east2'],20),dr=frame(result,['dr'],20);
    assert.ok(east.right < dr.left || dr.right < east.left
      || east.bottom < dr.top || dr.bottom < east.top,`Boundary frames overlap: ${direction}`);
    assert.equal(plan.stats.boundaryGroups,2);
  }
});

test('empty diagram, unknown edge endpoints, invalid settings and duplicate IDs', () => {
  const empty = diagram([]);
  assert.deepEqual(applyAutoLayout(empty,planAutoLayout(empty)),empty);
  const badEdge = diagram([node('a')],[edge('a','missing')]);
  assert.equal(planAutoLayout(badEdge).stats.skippedEdges,1);
  assert.throws(()=>planAutoLayout(badEdge,{direction:'diagonal'}),/方向/);
  assert.throws(()=>planAutoLayout(badEdge,{layerGap:0}),/层间距/);
  assert.throws(()=>planAutoLayout(diagram([node('a'),node('a')])),/重复/);
});
