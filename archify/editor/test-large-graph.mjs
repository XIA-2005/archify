#!/usr/bin/env node
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {LARGE_GRAPH_THRESHOLD,nodeBox,sceneBounds,intersectsViewport,routeBox,
  levelOfDetail,searchNodes,minimapProjection} from './large-graph.mjs';

test('scene extents include node sizes and negative positions',()=>{
  const nodes=[{id:'a',pos:[-200,50],size:[120,80]},
    {id:'b',pos:[600,400],size:[200,100]}];
  assert.deepEqual(sceneBounds(nodes),{x:-200,y:50,w:1000,h:450});
  assert.deepEqual(nodeBox({id:'c',pos:[10,20]}),{x:10,y:20,w:120,h:60});
  assert.deepEqual(sceneBounds([]),{x:0,y:0,w:1200,h:700});
});

test('viewport culling uses padded intersection, including boundary touch',()=>{
  const camera={x:100,y:100,w:300,h:200};
  assert.equal(intersectsViewport({x:0,y:0,w:100,h:100},camera),true);
  assert.equal(intersectsViewport({x:410,y:180,w:50,h:20},camera),false);
  assert.equal(intersectsViewport({x:410,y:180,w:50,h:20},camera,20),true);
  assert.equal(intersectsViewport({x:0,y:0,w:10,h:10},null),true);
});

test('route culling uses only verified route points and label bounds',()=>{
  const route={points:[[10,20],[110,20],[110,150]],labelBox:{x:160,y:100,width:90,height:35}};
  assert.deepEqual(routeBox(route),{x:10,y:20,w:240,h:130});
  assert.equal(routeBox({points:[]}),null);
  assert.equal(routeBox(null),null);
});

test('search matches ids, names, descriptions with stable ranking',()=>{
  const nodes=[{id:'backend-a',label:'API',sublabel:'green cluster'},
    {id:'api',label:'Server',sublabel:'service'},
    {id:'frontend',label:'API Gateway',sublabel:'proxy'},
    {id:'other',label:'Database',sublabel:'API keys'}];
  assert.deepEqual(searchNodes(nodes,' API ').map(n=>n.id),
    ['api','backend-a','frontend','other']);
  assert.deepEqual(searchNodes(nodes,'CLUSTER').map(n=>n.id),['backend-a']);
  assert.deepEqual(searchNodes(nodes,'  '),[]);
  assert.equal(nodes[0].label,'API');
});

test('minimap maps world to canvas and back and keeps viewport scale',()=>{
  const nodes=[{id:'a',pos:[100,200],size:[200,100]},
    {id:'b',pos:[600,500],size:[100,100]}];
  const projection=minimapProjection(nodes);
  for (const point of [[100,200],[700,600],[300,450]]) {
    const mapped=projection.toMap(...point);
    const restored=projection.toWorld(...mapped);
    assert.ok(Math.abs(restored[0]-point[0])<1e-8);
    assert.ok(Math.abs(restored[1]-point[1])<1e-8);
  }
  assert.ok(projection.rect(nodeBox(nodes[0])).w>0);
  assert.ok(projection.scale>0);
});

test('LOD thresholds and 100–1000 node visibility can be calculated without DOM',()=>{
  assert.equal(LARGE_GRAPH_THRESHOLD,100);
  assert.equal(levelOfDetail({w:1000},800),'detail');
  assert.equal(levelOfDetail({w:4000},800),'compact');
  assert.equal(levelOfDetail({w:10000},800),'overview');
  const nodes=Array.from({length:1000},(_,i)=>({id:`node-${i}`,label:`Node ${i}`,
    pos:[(i%40)*300,Math.floor(i/40)*200],size:[160,76]}));
  const viewport={x:0,y:0,w:700,h:500};
  const visible=nodes.filter(n=>intersectsViewport(nodeBox(n),viewport));
  assert.ok(visible.length>0 && visible.length<50);
  assert.equal(searchNodes(nodes,'node-999')[0].id,'node-999');
  assert.ok(minimapProjection(nodes).scale>0);
});
