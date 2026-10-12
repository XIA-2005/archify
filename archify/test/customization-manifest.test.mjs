import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

test('customization manifest hashes match the exact source bytes',()=>{
  const root=new URL('../',import.meta.url);
  const manifest=JSON.parse(fs.readFileSync(new URL('customization-manifest.json',root),'utf8'));
  assert.ok(manifest.files.length>0);
  const paths=new Set();
  for(const entry of manifest.files){
    assert.ok(!paths.has(entry.path),'Duplicate manifest path: '+entry.path);paths.add(entry.path);
    const actual=createHash('sha256').update(fs.readFileSync(new URL(entry.path,root))).digest('hex');
    assert.equal(actual,entry.sha256,'Refresh the checksum for '+entry.path+' from the final source');
  }
});
