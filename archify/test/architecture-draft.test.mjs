import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {architectureProposals, draftArchitecture} from '../bin/draft.mjs';

const cli = new URL('../bin/archify.mjs',import.meta.url);
const semantic = () => ({schema_version:1,diagram_type:'architecture',
  meta:{title:'缓存请求',output:'diagram.html',locale:'zh-CN'},
  components:[{id:'browser',type:'frontend',label:'浏览器'},
    {id:'api',type:'backend',label:'API',sublabel:'检查缓存后查询数据库'},
    {id:'cache',type:'database',label:'Redis'},
    {id:'db',type:'database',label:'PostgreSQL'}],
  connections:[{id:'request',from:'browser',to:'api',label:'GET /items'},
    {id:'read',from:'api',to:'cache',label:'检查缓存'},
    {id:'miss',from:'api',to:'db',label:'缓存未命中时查询'}],
  cards:[{dot:'emerald',title:'条件',items:['仅缓存未命中时查询数据库']} ]});

function withoutGeometry(candidate) {
  const clone = structuredClone(candidate);
  for (const node of clone.components) {delete node.pos; delete node.size;}
  return clone;
}

test('draft checks generated geometry and preserves all semantic data and input bytes', () => {
  const input = semantic();
  const original = structuredClone(input);
  const result = draftArchitecture(input);
  assert.equal(result.ok,true,JSON.stringify(result.attempts));
  assert.equal(result.visualReview,'not-requested');
  assert.deepEqual(input,original);
  original.meta.quality_profile = 'showcase';
  assert.deepEqual(withoutGeometry(result.candidate),original);
  assert.equal(result.attempts.length,12);
  assert.ok(result.attempts.some(a => a.ok));
  assert.ok(!Object.hasOwn(result.candidate.meta,'viewBox'));
  assert.deepEqual(architectureProposals(input),architectureProposals(input));
});

test('feedback alternatives preserve returns, self loops, boundaries and disconnected nodes', () => {
  const input = semantic();
  input.connections.push({from:'cache',to:'api',label:'返回'}, {from:'api',to:'api',label:'重试'});
  input.components.push({id:'external',type:'external',label:'外部服务'});
  input.boundaries = [{kind:'region',label:'应用',wraps:['api']}];
  const proposals = architectureProposals(input);
  assert.equal(proposals.length,30);
  for (const {candidate} of proposals) {
    assert.deepEqual(candidate.connections,input.connections);
    assert.deepEqual(candidate.boundaries,input.boundaries);
    assert.deepEqual(candidate.components.map(n=>n.id),input.components.map(n=>n.id));
    for (let i=0;i<candidate.components.length;i++) for (let j=i+1;j<candidate.components.length;j++) {
      const a=candidate.components[i],b=candidate.components[j];
      assert.ok(a.pos[0]+a.size[0]<=b.pos[0] || b.pos[0]+b.size[0]<=a.pos[0]
        || a.pos[1]+a.size[1]<=b.pos[1] || b.pos[1]+b.size[1]<=a.pos[1]);
    }
  }
});

test('invalid semantics and explicit geometry fail before proposing placements', () => {
  for (const mutate of [d => {d.components[0].pos=[0,0];},
    d => {d.meta.viewBox=[800,600];},d => {d.connections[0].via=[[0,0]];}]) {
    const input=semantic(); mutate(input);
    assert.throws(()=>architectureProposals(input),e=>e.archifyDiagnostics[0].code==='draft/fixed-geometry');
  }
  const dangling=semantic(); dangling.connections[0].to='missing';
  assert.throws(()=>architectureProposals(dangling),e=>e.archifyDiagnostics[0].code==='draft/dangling-endpoint');
  const duplicate=semantic(); duplicate.components[1].id='browser';
  assert.throws(()=>architectureProposals(duplicate),e=>e.archifyDiagnostics[0].code==='draft/duplicate-id');
});

test('CLI writes a fresh candidate, refuses replacement, and emits machine readable failure', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'archify-draft-test-'));
  try {
    const input=path.join(dir,'semantic.json'),output=path.join(dir,'candidate.json');
    fs.writeFileSync(input,JSON.stringify(semantic()));
    const run=(...args)=>spawnSync(process.execPath,[fileURLToPath(cli),
      'draft','architecture',input,output,'--json',...args],{encoding:'utf8'});
    const first=run(); assert.equal(first.status,0,first.stdout+first.stderr);
    const bytes=fs.readFileSync(output,'utf8');
    assert.equal(JSON.parse(first.stdout).ok,true);
    const second=run(); assert.equal(second.status,1);
    assert.equal(JSON.parse(second.stdout).ok,false);
    assert.equal(fs.readFileSync(output,'utf8'),bytes);
    const invalid=run('--unknown'); assert.equal(invalid.status,1);
    assert.equal(JSON.parse(invalid.stdout).diagnostics[0].code,'draft/arguments');
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('historical weaker-model queue draft is repaired without changing facts', () => {
  const input=JSON.parse(fs.readFileSync(new URL('./fixtures/architecture-first-draft/queue-luna.architecture.json',import.meta.url)));
  for (const node of input.components) {delete node.pos;delete node.size;}
  for (const edge of input.connections) for (const key of ['via','fromSide','toSide','labelAt','labelDx','labelDy','labelSegment','route']) delete edge[key];
  const result=draftArchitecture(input);
  assert.equal(result.ok,true,JSON.stringify(result.attempts));
  assert.deepEqual(withoutGeometry(result.candidate),input);
});

test('no passing proposal returns actionable diagnostics without manufacturing a candidate', () => {
  const input=semantic();
  input.boundaries=[{kind:'region',label:'Missing group',wraps:['missing']}];
  const result=draftArchitecture(input);
  assert.equal(result.ok,false);
  assert.ok(!Object.hasOwn(result,'candidate'));
  assert.equal(result.diagnostics[0].code,'draft/no-valid-layout');
  assert.ok(result.attempts.every(a=>!a.ok && a.diagnostics.length));
});
