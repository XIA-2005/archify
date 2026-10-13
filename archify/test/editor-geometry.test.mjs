// Keep editor geometry and layout regressions in the default CI discovery path.
import '../editor/test-auto-layout.mjs';
import '../editor/test-large-graph.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSceneGeometry} from '../editor/scene-normalize.mjs';
import {architectureNodeBox} from '../renderers/shared/architecture-position.mjs';
import {planAutoLayout} from '../editor/auto-layout.mjs';

test('optional connections and grid positions survive geometry and automatic layout helpers',()=>{
  const spec={meta:{},layout:{mode:'grid'},components:[{id:'a',row:1,col:2,label:'A'}]};
  const before=structuredClone(spec);
  assert.deepEqual(normalizeSceneGeometry(spec,null,[],n=>architectureNodeBox(n,spec)),{dx:0,dy:0});
  assert.deepEqual(spec,before);
  assert.ok(planAutoLayout(spec).positions.a.every(Number.isFinite));
  spec.layout.origin=[-400,-200];
  const shift=normalizeSceneGeometry(spec,null,[],n=>architectureNodeBox(n,spec));
  assert.ok(shift.dx>0&&shift.dy>0);assert.ok(spec.components[0].pos.every(n=>n>=0));
  assert.equal(Object.hasOwn(spec,'connections'),false);
});
