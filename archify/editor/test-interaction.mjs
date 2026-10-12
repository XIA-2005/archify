#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {extractArchifyRoutes} from './route-preview.mjs';
const original=process.argv[2] || path.resolve('examples/sample.architecture.json');
const chrome=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
if(!chrome)throw Error('Chrome/Edge required for UI test');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'archify-editor-ui-'));
const source=JSON.parse(fs.readFileSync(original,'utf8'));
source.meta.output='diagram.html';
fs.writeFileSync(path.join(temp,'candidate.json'),JSON.stringify(source,null,2));
const server=spawn(process.execPath,[fileURLToPath(new URL('./serve.mjs',import.meta.url)),'candidate.json'],{cwd:temp,stdio:['ignore','pipe','pipe'],windowsHide:true});
let stdout='',stderr='';server.stdout.on('data',d=>stdout+=d);server.stderr.on('data',d=>stderr+=d);
const profile=path.join(temp,'chrome-profile');
const browser=spawn(chrome,['--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-gpu','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn,ms=15000){const deadline=Date.now()+ms;while(Date.now()<deadline){try{const v=await fn();if(v)return v;}catch{}await sleep(100);}throw Error('Timeout waiting for process: '+stdout+' '+stderr);}
let ws,seq=0;const pending=new Map();
async function call(method,params={}){const id=++seq;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error('CDP timeout: '+method))}},12000);});}
async function evaluate(expr){const a=await call('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(a.error||a.result.exceptionDetails)throw Error('JS eval error '+JSON.stringify(a));return a.result.result.value;}
async function mouseOn(selector,dx=0,dy=0,target=null){
  const at=await evaluate('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');'
    +'if(!el)return null;el.scrollIntoView({block:"center",inline:"center"});'
    +'const r=el.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()');
  assert.ok(at,'Missing browser handle: '+selector);
  const end=target||[at[0]+dx,at[1]+dy];
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:at[0],y:at[1]});
  await call('Input.dispatchMouseEvent',{type:'mousePressed',x:at[0],y:at[1],button:'left',clickCount:1});
  if(dx||dy||target)await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:end[0],y:end[1],button:'left',buttons:1});
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:end[0],y:end[1],button:'left',clickCount:1});
}
const routeReady=async count=>await evaluate(
  "document.querySelectorAll('[data-rendered-route]:not([opacity=\"0.52\"])').length")===count;
const routeSettled=async()=>await routeReady(source.connections.length)
  || await evaluate(`document.getElementById('message').classList.contains('error')`);
const fieldValue=async name=>await evaluate('(()=>{const l=[...document.querySelectorAll(\'aside label\')].find(x=>x.textContent.includes('
  +JSON.stringify(name)+'));return l?.querySelector(\'input,textarea,select\')?.value??null})()');

try{
  const base=await waitFor(()=>stdout.match(/http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{40}\//)?.[0]);
  const port=await waitFor(()=>fs.existsSync(path.join(profile,'DevToolsActivePort'))?Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0]):false);
  const tab=await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(base)}`,{method:'PUT'})).json();
  ws=new WebSocket(tab.webSocketDebuggerUrl);
  ws.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.id&&pending.has(d.id)){const v=pending.get(d.id);pending.delete(d.id);v.resolve(d);}});
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
  // Browser regression exports inspect Blob content; never download into the user's profile.
  await call('Browser.setDownloadBehavior',{behavior:'deny'});
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await waitFor(async()=>await evaluate(`document.querySelectorAll('[data-node-id]').length`)===source.components.length);
  await waitFor(async()=>await evaluate(`document.querySelectorAll('[data-rendered-route]').length`)===source.connections.length);
  console.log('PASS: loaded official routes');
  const themeDraft=async()=>await evaluate(`(async()=>{let blob;const create=URL.createObjectURL;URL.createObjectURL=b=>{blob=b;return create(b)};try{document.getElementById('export').click()}finally{URL.createObjectURL=create}return await blob.text()})()`);
  const beforeTheme=await themeDraft();
  const beforeRoute=await evaluate(`document.querySelector('[data-rendered-route]').getAttribute('d')`);
  const beforeUndo=await evaluate(`document.getElementById('undo').disabled`);
  await mouseOn('#theme-toggle');
  assert.equal(await evaluate(`document.documentElement.dataset.theme`),'light');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.stage')).backgroundColor`),'rgb(248, 251, 255)');
  assert.equal(await evaluate(`document.querySelector('[data-node-id] rect').getAttribute('fill')`),'#eaf3fd');
  assert.equal(await themeDraft(),beforeTheme);
  assert.equal(await evaluate(`document.querySelector('[data-rendered-route]').getAttribute('d')`),beforeRoute);
  assert.equal(await evaluate(`document.getElementById('undo').disabled`),beforeUndo);
  const evidence=process.env.ARCHIFY_EDITOR_THEME_EVIDENCE;
  if(evidence){fs.mkdirSync(evidence,{recursive:true});await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(evidence,'editor-light.png'),Buffer.from(shot.result.data,'base64'));}
  await call('Page.reload');
  await waitFor(async()=>await evaluate(`document.querySelectorAll('[data-node-id]').length`)===source.components.length);
  await waitFor(()=>routeReady(source.connections.length));
  assert.equal(await evaluate(`document.documentElement.dataset.theme`),'light');
  await mouseOn('#theme-toggle');
  assert.equal(await evaluate(`document.documentElement.dataset.theme`),'dark');
  assert.equal(await themeDraft(),beforeTheme);
  if(evidence){const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(evidence,'editor-dark.png'),Buffer.from(shot.result.data,'base64'));}
  console.log('PASS: native light/dark toggle recolors canvas, persists on reload, and preserves JSON, routes and undo');

  if(process.argv.includes('--hover-only')){
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await evaluate(`document.querySelector('.batch-fonts').open=true`);
    const draft=await themeDraft();
    const beforeUndo=await evaluate(`document.getElementById('undo').disabled`);
    await mouseOn('#batch-font-trigger');
    const categories=['node-label','node-sublabel','node-tag','edge-label','boundary-label','legend','card-title','card-items'];
    for(const category of categories){
      const selector='[data-font-category="'+category+'"]';
      const at=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
      await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:at[0],y:at[1]});
      const result=await evaluate(`(()=>{const category=${JSON.stringify(category)};const nodes=[...document.querySelectorAll('[data-node-id]')];return {nodes:nodes.filter(n=>n.querySelector('rect.font-preview')).map(n=>n.dataset.nodeId),texts:[...document.querySelectorAll('#diagram text.font-preview')].map(n=>n.dataset.textField||null),cards:document.querySelectorAll('#cards button.font-preview').length,highlights:document.querySelectorAll('.font-preview').length,chosen:document.getElementById('batch-font-type').value}})()`);
      assert.equal(result.chosen,'node-label','Hover must not select category');
      if(category.startsWith('node-')){const key=category.slice(5);assert.deepEqual(result.nodes,source.components.filter(n=>n[key]).map(n=>n.id));assert.ok(result.texts.every(k=>k===key));}
      else {assert.equal(result.nodes.length,0);if(category.startsWith('card-'))assert.equal(result.cards,(source.cards||[]).length);else if(category==='edge-label')assert.equal(result.texts.length,source.connections.filter(e=>e.label).length);else if(category==='boundary-label')assert.equal(result.texts.length,(source.boundaries||[]).filter(b=>b.label).length);}
      assert.equal(await themeDraft(),draft);
      console.log('PASS: hover '+category+' targets corresponding elements without editing JSON');
    }
    const at=await evaluate(`(()=>{const r=document.querySelector('[data-font-category="node-tag"]').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:at[0],y:at[1]});
    if(process.env.ARCHIFY_EDITOR_THEME_EVIDENCE){const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.ARCHIFY_EDITOR_THEME_EVIDENCE,'font-hover-dark.png'),Buffer.from(shot.result.data,'base64'));}
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    assert.equal(await evaluate(`document.querySelectorAll('.font-preview').length`),0);
    assert.equal(await evaluate(`document.getElementById('batch-font-options').hidden`),true);
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await mouseOn('#theme-toggle');await mouseOn('#batch-font-trigger');
    await sleep(150);
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
    assert.equal(await evaluate(`document.activeElement.dataset.fontCategory`),'node-sublabel');
    assert.equal(await evaluate(`document.querySelectorAll('text.font-preview[data-text-field="sublabel"]').length`),source.components.filter(n=>n.sublabel).length);
    if(process.env.ARCHIFY_EDITOR_THEME_EVIDENCE){const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.ARCHIFY_EDITOR_THEME_EVIDENCE,'font-hover-light.png'),Buffer.from(shot.result.data,'base64'));}
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    assert.equal(await evaluate(`document.getElementById('batch-font-type').value`),'node-sublabel');
    assert.equal(await evaluate(`document.querySelectorAll('.font-preview').length`),0);
    assert.equal(await evaluate(`document.getElementById('undo').disabled`),beforeUndo);
    console.log('PASS: Escape clears hover; light-mode keyboard preview/select preserves undo');
  }
  const labeledIndex=source.connections.findIndex(e=>e.label);
  if(labeledIndex>=0&&process.argv.includes('--labels-only')&&!process.argv.includes('--theme-only')&&!process.argv.includes('--hover-only')){
    const originalEdge=source.connections[labeledIndex];
    const edgeId=originalEdge.id||'edge-'+labeledIndex;
    const labelSelector='text[data-edge-label-edit='+JSON.stringify(edgeId)+']';
    const originalFont=await evaluate(`Number(document.querySelector(${JSON.stringify(labelSelector)}).getAttribute('font-size'))`);
    const editedFont=originalFont>6?Math.max(6,Math.floor(originalFont*2)/2-0.5):6.5;
    await mouseOn(labelSelector);
    assert.equal(await evaluate(`document.activeElement.hasAttribute('data-edge-label-input')`),true);
    await evaluate(`(()=>{const input=document.querySelector('[data-edge-label-input]');input.value='Data';input.dispatchEvent(new Event('change',{bubbles:true}));const size=document.querySelector('[data-font-control="连线文字字号"]');size.value=${JSON.stringify(String(editedFont))};size.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await waitFor(async()=>await routeReady(source.connections.length)&&await evaluate(`document.querySelector(${JSON.stringify(labelSelector)})?.textContent==='Data'&&Number(document.querySelector(${JSON.stringify(labelSelector)}).getAttribute('font-size'))===${editedFont}`),20000);
    const draft=await evaluate(`(async()=>{const create=URL.createObjectURL;let blob;URL.createObjectURL=value=>{blob=value;return create(value);};try{document.getElementById('export').click();}finally{URL.createObjectURL=create;}return JSON.parse(await blob.text());})()`);
    assert.equal(draft.connections[labeledIndex].label,'Data');
    assert.equal(draft.connections[labeledIndex].font_sizes.label,editedFont);
    assert.equal(draft.connections[labeledIndex].from,originalEdge.from);
    assert.equal(draft.connections[labeledIndex].to,originalEdge.to);
    await evaluate(`(()=>{const color=document.querySelector('[data-edge-label-color-picker]');color.value='#cc2244';color.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await waitFor(async()=>await routeReady(source.connections.length)&&await evaluate(`document.querySelector(${JSON.stringify(labelSelector)})?.getAttribute('fill')==='#cc2244'`),20000);
    const coloredDraft=await evaluate(`(async()=>{const create=URL.createObjectURL;let blob;URL.createObjectURL=value=>{blob=value;return create(value);};try{document.getElementById('export').click();}finally{URL.createObjectURL=create;}return JSON.parse(await blob.text());})()`);
    assert.equal(coloredDraft.connections[labeledIndex].labelColor,'#cc2244');
    assert.equal(coloredDraft.connections[labeledIndex].from,originalEdge.from);
    assert.equal(coloredDraft.connections[labeledIndex].to,originalEdge.to);
    assert.deepEqual(coloredDraft.connections[labeledIndex].via,originalEdge.via);
    const initialSave=await (await fetch(base+'api/spec')).json();
    const colorSave=await fetch(base+'api/save',{method:'POST',headers:{'content-type':'application/json','x-archify-editor':'1',origin:new URL(base).origin},body:JSON.stringify({candidate:coloredDraft,expectedHash:initialSave.expectedHash})});
    const colorReceipt=await colorSave.json();
    assert.equal(colorSave.status,200,JSON.stringify(colorReceipt));
    assert.equal(JSON.parse(fs.readFileSync(path.join(temp,'candidate.json'),'utf8')).connections[labeledIndex].labelColor,'#cc2244');
    assert.ok(fs.readFileSync(path.join(temp,'diagram.html'),'utf8').includes('style="fill:#cc2244'));
    console.log('PASS: label color saved through validate/finalize into JSON and HTML');
    await evaluate(`document.getElementById('undo').click()`);
    await waitFor(async()=>await evaluate(`document.querySelector(${JSON.stringify(labelSelector)})?.getAttribute('fill')!=='#cc2244'`));
    await evaluate(`document.getElementById('redo').click()`);
    await waitFor(async()=>await evaluate(`document.querySelector(${JSON.stringify(labelSelector)})?.getAttribute('fill')==='#cc2244'`));
    await evaluate(`document.getElementById('undo').click()`);
    await evaluate(`document.getElementById('undo').click();document.getElementById('undo').click()`);
    await waitFor(async()=>await routeReady(source.connections.length)&&await evaluate(`document.querySelector(${JSON.stringify(labelSelector)})?.textContent===${JSON.stringify(originalEdge.label)}`));
    assert.equal(await evaluate(`Number(document.querySelector(${JSON.stringify(labelSelector)}).getAttribute('font-size'))`),originalFont);
    await evaluate(`document.getElementById('redo').click();document.getElementById('redo').click()`);
    await waitFor(async()=>await routeReady(source.connections.length)&&await evaluate(`Number(document.querySelector(${JSON.stringify(labelSelector)})?.getAttribute('font-size'))===${editedFont}`));
    await evaluate(`document.getElementById('undo').click();document.getElementById('undo').click()`);
    await waitFor(()=>routeReady(source.connections.length));
    await evaluate(`document.getElementById('inspector-toggle').click();document.querySelector(${JSON.stringify(labelSelector)}).focus()`);
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    assert.equal(await evaluate(`document.activeElement.hasAttribute('data-edge-label-input')&&!document.body.classList.contains('inspector-hidden')`),true);
    console.log('PASS: native label click/keyboard edits content and font size; draft export and undo/redo preserve endpoints');
  }
  if(!process.argv.includes('--labels-only')&&!process.argv.includes('--theme-only')&&!process.argv.includes('--hover-only')){
  const originalRouteD=await evaluate(`document.querySelector('[data-rendered-route]').getAttribute('d')`);
  const initialTextSize=await evaluate(`Number(document.querySelector('[data-node-id] text').getAttribute('font-size'))`);
  const initialLineWidth=await evaluate(`Number(document.querySelector('[data-rendered-route]').getAttribute('stroke-width'))`);
  await mouseOn('[data-node-id="'+source.components[0].id+'"]');
  await evaluate(`(()=>{const input=document.querySelector('[data-font-control="模块名称字号"]');input.value='10';
    input.dispatchEvent(new Event('change',{bubbles:true}));
    const line=document.getElementById('line-scale');line.value='1.3';
    line.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await waitFor(()=>routeReady(source.connections.length),20000);
  assert.equal(await evaluate(`document.getElementById('style-summary').textContent.includes('线宽 130%')`),true);
  assert.equal(await evaluate(`Number(document.querySelector('[data-node-id] text').getAttribute('font-size'))`),10);
  assert.ok(await evaluate(`Number(document.querySelector('[data-rendered-route]').getAttribute('stroke-width'))`) > initialLineWidth);
  await evaluate(`document.getElementById('undo').click();document.getElementById('undo').click()`);
  await waitFor(()=>routeReady(source.connections.length),20000);
  assert.equal(await evaluate(`document.getElementById('font-scale')`),null);
  assert.equal(await evaluate(`document.getElementById('line-scale').value`),'1');
  console.log('PASS: independent font size, line width, official preview and undo');
  await evaluate(`(()=>{const fetchOriginal=window.fetch.bind(window);window.__cameraRoutePosts=0;
    window.fetch=(...args)=>{if(String(args[0]).includes('api/routes') && args[1]?.method==='POST')
      window.__cameraRoutePosts++;return fetchOriginal(...args);};return true})()`);
  await evaluate(`(()=>{document.getElementById('big-mode').click();
    document.getElementById('zoom-in').click();document.getElementById('fit').click();
    const input=document.getElementById('node-search');input.value=${JSON.stringify(source.components[1].id)};
    input.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('find-next').click();
    return true})()`);
  assert.equal(await evaluate(`document.getElementById('minimap').hidden`),false);
  assert.ok(await evaluate(`document.querySelector('[data-node-id="${source.components[1].id}"]')!==null`));
  assert.equal(await evaluate(`document.querySelector('[data-rendered-route]').getAttribute('d')`),originalRouteD);
  await sleep(350);
  assert.equal(await evaluate(`window.__cameraRoutePosts`),0,
    'Camera navigation must not request official routes again');
  await evaluate(`(()=>{document.getElementById('big-mode').click();
    document.getElementById('node-search').value='';
    document.getElementById('node-search').dispatchEvent(new Event('input',{bubbles:true}));
    document.getElementById('fit').click();return true})()`);
  console.log('PASS: minimap/search/zoom/fit preserve canonical SVG d without new route POST');
  const nodePositions=()=>evaluate(`JSON.stringify([...document.querySelectorAll('[data-node-id] rect:first-child')]
    .map(r=>[r.getAttribute('x'),r.getAttribute('y')]))`);
  const originalPositions=await nodePositions();
  await evaluate(`(()=>{const direction=document.getElementById('layout-direction');direction.value='TB';
    direction.dispatchEvent(new Event('change',{bubbles:true}));
    document.getElementById('layout-layer-gap').value='80';
    document.getElementById('layout-node-gap').value='40';
    document.getElementById('layout-preview').click();return true})()`);
  assert.equal(await evaluate(`document.querySelectorAll('[data-layout-preview] rect').length`),source.components.length);
  assert.equal(await nodePositions(),originalPositions,'Preview must not move actual nodes');
  assert.equal(await evaluate(`document.getElementById('save').disabled`),true);
  await evaluate(`document.getElementById('layout-cancel').click()`);
  assert.equal(await evaluate(`document.querySelectorAll('[data-layout-preview]').length`),0);
  assert.equal(await nodePositions(),originalPositions);
  console.log('PASS: configurable ghost preview and cancel leave candidate untouched');
  await evaluate(`document.getElementById('layout-preview').click()`);
  await evaluate(`document.getElementById('layout-apply').click()`);
  const changedPositions=await nodePositions();
  assert.notEqual(changedPositions,originalPositions);
  await waitFor(routeSettled,20000);
  assert.equal(await evaluate(`document.querySelectorAll('[data-rendered-route]').length`),source.connections.length);
  await evaluate(`document.getElementById('undo').click()`);
  assert.equal(await nodePositions(),originalPositions);
  await waitFor(()=>routeReady(source.connections.length),20000);
  await evaluate(`document.getElementById('redo').click()`);
  assert.equal(await nodePositions(),changedPositions);
  await waitFor(routeSettled,20000);
  await evaluate(`document.getElementById('undo').click()`);
  assert.equal(await nodePositions(),originalPositions);
  await waitFor(()=>routeReady(source.connections.length),20000);
  await evaluate(`document.getElementById('fit').click()`);
  console.log('PASS: apply/redo recompute routes or flag invalid preserved manual geometry; undo restores verified routes');
  // Property edits avoid a synthetic pointer capture and exercise the same DOM callback used by the inspector.
  assert.equal(await evaluate(`(()=>{let n=document.querySelector('[data-node-id]');n.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,ctrlKey:true}));return document.querySelector('button[data-align="left"]').disabled})()`),true);
  const posResult=await evaluate(`(()=>{let label=[...document.querySelectorAll('aside label')].find(x=>x.textContent.includes('位置 X'));let input=label.querySelector('input');input.value='-200';input.dispatchEvent(new Event('change',{bubbles:true}));return document.querySelectorAll('[data-node-id]').length})()`);
  assert.equal(posResult,source.components.length);
  await waitFor(async()=>await evaluate(`document.querySelectorAll('[data-rendered-route]:not([opacity="0.52"])').length`)===source.connections.length,20000);
  const saved=await evaluate(`(async()=>{document.getElementById('save').click();for(let i=0;i<150;i++){if(document.getElementById('message').classList.contains('ok')&&document.getElementById('message').textContent.includes('JSON'))return true;if(document.getElementById('message').classList.contains('error'))return document.getElementById('message').textContent;await new Promise(r=>setTimeout(r,100));}return 'timeout';})()`);
  assert.equal(saved,true,'save failed: '+saved);
  const modified=JSON.parse(fs.readFileSync(path.join(temp,'candidate.json'),'utf8'));
  assert.ok(modified.components.every(n=>n.pos[0]>=0));
  assert.ok(!modified.meta.viewBox || modified.meta.viewBox[0]>=320);
  console.log('PASS: negative node position corrected; official edges restored and JSON validated/saved');
  await evaluate(`document.getElementById('diagram').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);
  await evaluate(`(()=>{const a=document.querySelector('[data-node-id="${source.components[0].id}"]');a.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,ctrlKey:true}));const b=document.querySelector('[data-node-id="${source.components[1].id}"]');b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,ctrlKey:true}));return true})()`);
  const enabled=await evaluate(`!document.querySelector('button[data-align="left"]').disabled`);
  assert.ok(enabled);
  const alignResult=await evaluate(`(()=>{document.querySelector('button[data-align="left"]').click();const a=document.querySelector('[data-node-id="${source.components[0].id}"] rect').getAttribute('x');const b=document.querySelector('[data-node-id="${source.components[1].id}"] rect').getAttribute('x');return {a,b}})()`);
  assert.equal(alignResult.a,alignResult.b);
  console.log('PASS: Ctrl multi-selection and left alignment');
  await evaluate(`document.getElementById('undo').click()`);
  await waitFor(async()=>await evaluate(`document.querySelectorAll('[data-rendered-route]:not([opacity="0.52"])').length`)===source.connections.length,12000);
  const manualId=source.connections.find(e=>e.id==='c_start_pack')?.id || source.connections[0].id;
  await evaluate(`(()=>{const e=document.querySelector('[data-edge-id="${manualId}"]');e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));return true})()`);
  const controls=await evaluate(`(()=>({route:[...document.querySelectorAll('aside label')].some(x=>x.textContent.includes('路由模式')),via:[...document.querySelectorAll('aside label')].some(x=>x.textContent.includes('折点 via'))}))()`);
  assert.ok(controls.route&&controls.via);
  const via='1146,332\n1146,568';
  if(manualId==='c_start_pack'){
    await evaluate(`(()=>{let label=[...document.querySelectorAll('aside label')].find(x=>x.textContent.includes('折点 via'));let el=label.querySelector('textarea');el.value=${JSON.stringify(via)};el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
    await waitFor(async()=>await evaluate(`document.querySelectorAll('[data-bend]').length`)>=2,12000);
    console.log('PASS: hand-authored Archify waypoints and draggable handles');
  }
  // Milestone 2: all route edits start from verified official points and remain undoable.
  const selectEdge=async()=>evaluate('(()=>{const e=document.querySelector(\'[data-edge-id="'
    +manualId+'"]\');e.dispatchEvent(new PointerEvent(\'pointerdown\',{bubbles:true}));return true})()');
  await selectEdge();
  await evaluate('document.querySelector(\'[data-action="freeze-route"]\').click()');
  await waitFor(()=>routeReady(source.connections.length),20000);
  assert.equal(await fieldValue('路由模式'),'straight');
  await evaluate('document.getElementById(\'undo\').click()');
  await selectEdge();
  assert.equal(await fieldValue('路由模式'),'auto');
  await evaluate('document.getElementById(\'redo\').click()');
  await selectEdge();
  assert.equal(await fieldValue('路由模式'),'straight');
  console.log('PASS: freeze official route and undo/redo');
  await evaluate('document.querySelector(\'[data-action="insert-vertex"]\').click()');
  await waitFor(()=>routeReady(source.connections.length),20000);
  await selectEdge();
  const viaBeforeDrag=await fieldValue('折点 via');
  assert.equal(viaBeforeDrag.split('\n').length,4);
  assert.ok(await evaluate('document.querySelectorAll(\'[data-segment]\').length')>0);
  console.log('PASS: inserted orthogonal detour via and verified official preview');
  await mouseOn('[data-segment="2"]',0,9);
  await waitFor(()=>routeReady(source.connections.length),20000);
  await selectEdge();
  const viaAfterDrag=await fieldValue('折点 via');
  assert.notEqual(viaAfterDrag,viaBeforeDrag);
  await evaluate('document.getElementById(\'undo\').click()');
  await selectEdge();
  assert.equal(await fieldValue('折点 via'),viaBeforeDrag);
  await evaluate('document.getElementById(\'redo\').click()');
  await selectEdge();
  assert.equal(await fieldValue('折点 via'),viaAfterDrag);
  console.log('PASS: draggable orthogonal segment and atomic undo/redo');
  await mouseOn('[data-bend="1"]');
  assert.equal(await evaluate('document.querySelector(\'[data-action="delete-vertex"]\').disabled'),false);
  await evaluate('document.dispatchEvent(new KeyboardEvent(\'keydown\',{key:\'Delete\',bubbles:true}))');
  await waitFor(()=>routeReady(source.connections.length),20000);
  await selectEdge();
  assert.notEqual(await fieldValue('折点 via'),viaAfterDrag);
  await evaluate('document.getElementById(\'undo\').click()');
  await waitFor(()=>routeReady(source.connections.length),20000);
  await selectEdge();
  assert.equal(await fieldValue('折点 via'),viaAfterDrag);
  console.log('PASS: Delete selected vertex with orthogonal reconnection and undo');
  const sourceBox=await evaluate('(()=>{const r=document.querySelector(\'[data-node-id="'
    +source.connections[0].from+'"] rect\').getBoundingClientRect();return [r.x+r.width/2,r.y+2]})()');
  await mouseOn('[data-side="from"]',0,0,sourceBox);
  await selectEdge();
  assert.equal(await fieldValue('起点方向'),'top');
  await evaluate('document.getElementById(\'undo\').click()');
  await waitFor(()=>routeReady(source.connections.length),20000);
  await selectEdge();
  assert.equal(await fieldValue('起点方向'),'auto');
  console.log('PASS: draggable endpoint side handle and undo');
  await mouseOn('[data-label-handle]',8,12);
  await selectEdge();
  assert.ok((await fieldValue('标签位置 labelAt')).includes(','),await evaluate(`document.getElementById('message').textContent`));
  await evaluate('document.getElementById(\'undo\').click()');
  await waitFor(()=>routeReady(source.connections.length),20000);
  await selectEdge();
  assert.equal(await fieldValue('标签位置 labelAt'),'');
  console.log('PASS: draggable label handle and undo');
  await evaluate('document.getElementById(\'save\').click()');
  const manualSave=await waitFor(async()=>{
    const msg=await evaluate('document.getElementById(\'message\').textContent');
    if(msg.includes('JSON 已保存'))return true;
    if(msg.includes('未通过')||msg.includes('保存异常'))throw Error(msg);
    return false;
  },40000);
  assert.ok(manualSave);
  const finalCandidate=JSON.parse(fs.readFileSync(path.join(temp,'candidate.json'),'utf8'));
  assert.ok(finalCandidate.connections[0].via?.length>=2);
  const finalRoutes=extractArchifyRoutes(fs.readFileSync(path.join(temp,'diagram.html'),'utf8'),
    finalCandidate.connections.length);
  const uiD=await evaluate('document.querySelector(\'[data-rendered-route="'
    +manualId+'"]\').getAttribute(\'d\')');
  assert.equal(uiD,finalRoutes[0].d,'Editor SVG must match finalized Archify path');
  const officialResponse=await fetch(base+'api/routes',{method:'POST',
    headers:{'content-type':'application/json','x-archify-editor':'1',
      origin:new URL(base).origin},body:JSON.stringify(finalCandidate)});
  assert.equal(officialResponse.status,200);
  const officialPreview=await officialResponse.json();
  assert.deepEqual(officialPreview.edges,finalRoutes,
    'Manual route path, points and label geometry must all match final HTML');
  console.log('PASS: manual route save, official finalize, identical d/points/label geometry');
  await selectEdge();
  await evaluate('document.querySelector(\'[data-action="reset-route"]\').click()');
  await selectEdge();
  assert.equal(await fieldValue('折点 via'),'');
  await evaluate('document.getElementById(\'undo\').click()');
  console.log('PASS: reset to auto route is undoable');
  // Both gesture entry points must insert a non-collinear, editable detour.
  await waitFor(()=>routeReady(source.connections.length),20000);
  await selectEdge();
  await evaluate('document.querySelector(\'[data-action="reset-route"]\').click()');
  await waitFor(()=>routeReady(source.connections.length),20000);
  await selectEdge();
  const gestureTarget='[data-rendered-route="'+manualId+'"]';
  const gesture=kind=>evaluate('(()=>{const el=document.querySelector('
    +JSON.stringify(gestureTarget)+');const r=el.getBoundingClientRect();'
    +'el.dispatchEvent(new '+(kind==='alt'?'PointerEvent(\'pointerdown\','
      +' {bubbles:true,altKey:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2})'
      :'MouseEvent(\'dblclick\',{bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2})')
    +');return true})()');
  await gesture('alt');
  await waitFor(()=>routeReady(source.connections.length),20000);
  await selectEdge();
  assert.ok((await fieldValue('折点 via')).split('\n').length>=4);
  await evaluate('document.getElementById(\'undo\').click()');
  await waitFor(()=>routeReady(source.connections.length),20000);
  await selectEdge();
  await gesture('double');
  await waitFor(()=>routeReady(source.connections.length),20000);
  await selectEdge();
  assert.ok((await fieldValue('折点 via')).split('\n').length>=4);
  await evaluate('document.getElementById(\'undo\').click()');
  await evaluate('document.getElementById(\'undo\').click()');
  console.log('PASS: Alt-click and double-click insert orthogonal vertices; undo restores auto');
  // An invalid extreme placement may fail Archify composition checks; the editor
  // must retain the previous geometry as a clearly marked temporary guide.
  await evaluate(`(()=>{const n=document.querySelector('[data-node-id="${source.components[0].id}"]');n.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,ctrlKey:true}));return true})()`);
  await evaluate(`(()=>{let label=[...document.querySelectorAll('aside label')].find(x=>x.textContent.includes('位置 X'));let input=label.querySelector('input');input.value='3000';input.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await sleep(1800);
  const remaining=await evaluate(`document.querySelectorAll('[data-rendered-route]').length`);
  assert.equal(remaining,source.connections.length,'A failed new layout must not erase all old lines');
  console.log('PASS: far-away layout preserves all route guides while recomputing/validating');
  }
  console.log('ALL_UI_TESTS_PASS');
} finally {
  try{ws?.close()}catch{}
  browser.kill();server.kill();await sleep(1000);
  try{fs.rmSync(temp,{recursive:true,force:true,maxRetries:8,retryDelay:200});}catch{}
}
