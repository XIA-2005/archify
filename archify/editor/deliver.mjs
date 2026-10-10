#!/usr/bin/env node
// Local extension: one checked diagram, image evidence, and its matching live editor.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(skill,'bin/archify.mjs');
const [type,inputArg,outputArg,...extra] = process.argv.slice(2);
const flags = new Map();
for(let i=0;i<extra.length;i++) {
  const flag=extra[i];
  if(flag==='--json')continue;
  if(!['--repo-root','--out-dir','--quality'].includes(flag)||!extra[i+1]||flags.has(flag))
    throw Error('Usage: editor/deliver.mjs <type> <candidate.json> <diagram.html> [--repo-root path] [--out-dir path] [--quality showcase|standard] [--json]');
  flags.set(flag,extra[++i]);
}
if(!['architecture','workflow','sequence','dataflow','lifecycle'].includes(type)||!inputArg||!outputArg)
  throw Error('Expected diagram type, candidate and HTML paths.');
const input=path.resolve(inputArg), output=path.resolve(outputArg);
const candidate=JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,''));
if(candidate.diagram_type!==type||path.resolve(candidate.meta.output)!==output)
  throw Error('Diagram type and meta.output must match the requested artifact.');
const quality=flags.get('--quality')||candidate.meta.quality_profile||'showcase';
const repoFlags=flags.has('--repo-root')?['--repo-root',path.resolve(flags.get('--repo-root'))]:[];
const outDir=path.resolve(flags.get('--out-dir')||path.join(path.dirname(output),'editable-evidence-'+randomUUID()));
fs.mkdirSync(outDir,{recursive:true});
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const inputHash=digest(input);
function run(args){
  const result=spawnSync(process.execPath,[cli,...args],{cwd:process.cwd(),encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:16_000_000});
  let receipt;try{receipt=JSON.parse(result.stdout);}catch{}
  if(result.status!==0||receipt?.ok!==true){
    console.log(JSON.stringify({ok:false,stage:args[0],receipt,error:result.error?.message||result.stderr}));
    process.exit(result.status||1);
  }
  return receipt;
}
const finalized=run(['finalize',type,input,output,'--quality',quality,...repoFlags,'--out-dir',outDir,'--json']);
// Every architecture uses the same visual gate, irrespective of the authoring model.
const capture=run(['visual-check',output,'--out-dir',path.join(outDir,'visual'),'--summary','--require-provenance']);
if(digest(input)!==inputHash)throw Error('Candidate changed during delivery.');
const editor=path.join(skill,'editor',type==='architecture'?'serve.mjs':'serve-schema.mjs');
const log=path.join(outDir,'editor.log'),errorLog=path.join(outDir,'editor-error.log');
const stdout=fs.openSync(log,'wx'),stderr=fs.openSync(errorLog,'wx');
const child=spawn(process.execPath,[editor,input,...repoFlags],{
  cwd:process.cwd(),windowsHide:true,detached:true,stdio:['ignore',stdout,stderr]});
fs.closeSync(stdout);fs.closeSync(stderr);
let spawnError;child.once('error',error=>{spawnError=error;});child.unref();
let url;
const deadline=Date.now()+20000;
try {
  while(Date.now()<deadline){
    if(spawnError)throw spawnError;
    if(child.exitCode!==null)throw Error('Editor stopped: '+fs.readFileSync(errorLog,'utf8'));
    url=fs.readFileSync(log,'utf8').match(/http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{40}\//)?.[0];
    if(url)break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!url)throw Error('Editor startup timed out: '+fs.readFileSync(errorLog,'utf8'));
  const response=await fetch(url,{signal:AbortSignal.timeout(5000)});
  if(response.status!==200)throw Error('Editor returned HTTP '+response.status);
  const loaded=await(await fetch(url+'api/spec',{signal:AbortSignal.timeout(5000)})).json();
  if(loaded.expectedHash!==inputHash)throw Error('Editor candidate does not match finalized source.');
} catch(error){child.kill();console.log(JSON.stringify({ok:false,stage:'editor',message:error.message,finalized}));process.exit(1);}
const result={schemaVersion:1,ok:true,diagramType:type,source:input,
  specification:finalized.specification,artifact:finalized.artifact,gates:finalized.gates,
  visualCapture:capture,visualReview:'pending-image-inspection',
  editor:{title:'Archify · 可视化编辑器',url,pid:child.pid,entry:editor,reachable:true,
    capability:type==='architecture'?'drag-text-connections-history-image-export':'schema-form-json-renderer-preview',
    availability:'Only while the local editor process is running.'},
  update:finalized.update,finalizeEvidence:finalized.evidence};
const receipt=path.join(outDir,'editable-delivery.json');
fs.writeFileSync(receipt,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({...result,receipt}));
