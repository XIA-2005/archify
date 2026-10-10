import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fontCategories, fontTargets, setCategoryFont } from './batch-fonts.mjs';
import { validateSchema } from '../renderers/shared/validator.mjs';

const source=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
source.components[0].tag='Camera';
for(const [category] of fontCategories) {
  const spec=structuredClone(source),before=JSON.stringify(spec);
  const targets=fontTargets(spec,category);
  assert.ok(targets.length>0,category);
  assert.equal(JSON.stringify(spec),before,'Collecting targets must not mutate JSON');
  for(const invalid of [5.5,73,12.25,NaN,'12']) {
    assert.throws(()=>setCategoryFont(spec,category,invalid));assert.equal(JSON.stringify(spec),before);
  }
  assert.equal(setCategoryFont(spec,category,12.5),targets.length);
  assert.ok(fontTargets(spec,category).every(target=>target.get()===12.5));
  assert.equal(setCategoryFont(spec,category,12.5),0);
  validateSchema('architecture',spec);
  if(category==='node-label') {
    assert.deepEqual(spec.connections,source.connections);
    assert.ok(spec.components.every(node=>node.font_sizes.sublabel===undefined));
    spec.components[0].font_sizes.label=15;
    assert.equal(spec.components[1].font_sizes.label,12.5);
  }
  setCategoryFont(spec,category,null);
  assert.ok(fontTargets(spec,category).every(target=>target.get()==null));
  validateSchema('architecture',spec);
  console.log('PASS: '+category+' applies, isolates, resets and validates');
}
const legends=structuredClone(source);legends.meta.legend={mode:'all',entries:{backend:{visible:false},cloud:{label:'Cloud'}}};
assert.equal(fontTargets(legends,'legend').length,6);
setCategoryFont(legends,'legend',10);setCategoryFont(legends,'legend',null);
assert.equal(legends.meta.legend.entries.cloud.label,'Cloud');
assert.equal(legends.meta.legend.entries.backend.visible,false);
legends.meta.legend.mode='hidden';assert.equal(fontTargets(legends,'legend').length,0);
assert.throws(()=>setCategoryFont(legends,'unknown',12));
console.log('PASS: hidden legend entries and labels preserved; unknown type rejected');
