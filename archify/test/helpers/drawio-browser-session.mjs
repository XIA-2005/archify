import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ChromeVisualBrowser,findChrome} from '../../bin/visual-check.mjs';

export async function drawioSession(t,candidate) {
  const chrome=findChrome();if(!chrome){t.skip('Chrome required');return null;}
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'archify-drawio-editing-'));
  candidate=structuredClone(candidate);candidate.meta.output='diagram.html';
  fs.writeFileSync(path.join(dir,'candidate.json'),JSON.stringify(candidate));
  const editorRoot=process.env.ARCHIFY_EDITOR_ROOT||fileURLToPath(new URL('../../editor/',import.meta.url));
  const server=spawn(process.execPath,[path.join(editorRoot,'serve.mjs'),'candidate.json'],{
    cwd:dir,stdio:['ignore','pipe','pipe'],windowsHide:true});
  let stdout='',stderr='';server.stdout.on('data',d=>stdout+=d);server.stderr.on('data',d=>stderr+=d);
  const browser=new ChromeVisualBrowser(chrome);
  t.after(async()=>{await browser.close();server.kill();});
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  async function until(fn){const end=Date.now()+25000;while(Date.now()<end){if(await fn())return;await sleep(75);}throw Error('Timeout: '+stderr);}
  await until(()=>/http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{40}\//.test(stdout));
  const base=stdout.match(/http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{40}\//)[0];
  const sid=await browser.sessionPromise;
  const call=(method,params={})=>browser.cdp.send(method,params,sid);
  async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;}
  async function native(expression){return evaluate(`(()=>{const f=document.getElementById('drawio-canvas'),w=f.contentWindow,g=w.archifyDrawio.graph;return (${expression});})()`);}
  async function snapshot(){return JSON.parse(await evaluate(`(async()=>{let blob;const old=URL.createObjectURL;URL.createObjectURL=b=>{blob=b;return old(b)};try{document.getElementById('export').click()}finally{URL.createObjectURL=old}if(!blob)throw Error(document.getElementById('message').textContent);return blob.text()})()`));}
  async function click(x,y,count=1){await call('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
    await call('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:count});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:count});}
  async function screenshot(name){const evidence=process.env.ARCHIFY_EDITING_EVIDENCE;if(!evidence)return;
    fs.mkdirSync(evidence,{recursive:true});const r=await call('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.join(evidence,name+'.png'),Buffer.from(r.data,'base64'));}
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:base});
  try {await until(()=>evaluate(`document.getElementById('message')?.textContent.includes('正式路由已同步')`));}
  catch(error){throw Error(error.message+'; page: '+await evaluate(`document.getElementById('message')?.textContent`));}
  await until(()=>native(`!!g.model.getCell('node-'+${JSON.stringify(candidate.components[0].id)})`));
  return {candidate,dir,base,browser,call,evaluate,native,snapshot,click,screenshot,until,sleep};
}
