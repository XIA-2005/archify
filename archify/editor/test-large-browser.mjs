#!/usr/bin/env node
// Browser-only large-canvas navigation test. Does not claim that synthetic
// 1000-node candidates can pass the Archify delivery/route quality gates.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const chrome=['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
if(!chrome)throw Error('Chrome/Edge required for browser test');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'archify-large-ui-'));
const source=JSON.parse(fs.readFileSync('examples/sample.architecture.json','utf8'));
source.components=Array.from({length:1000},(_,i)=>({
  id:`large-${i}`,type:'backend',label:`模块 ${i}`,sublabel:`节点 ${i} 测试`,
  pos:[120+(i%40)*260,120+Math.floor(i/40)*160],size:[180,80],
}));
source.connections=[];source.boundaries=[];source.cards=[];
source.meta.output='diagram.html';source.meta.viewBox=[11000,4500];
const input=path.join(temp,'candidate.json');
fs.writeFileSync(input,JSON.stringify(source));
const server=spawn(process.execPath,[fileURLToPath(new URL('./serve.mjs',import.meta.url)),'candidate.json'],
  {cwd:temp,stdio:['ignore','pipe','pipe'],windowsHide:true});
let stdout='',stderr='';
server.stdout.on('data',d=>stdout+=d);server.stderr.on('data',d=>stderr+=d);
const profile=path.join(temp,'chrome-profile');
const browser=spawn(chrome,['--headless=new','--no-first-run','--no-default-browser-check',
  '--disable-extensions','--disable-gpu','--remote-allow-origins=*',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],
{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(fn,ms=18000){
  const until=Date.now()+ms;
  while(Date.now()<until){try{const value=await fn();if(value)return value;}catch{}await sleep(120);}
  throw Error('Large browser timeout: '+stdout+' '+stderr);
}
let ws,seq=0;const pending=new Map();
async function call(method,params={}){
  const id=++seq;
  return new Promise((resolve,reject)=>{
    pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
    setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error('CDP timeout '+method));}},12000);
  });
}
async function evaluate(expression){
  const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.error||r.result.exceptionDetails)throw Error('Browser eval: '+JSON.stringify(r));
  return r.result.result.value;
}
try{
  const base=await waitFor(()=>stdout.match(/http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{40}\//)?.[0]);
  const port=await waitFor(()=>fs.existsSync(path.join(profile,'DevToolsActivePort'))
    ? Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0]):false);
  const tab=await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(base)}`,
    {method:'PUT'})).json();
  ws=new WebSocket(tab.webSocketDebuggerUrl);
  ws.addEventListener('message',event=>{
    const data=JSON.parse(event.data);
    if(data.id&&pending.has(data.id)){
      const job=pending.get(data.id);pending.delete(data.id);job.resolve(data);
    }
  });
  await new Promise((resolve,reject)=>{
    ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});
  });
  await waitFor(()=>evaluate(`document.querySelectorAll('[data-node-id]').length===1000`));
  assert.equal(await evaluate(`document.getElementById('big-mode').getAttribute('aria-pressed')`),'true');
  assert.equal(await evaluate(`document.getElementById('minimap').hidden`),false);
  assert.equal(await evaluate(`document.querySelectorAll('[data-node-id] text').length`),0);
  console.log('PASS: 1000 nodes start in automatic overview LOD and minimap mode');

  await evaluate(`(()=>{const input=document.getElementById('node-search');input.value='large-999';
    input.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('find-next').click();})()`);
  await waitFor(()=>evaluate(`document.querySelector('[data-node-id="large-999"]')!==null`));
  const visible=await evaluate(`document.querySelectorAll('[data-node-id]').length`);
  assert.ok(visible>0 && visible<60,`Expected viewport culling, got ${visible}`);
  assert.ok(await evaluate(`document.querySelector('[data-node-id="large-999"] text')!==null`));
  assert.ok((await evaluate(`document.getElementById('viewport-count').textContent`)).includes('/1000'));
  console.log('PASS: search focuses far-away node and renders only visible detail');

  const cameraBefore=await evaluate(`document.getElementById('diagram').getAttribute('viewBox')`);
  const canvas=await evaluate(`(()=>{const el=document.getElementById('minimap-canvas');
    el.scrollIntoView({block:'center',inline:'center'});const r=el.getBoundingClientRect();
    return [r.x+18,r.y+18]})()`);
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:canvas[0],y:canvas[1]});
  await call('Input.dispatchMouseEvent',{type:'mousePressed',x:canvas[0],y:canvas[1],button:'left',clickCount:1});
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:canvas[0],y:canvas[1],button:'left',clickCount:1});
  await waitFor(async()=>await evaluate(`document.getElementById('diagram').getAttribute('viewBox')`)!==cameraBefore);
  assert.equal(await evaluate(`document.getElementById('minimap').hidden`),false);
  console.log('PASS: minimap click pans the camera without changing candidate');

  await evaluate(`document.getElementById('fit').click()`);
  await waitFor(()=>evaluate(`document.querySelectorAll('[data-node-id]').length===1000`));
  await evaluate(`document.getElementById('big-mode').click()`);
  assert.equal(await evaluate(`document.getElementById('minimap').hidden`),true);
  assert.equal(await evaluate(`document.querySelectorAll('[data-node-id]').length`),1000);
  await evaluate(`document.getElementById('big-mode').click()`);
  assert.equal(await evaluate(`document.getElementById('minimap').hidden`),false);
  assert.deepEqual(JSON.parse(fs.readFileSync(input,'utf8')),source);
  console.log('PASS: fit, mode toggle and navigation do not write candidate JSON');
  console.log('ALL_LARGE_BROWSER_TESTS_PASS');
}finally{
  try{ws?.close();}catch{}
  browser.kill();server.kill();await sleep(1000);
  try{fs.rmSync(temp,{recursive:true,force:true,maxRetries:8,retryDelay:200});}catch{}
}
