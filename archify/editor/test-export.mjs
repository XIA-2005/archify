import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const artifact=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'archify-export-'));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--disable-extensions','--disable-gpu','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn){for(let i=0;i<300;i++){const result=await fn();if(result)return result;await sleep(100);}throw Error('Browser timeout');}
let ws,seq=0;const pending=new Map();
async function call(method,params={}){const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},60000);pending.set(id,result=>{clearTimeout(timer);resolve(result);});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.error||result.result.exceptionDetails)throw Error(JSON.stringify(result));return result.result.result.value;}
try {
  const port=await wait(()=>fs.existsSync(path.join(profile,'DevToolsActivePort'))?Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]):false);
  const tab=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(pathToFileURL(artifact).href)}`,{method:'PUT'})).json();
  ws=new WebSocket(tab.webSocketDebuggerUrl);ws.onmessage=e=>{const result=JSON.parse(e.data);if(pending.has(result.id)){pending.get(result.id)(result);pending.delete(result.id);}};
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  await wait(()=>evaluate(`Boolean(window.Archify?.motion?.recordWebm)&&document.fonts.status==='loaded'`));
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  const recorded=await evaluate(`(async()=>{const blob=await Archify.motion.recordWebm();window.verifiedWebm=blob;const bytes=new Uint8Array(await blob.arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=8192)data+=String.fromCharCode(...bytes.subarray(i,i+8192));return {bytes:bytes.length,data:btoa(data)};})()`);
  assert.ok(recorded.bytes>1000);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,Buffer.from(recorded.data,'base64'));
  const decoded=await evaluate(`(async()=>{const video=document.createElement('video');video.muted=true;video.src=URL.createObjectURL(window.verifiedWebm);await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error('WebM decode error'));});await video.play();await new Promise(r=>setTimeout(r,400));const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;const ctx=canvas.getContext('2d');ctx.drawImage(video,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,colors=new Set();for(let i=0;i<pixels.length;i+=128)colors.add(pixels.slice(i,i+3).join(','));const result={width:canvas.width,height:canvas.height,time:video.currentTime,colors:colors.size};video.pause();URL.revokeObjectURL(video.src);return result;})()`);
  assert.ok(decoded.width>0&&decoded.height>0&&decoded.time>0&&decoded.colors>10);
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(300);
  const mobile=await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})`);assert.ok(mobile.scrollWidth<=mobile.width+1);
  const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(output+'.mobile.png',Buffer.from(shot.result.data,'base64'));
  fs.writeFileSync(output+'.test.json',JSON.stringify({passed:true,artifact,bytes:recorded.bytes,decoded,mobile},null,2));
  console.log(JSON.stringify({passed:true,output,bytes:recorded.bytes,decoded,mobile}));
} finally {ws?.close();chrome.kill();await sleep(1000);fs.rmSync(profile,{recursive:true,force:true,maxRetries:12,retryDelay:250});}
