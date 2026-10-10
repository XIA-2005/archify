import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
const dir=path.resolve(process.argv[3]||'.archify/editor-viewport-evidence');fs.mkdirSync(dir,{recursive:true});
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'archify-editor-viewport-'));
const original=fs.readFileSync(path.resolve(process.argv[2]),'utf8');const source=JSON.parse(original);source.meta.output='diagram.html';
const candidate=path.join(tmp,'candidate.json');fs.writeFileSync(candidate,JSON.stringify(source));const frozen=fs.readFileSync(candidate,'utf8');
const server=spawn(process.execPath,[fileURLToPath(new URL('./serve.mjs',import.meta.url)),'candidate.json'],{cwd:tmp,stdio:['ignore','pipe','pipe'],windowsHide:true});let stdout='';server.stdout.on('data',d=>stdout+=d);
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'archify-layout-chrome-'));
const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--disable-extensions','--disable-gpu','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,seq=0;const pending=new Map();
async function wait(fn){for(let i=0;i<200;i++){try{const v=await fn();if(v)return v}catch{}await sleep(100)}throw Error('timeout')}
async function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));})}
async function ev(expression){const a=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(a.error||a.result.exceptionDetails)throw Error(JSON.stringify(a));return a.result.result.value}
try{
 const port=await wait(()=>fs.existsSync(path.join(profile,'DevToolsActivePort'))&&Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]));
 const tab=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(await wait(()=>stdout.match(/http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{40}\//)?.[0]))}`,{method:'PUT'})).json();
 ws=new WebSocket(tab.webSocketDebuggerUrl);ws.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.id&&pending.has(d.id)){pending.get(d.id).resolve(d);pending.delete(d.id)}});await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 const phase='after';const results=[];
 for(const [width,height] of [[1440,900],[1280,720],[2504,1588],[768,900]]){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await wait(()=>ev(`document.querySelectorAll('[data-rendered-route]').length===${source.connections.length}`));await sleep(250);
  await ev(`document.getElementById('fit').click()`);await sleep(150);
  const metrics=await ev(`(()=>{const stage=document.querySelector('.stage').getBoundingClientRect(),node=document.querySelector('[data-node-id]').getBoundingClientRect();return {stage:{x:stage.x,y:stage.y,width:stage.width,height:stage.height},nodeWidth:node.width,overflow:document.documentElement.scrollWidth>innerWidth,viewBox:document.getElementById('diagram').getAttribute('viewBox'),routes:[...document.querySelectorAll('[data-rendered-route]')].map(p=>p.getAttribute('d'))}})()`);
  assert.equal(metrics.overflow,false,'No horizontal document overflow');
  assert.ok(metrics.stage.height>=height*.6,'Canvas must retain at least 60% of viewport height');
  assert.ok(metrics.stage.width>=width*.7,'Canvas must retain at least 70% of viewport width');
  const inside=await ev(`(()=>{const stage=document.querySelector('.stage').getBoundingClientRect();return [...document.querySelectorAll('[data-node-id],[data-boundary-frame],[data-legend]')].every(el=>{const r=el.getBoundingClientRect();return r.left>=stage.left-2&&r.right<=stage.right+2&&r.top>=stage.top-2&&r.bottom<=stage.bottom+2})})()`);
  assert.ok(inside,'Fit must contain all nodes, boundaries and legend');
  const cap=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,`${phase}-${width}x${height}.png`),Buffer.from(cap.result.data,'base64'));results.push({width,height,...metrics});
 }
 if(phase==='after'){
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await sleep(200); await ev(`if(document.body.classList.contains('inspector-hidden'))document.getElementById('inspector-toggle').click()`);
  await ev(`document.getElementById('canvas-focus').click()`);await sleep(200);
  const focus=await ev(`(()=>{const r=document.querySelector('.stage').getBoundingClientRect();return {width:r.width,height:r.height,sidebarVisible:getComputedStyle(document.querySelector('aside')).display!=='none'}})()`);
  const cap=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,'after-focus.png'),Buffer.from(cap.result.data,'base64'));
  await ev(`document.getElementById('canvas-focus').click();document.getElementById('inspector-toggle').click()`);await sleep(150);
  assert.ok(focus.height>=900*.85 && focus.width>=1440*.95 && !focus.sidebarVisible,'Focus should maximize usable canvas');
  const hidden=await ev(`getComputedStyle(document.querySelector('aside')).display==='none'`);
  await ev(`document.getElementById('inspector-toggle').click();document.querySelector('.tool-options').open=true`);await sleep(150);
  const tools=await ev(`['layout-preview','line-scale','snap-grid'].every(id=>document.getElementById(id).getBoundingClientRect().height>0)`);
  assert.ok(hidden&&tools,'Inspector toggle and advanced controls remain usable');
  const unchanged=await ev(`JSON.stringify([...document.querySelectorAll('[data-rendered-route]')].map(p=>p.getAttribute('d')))`);
  assert.equal(unchanged,JSON.stringify(results[0].routes),'Layout-only operations preserve canonical route geometry');
  assert.equal(fs.readFileSync(candidate,'utf8'),frozen,'Viewport controls must not save the candidate');
  results.push({focus,hidden,tools});
 }
 fs.writeFileSync(path.join(dir,`${phase}-metrics.json`),JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(({routes,...r})=>r),null,2));
}finally{ws?.close();browser.kill();server.kill();}
