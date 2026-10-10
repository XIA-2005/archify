#!/usr/bin/env node
// Local-only integration tests for the four non-Architecture editor modes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const home=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const examples={workflow:'agent-tool-call.workflow.json',sequence:'cache-miss-request.sequence.json',
  dataflow:'product-analytics.dataflow.json',lifecycle:'deployment-release.lifecycle.json'};
const serve=path.join(home,'editor','serve-schema.mjs');
let passed=0;
for(const [type,file] of Object.entries(examples)){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),`archify-schema-${type}-`));
  const input=path.join(dir,'candidate.json');
  const spec=JSON.parse(fs.readFileSync(path.join(home,'examples',file),'utf8'));
  spec.meta.output='diagram.html';
  fs.writeFileSync(input,JSON.stringify(spec,null,2)+'\n');
  const child=spawn(process.execPath,[serve,'candidate.json'],{cwd:dir,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
  try{
    const deadline=Date.now()+24000;let url;
    while(Date.now()<deadline){url=stdout.match(/http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{40}\//)?.[0];if(url)break;
      if(child.exitCode!==null)throw Error('Editor exited: '+stderr);
      await new Promise(r=>setTimeout(r,120));}
    assert.ok(url,'Editor not ready: '+stdout+' '+stderr);
    const doc=await fetch(url);assert.equal(doc.status,200);assert.match(await doc.text(),/跨类型可编辑页面/);
    const initial=await (await fetch(url+'api/spec')).json();
    assert.equal(initial.candidate.diagram_type,type);
    const noAuth=await fetch(url+'api/save',{method:'POST',body:JSON.stringify({candidate:spec,expectedHash:initial.expectedHash}),headers:{'content-type':'application/json'}});
    assert.equal(noAuth.status,403);
    const req=(endpoint,candidate,expectedHash)=>fetch(url+endpoint,{method:'POST',headers:{'content-type':'application/json',
      'x-archify-editor':'1',origin:new URL(url).origin},body:JSON.stringify({candidate,expectedHash})});
    const changed=structuredClone(spec);changed.meta.output='outside.html';
    const invalid=await req('api/save',changed,initial.expectedHash);
    assert.equal(invalid.status,400);
    assert.equal(fs.readFileSync(input,'utf8'),JSON.stringify(spec,null,2)+'\n');
    const rendered=await req('api/preview',spec,initial.expectedHash);
    assert.equal(rendered.status,200,`Preview ${type} failed: ${await rendered.text()}`);
    const iframe=await fetch(url+'preview');assert.equal(iframe.status,200);
    assert.match(await iframe.text(),/<svg\b/i);
    if(type==='workflow'){
      const update=structuredClone(spec);update.meta.title+=' · schema editor test';
      const saved=await req('api/save',update,initial.expectedHash);
      const result=await saved.json();
      assert.equal(saved.status,200,JSON.stringify(result));
      assert.equal(result.ok,true);
      assert.ok(fs.existsSync(result.backup),'Save must retain original candidate backup');
      assert.ok(fs.existsSync(path.join(dir,'diagram.html')),'Official HTML must be finalized');
      assert.equal(JSON.parse(fs.readFileSync(input)).meta.title,update.meta.title);
      const stale=await req('api/save',update,initial.expectedHash);
      assert.equal(stale.status,409,'Stale revision must not overwrite a newer candidate');
    }
    console.log('PASS:',type,'local page, editor contract, read-only preview, official SVG');passed++;
  }finally{
    child.kill();
    await Promise.race([
      new Promise(resolve=>child.once('exit',resolve)),
      new Promise(resolve=>setTimeout(resolve,1600)),
    ]);
    try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:6,retryDelay:180});}
    catch(e){console.warn('Temporary fixture cleanup deferred:',e.code);}
  }
}
console.log('Schema editor cases passed:',passed);
