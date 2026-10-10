#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
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
  ws=new WebSocket(tab.webSocketDebuggerUrl);ws.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.id&&pending.has(d.id)){pending.get(d.id).resolve(d);pending.delete(d.id)}});
  await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await waitFor(()=>routeReady(source.connections.length));
  const title='[data-boundary-index="0"]';
  const initial=await evaluate(`[Number(document.querySelector('${title}').getAttribute('x')),Number(document.querySelector('${title}').getAttribute('y'))]`);
  const frame=await evaluate(`document.querySelector('[data-boundary-frame="0"]').outerHTML`);
  const positions=await evaluate(`[...document.querySelectorAll('[data-node-id]')].map(n=>n.querySelector('rect').getAttribute('x')).join(',')`);
  await mouseOn(title,60,0);await waitFor(()=>routeReady(source.connections.length));
  const dragged=await evaluate(`Number(document.querySelector('${title}').getAttribute('x'))`);
  assert.ok(dragged>initial[0]+30,'Dragging moves only title');
  assert.equal(await evaluate(`document.querySelector('[data-boundary-frame="0"]').outerHTML`),frame);
  assert.equal(await evaluate(`[...document.querySelectorAll('[data-node-id]')].map(n=>n.querySelector('rect').getAttribute('x')).join(',')`),positions);
  await evaluate(`document.getElementById('undo').click()`);await waitFor(()=>routeReady(source.connections.length));
  assert.equal(await evaluate(`Number(document.querySelector('${title}').getAttribute('x'))`),initial[0]);
  await evaluate(`document.getElementById('redo').click()`);await waitFor(()=>routeReady(source.connections.length));
  assert.equal(await evaluate(`Number(document.querySelector('${title}').getAttribute('x'))`),dragged);
  await mouseOn(title);
  await evaluate(`(()=>{const l=[...document.querySelectorAll('aside label')].find(l=>l.textContent.includes('标题水平偏移'));const i=l.querySelector('input');i.value='100';i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor(()=>routeReady(source.connections.length));
  assert.equal(await evaluate(`Number(document.querySelector('${title}').getAttribute('x'))`),initial[0]+100);
  const evidence=path.resolve(process.argv[3]||'.archify/boundary-title-evidence');fs.mkdirSync(evidence,{recursive:true});
  const capture=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(evidence,'moved-title-editor.png'),Buffer.from(capture.result.data,'base64'));
  await evaluate(`document.getElementById('save').click()`);
  await waitFor(()=>JSON.parse(fs.readFileSync(path.join(temp,'candidate.json'),'utf8')).boundaries[0].labelOffset?.[0]===100,30000);
  await waitFor(()=>fs.existsSync(path.join(temp,'diagram.html')),30000);
  const visual=spawnSync(process.execPath,[fileURLToPath(new URL('../bin/archify.mjs',import.meta.url)),'visual-check',path.join(temp,'diagram.html'),'--out-dir',path.join(evidence,'canonical'),'--summary','--require-provenance'],{cwd:temp,encoding:'utf8',windowsHide:true,timeout:30000});
  assert.equal(visual.status,0,visual.stderr||visual.stdout);
  fs.writeFileSync(path.join(evidence,'visual-summary.json'),visual.stdout);
  const saved=fs.readFileSync(path.join(temp,'diagram.html'),'utf8');
  assert.ok(saved.includes('x="'+(initial[0]+100)+'"'),'Canonical HTML persists title x');
  await waitFor(()=>evaluate(`!document.getElementById('save').disabled`),30000);
  await mouseOn(title);await evaluate(`document.getElementById('boundary-label-reset').click()`);await waitFor(()=>routeReady(source.connections.length));
  assert.equal(await evaluate(`Number(document.querySelector('${title}').getAttribute('x'))`),initial[0]);
  console.log('PASS: boundary title drag, frame/node invariance, offset fields, undo/redo, canonical save and reset');
}finally{ws?.close();browser.kill();server.kill();}
