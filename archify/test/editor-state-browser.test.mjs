import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {startEditor} from './editor-test-helpers.mjs';
import {ChromeVisualBrowser,findChrome} from '../bin/visual-check.mjs';

async function openEditor(t,candidate,schema=false){
  const chrome=findChrome();if(!chrome){t.skip('Chrome required');return;}
  const server=await startEditor(t,candidate,schema),browser=new ChromeVisualBrowser(chrome);
  t.after(()=>browser.close());const sid=await browser.sessionPromise;
  const call=(method,params={})=>browser.cdp.send(method,params,sid);
  const run=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.equal(r.exceptionDetails,undefined,JSON.stringify(r.exceptionDetails));return r.result?.value;};
  const until=async expression=>{const end=Date.now()+20000;while(Date.now()<end){if(await run(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout: '+expression+'; '+await run(`document.getElementById('message')?.textContent||document.getElementById('status')?.textContent`));};
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:server.base});await until(schema?`document.getElementById('status').textContent.includes('已加载')`:`!!document.getElementById('drawio-canvas')?.contentWindow?.archifyDrawio?.graph.model.getCell('node-a')`);
  const snapshot=()=>run(`(async()=>{let blob;const old=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;URL.createObjectURL=b=>{blob=b;return old(b)};HTMLAnchorElement.prototype.click=()=>{};try{document.getElementById('${schema?'download':'export'}').click()}finally{URL.createObjectURL=old;HTMLAnchorElement.prototype.click=click}return JSON.parse(await blob.text())})()`);
  async function screenshot(name){
    const output=process.env.ARCHIFY_EDITOR_RUNTIME_EVIDENCE;if(!output)return;
    fs.mkdirSync(output,{recursive:true});const picture=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(picture.data,'base64'));
  }
  return {...server,call,run,until,snapshot,screenshot};
}
const native=`const w=document.getElementById('drawio-canvas').contentWindow,g=w.archifyDrawio.graph;`;
const candidate=()=>({schema_version:1,diagram_type:'architecture',meta:{title:'State preservation',output:'diagram.html',quality_profile:'standard'},
  components:['a','b','c','d'].map((id,i)=>({id,type:'backend',label:id,pos:[200+i*220,200],size:[120,60]})),
  boundaries:[{kind:'region',label:'First',wraps:['a'],pad:35},{kind:'region',label:'Second',wraps:['b'],pad:35},{kind:'region',label:'Third',wraps:['c'],pad:35}],
  connections:[{from:'a',to:'b',label:'first'},{from:'b',to:'c',label:'second'},{from:'c',to:'d',label:'third'}]});

test('anonymous edge and boundary deletion preserves mapping across later edits and history',{timeout:120000},async t=>{
  const page=await openEditor(t,candidate());if(!page)return;const {run,snapshot,until}=page;
  await until(`document.getElementById('message').textContent.includes('正式路由已同步')`);
  await run(`(()=>{${native}g.removeCells([g.model.getCell('edge-edge-0')]);})()`);
  assert.deepEqual((await snapshot()).connections.map(e=>e.label),['second','third']);
  await run(`(()=>{${native}const c=Object.values(g.model.cells).find(c=>c.edge&&c.value==='second');g.model.setValue(c,'edited second');})()`);
  assert.deepEqual((await snapshot()).connections.map(e=>e.label),['edited second','third']);
  await run(`(()=>{${native}const c=Object.values(g.model.cells).find(c=>c.edge&&c.value==='edited second');g.removeCells([c]);})()`);
  assert.deepEqual((await snapshot()).connections.map(e=>e.label),['third']);
  await run(`document.getElementById('undo').click()`);assert.equal((await snapshot()).connections.length,2);
  await run(`document.getElementById('redo').click()`);assert.equal((await snapshot()).connections.length,1);
  await run(`(()=>{${native}g.insertEdge(g.getDefaultParent(),null,'new edge',g.model.getCell('node-a'),g.model.getCell('node-d'),Object.values(g.model.cells).find(c=>c.edge).style);})()`);
  const added=await snapshot();assert.equal(added.connections.length,2);assert.ok(added.connections[1].id);assert.equal(added.connections[0].label,'third');
  await run(`(()=>{${native}const c=Object.values(g.model.cells).find(c=>c.edge&&c.value==='new edge');g.model.setValue(c,'edited new edge');})()`);
  assert.deepEqual((await snapshot()).connections.map(e=>e.label),['third','edited new edge']);
  // Ungroup removes the frame while keeping its nodes; this must not shift the next frame's mapping.
  await run(`(()=>{${native}g.setSelectionCell(Object.values(g.model.cells).find(c=>c.archifyKind==='boundary'&&c.value==='First'));g.ungroupCells();})()`);
  assert.deepEqual((await snapshot()).boundaries.map(b=>b.label),['Second','Third']);
  await run(`(()=>{${native}const c=Object.values(g.model.cells).find(c=>c.archifyKind==='boundary'&&c.value==='Third');g.model.setValue(c,'edited third');})()`);
  assert.deepEqual((await snapshot()).boundaries.map(b=>b.label),['Second','edited third']);
  await run(`(()=>{${native}g.removeCells([g.model.getCell('node-c')]);})()`);
  const last=await snapshot();assert.deepEqual(last.connections.map(e=>e.label),['edited new edge']);assert.deepEqual(last.components.map(n=>n.id),['a','b','d']);
});

test('grid coordinates, omitted edges and default sizes open without mutating authored input',{timeout:120000},async t=>{
  const source={schema_version:1,diagram_type:'architecture',meta:{title:'Grid',output:'diagram.html',quality_profile:'standard'},layout:{mode:'grid'},components:[{id:'a',type:'backend',label:'A',row:1,col:2},{id:'b',type:'backend',label:'B',pos:[600,320],row:0,col:0,size:[180,80]}]};
  const page=await openEditor(t,source);if(!page)return;const {run,snapshot,until}=page;
  await until(`document.getElementById('message').textContent.includes('正式路由已同步')`);
  assert.deepEqual(await snapshot(),source);
  assert.deepEqual(await run(`(()=>{${native}return ['a','b'].map(id=>{const c=g.model.getCell('node-'+id),p=c.geometry;return [p.x,p.y,p.width,p.height]})})()`),[[360,184,120,60],[600,320,180,80]]);
  assert.deepEqual(await run(`(()=>{const group=document.querySelector('#diagram [data-node-id="a"]'),r=group.querySelector('rect');return ['x','y','width','height'].map(k=>Number(r.getAttribute(k)))})()`),[360,184,120,60]);
  await run(`(()=>{${native}const c=g.model.getCell('node-a'),p=c.geometry.clone();p.x+=20;g.model.setGeometry(c,p);})()`);
  const moved=await snapshot();assert.deepEqual(moved.components[0].pos,[380,184]);assert.deepEqual(moved.components[1],source.components[1]);assert.equal(Object.hasOwn(moved,'connections'),false);await page.screenshot('grid-editor-dark');await run(`document.getElementById('theme-toggle').click()`);await page.screenshot('grid-editor-light');
});

test('schema drafts survive switches, failed apply, formatting and request failure',{timeout:120000},async t=>{
  const source=JSON.parse(fs.readFileSync(new URL('../examples/agent-tool-call.workflow.json',import.meta.url),'utf8'));source.meta.output='diagram.html';
  const page=await openEditor(t,source,true);if(!page)return;const {run,input,base}=page;
  const draft='{ "unfinished":';
  await run(`document.querySelector('[data-mode="json"]').click();document.getElementById('jsonbox').value=${JSON.stringify(draft)};document.getElementById('jsonbox').dispatchEvent(new Event('input'));document.querySelector('[data-mode="form"]').click();document.querySelector('[data-mode="json"]').click();`);
  assert.equal(await run(`document.getElementById('jsonbox').value`),draft);await page.screenshot('schema-unapplied-draft');
  await run(`document.getElementById('apply').click();document.getElementById('format').click()`);
  assert.equal(await run(`document.getElementById('jsonbox').value`),draft);
  assert.equal(await run(`document.getElementById('save').disabled&&document.getElementById('preview').disabled&&[...document.querySelectorAll('#fields input,#fields textarea')].every(x=>x.disabled)`),true);
  assert.equal(await run(`(()=>{const e=new Event('beforeunload',{cancelable:true});dispatchEvent(e);return e.defaultPrevented})()`),true);
  assert.equal(await run(`(async()=>{let blob;const old=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;URL.createObjectURL=b=>{blob=b;return old(b)};HTMLAnchorElement.prototype.click=()=>{};try{document.getElementById('download').click()}finally{URL.createObjectURL=old;HTMLAnchorElement.prototype.click=click}return blob.text()})()`),draft+'\n');
  await run(`document.getElementById('discard').click()`);assert.deepEqual(await page.snapshot(),source);
  const valid=structuredClone(source);valid.meta.title='Applied draft';
  await run(`document.getElementById('jsonbox').value=${JSON.stringify(JSON.stringify(valid))};document.getElementById('jsonbox').dispatchEvent(new Event('input'));document.getElementById('format').click();document.getElementById('apply').click()`);
  assert.deepEqual(await page.snapshot(),valid);assert.equal(await run(`document.getElementById('save').disabled`),false);
  fs.writeFileSync(input,'broken');await run(`document.getElementById('reload').click()`);
  await new Promise(r=>setTimeout(r,150));assert.deepEqual(await page.snapshot(),valid);
  fs.writeFileSync(input,JSON.stringify(source));await run(`document.getElementById('reload').click()`);
  await page.until(`document.getElementById('jsonbox').value.includes(${JSON.stringify(source.meta.title)})`);assert.deepEqual(await page.snapshot(),source);
});
