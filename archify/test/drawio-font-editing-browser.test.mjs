import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {drawioSession} from './helpers/drawio-browser-session.mjs';

function fixture(){return process.env.ARCHIFY_EDITING_FIXTURE
  ?JSON.parse(fs.readFileSync(process.env.ARCHIFY_EDITING_FIXTURE,'utf8'))
  :{schema_version:1,diagram_type:'architecture',meta:{title:'Editing regressions',output:'diagram.html',quality_profile:'standard'},
    components:[{id:'control',type:'backend',label:'Control',pos:[200,160],size:[220,84]},
      {id:'motor',type:'external',label:'D153B + 直流电机',sublabel:'TIM3_CH3 · PWM 与方向 GPIO',pos:[700,160],size:[220,84]},
      {id:'sensor',type:'backend',label:'Sensor',pos:[700,420],size:[220,84]}],
    connections:[{from:'control',to:'motor',label:'PWM / 方向',fromSide:'right',toSide:'left'},
      {from:'motor',to:'sensor',label:'Encoder feedback',fromSide:'bottom',toSide:'top',labelAt:[810,330]},
      {from:'sensor',to:'control',label:'Measured speed',fromSide:'left',toSide:'bottom',labelAt:[450,350]}]};}

const labels=`Object.values(g.model.cells).filter(c=>c.edge&&c.archifyKind==='edge').map(c=>{
  const s=g.view.getState(c);return {id:c.archifyId,anchor:[s.absoluteOffset.x/g.view.scale-g.view.translate.x,s.absoluteOffset.y/g.view.scale-g.view.translate.y],
    font:g.getCellStyle(c).fontSize,route:s.absolutePoints.filter(Boolean).map(p=>[p.x/g.view.scale-g.view.translate.x,p.y/g.view.scale-g.view.translate.y])};})`;
function near(actual,expected,message){assert.equal(actual.length,expected.length,message);actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<0.00001,message+': '+JSON.stringify({actual,expected})));}

test('removing and restoring module descriptions preserves all native edge routes and labels',{timeout:120000},async t=>{
  const b=await drawioSession(t,fixture());if(!b)return;
  const before=await b.snapshot(),original=before.components.find(n=>n.id==='motor');
  await b.native(`g.setSelectionCell(g.model.getCell('node-motor'))`);
  const prior=await b.native(labels);
  await b.native(`g.model.getCell('node-motor').regressionIdentity=true`);
  const edit=async text=>b.evaluate(`(()=>{const label=[...document.querySelectorAll('label.field')].find(el=>el.firstChild?.textContent==='模块说明');const input=label.querySelector('input');input.value=${JSON.stringify(text)};input.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await edit('');await b.sleep(350);
  const expected=structuredClone(before);expected.components.find(n=>n.id==='motor').sublabel='';
  assert.deepEqual(await b.snapshot(),expected,'Removing description must not change connection fields or node geometry');
  const check=async()=>{
    const current=await b.native(labels);
    for(const old of prior){const edge=current.find(e=>e.id===old.id);near(edge.anchor,old.anchor,'Description edit moved '+old.id);assert.deepEqual(edge.route,old.route);}
    assert.equal(await b.native(`g.model.getCell('node-motor').regressionIdentity`),true,'Text editing must retain the native cells');
  };
  await check();assert.equal(await b.native(`(g.model.getCell('node-motor').children||[]).filter(c=>c.archifyTextField==='sublabel').length`),0);
  await b.evaluate(`document.getElementById('undo').click()`);await b.sleep(100);assert.deepEqual(await b.snapshot(),before);await check();
  assert.equal(await b.native(`g.model.getCell('node-motor').children.find(c=>c.archifyTextField==='sublabel').value`),original.sublabel);
  await b.evaluate(`document.getElementById('redo').click()`);await b.sleep(100);assert.deepEqual(await b.snapshot(),expected);await check();
  await b.native(`(()=>{g.clearSelection();g.setSelectionCell(g.model.getCell('node-motor'))})()`);
  await edit('Updated description');await b.sleep(100);await check();
  assert.equal(await b.native(`g.model.getCell('node-motor').children.find(c=>c.archifyTextField==='sublabel').value`),'Updated description');
});

test('font spinner increases the effective default and preserves every native label through undo/redo',{timeout:120000},async t=>{
  const b=await drawioSession(t,fixture());if(!b)return;
  const index=b.candidate.connections.findIndex(e=>e.label==='PWM / 方向');const id=b.candidate.connections[index].id||'edge-'+index;
  await b.native(`g.setSelectionCell(g.model.getCell('edge-'+${JSON.stringify(id)}))`);
  const before=await b.snapshot(),beforeLabels=await b.native(labels);
  const arrow=await b.evaluate(`(()=>{const el=document.querySelector('[data-font-control="连线文字字号"]'),r=el.getBoundingClientRect();return [r.right-8,r.top+r.height*.28]})()`);
  await b.click(...arrow);await b.sleep(200);
  const after=await b.snapshot(),afterLabels=await b.native(labels);
  t.diagnostic('Spinner result '+JSON.stringify(after.connections[index].font_sizes));
  assert.equal(after.connections[index].font_sizes.label,8.5,'One upward click from default 8 must yield 8.5');
  const expected=structuredClone(before);expected.connections[index].font_sizes={...expected.connections[index].font_sizes,label:8.5};
  assert.deepEqual(after,expected,'Only the selected font field may change');
  for(const prior of beforeLabels){const current=afterLabels.find(x=>x.id===prior.id);near(current.anchor,prior.anchor,'Font edit moved label '+prior.id);assert.deepEqual(current.route,prior.route);}
  assert.equal(afterLabels.find(x=>x.id===id).font,8.5);
  await b.click(...arrow);await b.sleep(100);
  assert.equal((await b.snapshot()).connections[index].font_sizes.label,9,'Repeated upward clicks must continue increasing');
  await b.evaluate(`document.getElementById('undo').click()`);assert.deepEqual(await b.snapshot(),expected);
  await b.evaluate(`document.getElementById('undo').click()`);await b.sleep(100);
  assert.deepEqual(await b.snapshot(),before);const undone=await b.native(labels);
  for(const prior of beforeLabels){near(undone.find(x=>x.id===prior.id).anchor,prior.anchor,'Undo did not restore '+prior.id);}
  await b.evaluate(`document.getElementById('redo').click()`);assert.deepEqual(await b.snapshot(),expected);
  const redone=await b.native(labels);for(const prior of beforeLabels)near(redone.find(x=>x.id===prior.id).anchor,prior.anchor,'Redo moved '+prior.id);
  await b.screenshot('font-increment');
  await b.native(`(()=>{g.clearSelection();g.setSelectionCell(g.model.getCell('edge-'+${JSON.stringify(id)}))})()`);
  const button=await b.evaluate(`(()=>{const input=document.querySelector('[data-font-control="连线文字字号"]');input.focus();input.value='10';const b=input.closest('label').querySelector('button'),r=b.getBoundingClientRect();return {text:b.textContent,at:[r.x+r.width/2,r.y+r.height/2]}})()`);
  assert.equal(button.text,'一键设置');await b.click(...button.at);
  const batch=structuredClone(expected);for(const edge of batch.connections)if(edge.label)edge.font_sizes={...edge.font_sizes,label:10};
  assert.deepEqual(await b.snapshot(),batch,'One click applies pending input to all edge labels only');
  const applied=await b.native(labels);for(const prior of beforeLabels)near(applied.find(x=>x.id===prior.id).anchor,prior.anchor,'Batch changed label position '+prior.id);
  await b.evaluate(`document.getElementById('undo').click()`);assert.deepEqual(await b.snapshot(),expected,'One undo restores all labels together');
  await b.evaluate(`document.getElementById('redo').click()`);assert.deepEqual(await b.snapshot(),batch);
});

test('module name one-click font setting affects all module names and no other text',{timeout:120000},async t=>{
  const b=await drawioSession(t,fixture());if(!b)return;
  const before=await b.snapshot();await b.native(`g.setSelectionCell(g.model.getCell('node-motor'))`);
  await b.evaluate(`(()=>{const input=document.querySelector('[data-font-control="模块名称字号"]');input.value='15';input.closest('label').querySelector('button').click()})()`);
  const expected=structuredClone(before);for(const node of expected.components)if(node.label)node.font_sizes={...node.font_sizes,label:15};
  assert.deepEqual(await b.snapshot(),expected);
  await b.evaluate(`document.getElementById('undo').click()`);assert.deepEqual(await b.snapshot(),before);
});

test('double-click edits a decorated module in place without scrolling the entire diagram away',{timeout:120000},async t=>{
  const b=await drawioSession(t,fixture());if(!b)return;
  const before=await b.snapshot();
  const at=await b.native(`(()=>{const cell=g.model.getCell('node-motor'),r=g.view.getState(cell).shape.node.getBoundingClientRect(),fr=f.getBoundingClientRect();return [r.x+r.width/2+fr.x,r.y+r.height*.32+fr.y]})()`);
  const viewport=await b.native(`({root:g.view.currentRoot?.id||null,scale:g.view.scale,scroll:[g.container.scrollLeft,g.container.scrollTop]})`);
  await b.click(...at);await b.click(...at,2);await b.sleep(150);
  const editing=await b.native(`(()=>{const el=g.cellEditor.textarea,r=el?.getBoundingClientRect(),c=g.model.getCell('node-motor'),box=g.view.getState(c).shape.node.getBoundingClientRect();return {cell:g.cellEditor.editingCell?.id,root:g.view.currentRoot?.id||null,scale:g.view.scale,scroll:[g.container.scrollLeft,g.container.scrollTop],position:el?w.getComputedStyle(el).position:null,editor:r?[r.x,r.y,r.width,r.height]:null,node:[box.x,box.y,box.width,box.height]}})()`);
  t.diagnostic('Double-click '+JSON.stringify(editing));await b.screenshot('inline-edit');
  assert.equal(editing.cell,'node-motor');assert.equal(editing.root,viewport.root);
  assert.equal(editing.position,'relative','Use the positioning defined by the bundled native mxCellEditor stylesheet');
  assert.equal(editing.scale,viewport.scale);near(editing.scroll,viewport.scroll,'Double-click changed viewport');
  assert.ok(editing.editor[0]>=editing.node[0]-20&&editing.editor[0]<=editing.node[0]+editing.node[2]+20);
  assert.ok(editing.editor[1]>=editing.node[1]-20&&editing.editor[1]<=editing.node[1]+editing.node[3]+20);
  await b.native(`(()=>{g.cellEditor.textarea.textContent='Motor renamed';g.stopEditing(false)})()`);
  const changed=await b.snapshot();const expected=structuredClone(before);expected.components.find(n=>n.id==='motor').label='Motor renamed';
  assert.deepEqual(changed,expected,'Native label commit must not change routes or other source fields');
  await b.evaluate(`document.getElementById('undo').click()`);assert.deepEqual(await b.snapshot(),before);
});
