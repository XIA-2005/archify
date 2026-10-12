import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {architecture} from '../renderers/shared/generated-validators.mjs';
import {extractArchifyRoutes} from '../editor/route-preview.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
function fixture(){return {schema_version:1,diagram_type:'architecture',meta:{title:'Native geometry',output:'diagram.html',quality_profile:'standard'},
  components:[{id:'a',type:'backend',label:'Source',pos:[200,200],size:[180,80]},
    {id:'b',type:'backend',label:'Target',pos:[600,200],size:[180,80]}],
  boundaries:[{kind:'region',label:'Process',wraps:['a','b'],bounds:[120,120,760,220]}],
  connections:[{id:'ab',from:'a',to:'b',fromSide:'right',toSide:'left',fromPort:[1,0.25],toPort:[0,0.75],via:[[490,220],[490,260]]}]};}
function render(candidate){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'archify-native-geometry-'));
  fs.writeFileSync(path.join(dir,'candidate.json'),JSON.stringify(candidate));
  const r=spawnSync(process.execPath,[path.join(root,'bin/archify.mjs'),'render','architecture','candidate.json','diagram.html'],{cwd:dir,encoding:'utf8',windowsHide:true});
  return {...r,html:r.status===0?fs.readFileSync(path.join(dir,'diagram.html'),'utf8'):''};}
test('native frame and exact normalized ports survive canonical rendering',()=>{
  const s=fixture();assert.ok(architecture(s));const r=render(s);assert.equal(r.status,0,r.stderr);
  assert.deepEqual(extractArchifyRoutes(r.html,1)[0].points,[[380,220],[490,220],[490,260],[600,260]]);
  const rect=r.html.match(/<rect[^>]*data-composition-frame-id="0"[^>]*>/)?.[0];assert.ok(rect);
  for(const [i,key]of ['x','y','width','height'].entries())assert.ok(rect.includes(`${key}="${s.boundaries[0].bounds[i]}"`),rect);
});
test('invalid frame and port edits fail without weakening the schema',()=>{
  for(const value of [[1,2,0,4],[-1,2,3,4],[1,2,3]]){const s=fixture();s.boundaries[0].bounds=value;assert.equal(architecture(s),false);}
  for(const value of [[1.1,0],[-0.1,1],[0]]){const s=fixture();s.connections[0].fromPort=value;assert.equal(architecture(s),false);}
  const s=fixture();s.boundaries[0].bounds=[120,200,760,20];assert.notEqual(render(s).status,0,'Title composition checks stay mandatory');
});
test('the native editing bundle is pinned to unmodified draw.io bytes',()=>{
  const vendor=path.join(root,'editor/vendor/drawio');const manifest=JSON.parse(fs.readFileSync(path.join(vendor,'SOURCE.json'),'utf8'));
  assert.equal(manifest.version,'29.7.9');
  for(const [file,expected]of Object.entries(manifest.files)){
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(vendor,file))).digest('hex'),expected,file);
  }
});
