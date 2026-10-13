import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export async function startEditor(t, candidate, schema=false) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'archify-recovery-'));
  const input=path.join(dir,'candidate.json');fs.writeFileSync(input,JSON.stringify(candidate));
  const server=spawn(process.execPath,[fileURLToPath(new URL(`../editor/serve${schema?'-schema':''}.mjs`,import.meta.url)),'candidate.json'],{cwd:dir,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='',error='';server.stdout.on('data',v=>output+=v);server.stderr.on('data',v=>error+=v);
  t.after(async()=>{server.kill();await new Promise(resolve=>{if(server.exitCode!==null||server.signalCode!==null)return resolve();server.once('exit',resolve);});fs.rmSync(dir,{recursive:true,force:true});});
  const end=Date.now()+15000;
  while(Date.now()<end){const base=output.match(/http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{40}\//)?.[0];if(base)return {base,input,server,dir};if(server.exitCode!==null)throw Error(error);await new Promise(r=>setTimeout(r,50));}
  throw Error('Editor startup timeout: '+error);
}
