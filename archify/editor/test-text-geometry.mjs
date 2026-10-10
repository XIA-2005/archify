import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateSchema } from '../renderers/shared/validator.mjs';
import { componentTextGeometry, labelGeometry, arrowBounds } from '../renderers/shared/text-style.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'archify-text-geometry-'));
const run=(args)=>spawnSync(process.execPath,args,{cwd:temp,encoding:'utf8',windowsHide:true});
try {
  for(const size of [6,6.5,72]) {
    const candidate=structuredClone(source);candidate.components[0].font_sizes={label:size};validateSchema('architecture',candidate);
    assert.equal(componentTextGeometry(candidate.components[0]).sizes.label,size);
  }
  for(const size of [5.5,72.5,12.25,'12',null]) {
    const candidate=structuredClone(source);candidate.connections[0].font_sizes={label:size};
    assert.throws(()=>validateSchema('architecture',candidate));
  }
  const card=structuredClone(source);card.cards[0].font_sizes={items:[null]};
  assert.throws(()=>validateSchema('architecture',card));
  assert.ok(labelGeometry('Label',24,[100,100]).width>labelGeometry('Label',8,[100,100]).width);
  for(const points of [[[0,0],[100,0]],[[100,0],[0,0]],[[0,0],[0,100]],[[0,100],[0,0]]]) {
    for(const scale of [0.5,1,4,16]){
      const box=arrowBounds(points,scale);assert.ok(Math.abs(Math.max(box.width,box.height)-10*scale)<0.001);
    }
  }
  for(const value of [0.49,4.01,'2',null]){
    const candidate=structuredClone(source);candidate.meta.arrow_scale=value;
    assert.throws(()=>validateSchema('architecture',candidate));
  }
  for(const scale of [1,2,4]) {
    const candidate=structuredClone(source);candidate.meta.line_scale=scale;
    const input=path.join(temp,'candidate.json');fs.writeFileSync(input,JSON.stringify(candidate));
    let result=run([path.join(root,'bin/archify.mjs'),'validate','architecture',input,'--json']);
    assert.equal(result.status,0,result.stdout+result.stderr);
    const edge=candidate.connections[0],target=candidate.components.find(n=>n.id===edge.to);
    edge.labelAt=[target.pos[0],target.pos[1]+target.size[1]/2];
    fs.writeFileSync(input,JSON.stringify(candidate));
    result=run([path.join(root,'bin/archify.mjs'),'validate','architecture',input,'--json']);
    assert.notEqual(result.status,0);assert.match(result.stdout+result.stderr,/label-arrow-overlap/);
  }
  for(const arrowScale of [0.5,1.5,4]) {
    const candidate=structuredClone(source);candidate.meta.arrow_scale=arrowScale;
    validateSchema('architecture',candidate);
    const input=path.join(temp,'arrows.json'),output=path.join(temp,'arrows.html');
    fs.writeFileSync(input,JSON.stringify(candidate));
    const result=run([path.join(root,'renderers/architecture/render-architecture.mjs'),input,output]);
    assert.equal(result.status,0,result.stdout+result.stderr);
    assert.match(fs.readFileSync(output,'utf8'),new RegExp(`id="arrowhead" markerUnits="userSpaceOnUse" markerWidth="${11*arrowScale}" markerHeight="${7*arrowScale}"`));
  }
  const oversized=structuredClone(source);oversized.meta.line_scale=4;oversized.meta.arrow_scale=4;
  const oversizedInput=path.join(temp,'oversized.json');fs.writeFileSync(oversizedInput,JSON.stringify(oversized));
  const oversizedResult=run([path.join(root,'bin/archify.mjs'),'validate','architecture',oversizedInput,'--json']);
  assert.notEqual(oversizedResult.status,0);assert.match(oversizedResult.stdout+oversizedResult.stderr,/arrow-outside-canvas/);
  console.log('PASS: font and arrow ranges/types, card count, label measurement, proportional arrow geometry and pinned collisions at all line widths');
  const baseline=process.argv[3];
  if(baseline) for(const [type,example] of [['workflow','agent-tool-call.workflow.json'],['sequence','cache-miss-request.sequence.json'],['dataflow','product-analytics.dataflow.json'],['lifecycle','deployment-release.lifecycle.json']]) {
    const candidate=JSON.parse(fs.readFileSync(path.join(root,'examples',example),'utf8'));candidate.meta.output='diagram.html';
    const input=path.join(temp,type+'.json');fs.writeFileSync(input,JSON.stringify(candidate));
    const outputs=[];
    for(const [index,installation] of [baseline,root].entries()) {
      const output=path.join(temp,type+index+'.html');
      const result=run([path.join(installation,'renderers',type,'render-'+type+'.mjs'),input,output]);
      assert.equal(result.status,0,result.stdout+result.stderr);outputs.push(fs.readFileSync(output,'utf8'));
    }
    assert.equal(outputs[1],outputs[0],type+' default output changed');
    console.log('PASS: '+type+' default HTML is byte-identical to unchanged installation');
  }
} finally {fs.rmSync(temp,{recursive:true,force:true});}
