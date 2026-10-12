import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {ChromeVisualBrowser,findChrome} from '../bin/visual-check.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'archify-label-color-'));
const input=path.join(scratch,'candidate.json'), output=path.join(scratch,'diagram.html');
const spec=JSON.parse(fs.readFileSync(process.argv[2]||path.join(root,'examples/web-app.architecture.json'),'utf8'));
const edge=spec.connections.find(e=>e.label);assert.ok(edge);
edge.labelColor='#cc2244';
const render=()=>execFileSync(process.execPath,[path.join(root,'renderers/architecture/render-architecture.mjs'),input,output],{stdio:'pipe'});
fs.writeFileSync(input,JSON.stringify(spec));render();
const browser=new ChromeVisualBrowser(findChrome());
try {
  const session=await browser.sessionPromise;
  const send=(method,params={})=>browser.cdp.send(method,params,session);
  const run=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.equal(r.exceptionDetails,undefined,r.exceptionDetails?.exception?.description);return r.result.value;};
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.downloads=[];const create=URL.createObjectURL.bind(URL);const blobs=new Map();URL.createObjectURL=b=>{const u=create(b);blobs.set(u,b);return u;};HTMLAnchorElement.prototype.click=function(){if(this.download)downloads.push(blobs.get(this.href));};`});
  for(const theme of ['light','dark']) {
    const loaded=browser.cdp.waitFor('Page.loadEventFired',session);
    await send('Page.navigate',{url:pathToFileURL(output).href+'?theme='+theme});await loaded;
    await run('document.fonts.ready');
    assert.equal(await run(`getComputedStyle(document.querySelector('text[style*="fill:#cc2244"]')).fill`),'rgb(204, 34, 68)');
    await run(`Archify.exportMenu.run('svg-'+${JSON.stringify(theme)},{transparentBackground:true})`);
    assert.ok(await run(`downloads.at(-1).text().then(s=>s.includes('fill:#cc2244'))`));
    await run(`Archify.exportMenu.run('png',{transparentBackground:true,scale:1})`);
    const count=await run(`(async()=>{const image=await createImageBitmap(downloads.at(-1));const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);image.close();const p=ctx.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<p.length;i+=4)if(p[i]===204&&p[i+1]===34&&p[i+2]===68&&p[i+3]>0)n++;return n;})()`);
    assert.ok(count>5,theme+' PNG must contain actual colored label pixels');
  }
  edge.labelColor='red';fs.writeFileSync(input,JSON.stringify(spec));assert.throws(render);
  delete edge.labelColor;fs.writeFileSync(input,JSON.stringify(spec));render();
  assert.ok(!fs.readFileSync(output,'utf8').includes('style="fill:#cc2244'));
  console.log('PASS: labelColor schema, theme default, light/dark HTML, transparent SVG and PNG pixels');
} finally {await browser.close();fs.rmSync(scratch,{recursive:true,force:true});}
