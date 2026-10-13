import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {startEditor} from './editor-test-helpers.mjs';

for(const schema of [false,true]) test(`candidate read errors recover in the same ${schema?'schema':'architecture'} service`,async t=>{
  const candidate=schema?JSON.parse(fs.readFileSync(new URL('../examples/agent-tool-call.workflow.json',import.meta.url),'utf8')):
    {schema_version:1,diagram_type:'architecture',meta:{title:'Recovery',output:'diagram.html'},components:[{id:'a',type:'backend',label:'A',pos:[100,100]}]};
  candidate.meta.output='diagram.html';
  const {base,input,server}=await startEditor(t,candidate,schema);
  for(const [fault,code]of [['broken',422],['wrong-shape',422],['missing',404]]){
    if(fault==='broken')fs.writeFileSync(input,'{"incomplete":');else if(fault==='wrong-shape')fs.writeFileSync(input,'{}');else fs.unlinkSync(input);
    const response=await fetch(base+'api/spec');assert.equal(response.status,code);
    const body=await response.json();assert.equal(body.ok,false);assert.ok(body.message);
    assert.equal(server.exitCode,null);
    fs.writeFileSync(input,JSON.stringify(candidate));
    const recovered=await fetch(base+'api/spec');assert.equal(recovered.status,200);assert.deepEqual((await recovered.json()).candidate,candidate);
  }
});
