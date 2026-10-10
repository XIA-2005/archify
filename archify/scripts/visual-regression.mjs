#!/usr/bin/env node
// Reproducible canonical rendering + browser/screenshot baseline. No editor involved.
// A capture is evidence for human review, never machine-certified aesthetics.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(skill, 'bin', 'archify.mjs');
const opts = {};
for(let i=2;i<process.argv.length;i++){
  const flag=process.argv[i];
  if(!['--out-dir','--project','--baseline','--baseline-out'].includes(flag) || !process.argv[i+1]) {
    console.error('Usage: visual-regression.mjs [--project existing-candidate.json] [--out-dir folder] [--baseline baseline.json] [--baseline-out new-baseline.json]');
    process.exit(2);
  }
  opts[flag.slice(2)] = process.argv[++i];
}
const hash=(f)=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const caseNames=[
  {id:'upstream-v3.0.1-architecture',file:path.join(skill,'examples','web-app.architecture.json')},
  {id:'upstream-v3.0.1-workflow',file:path.join(skill,'examples','agent-tool-call.workflow.json')},
];
if(opts.project)caseNames.push({id:'project-architecture',file:path.resolve(opts.project)});
const stamp=new Date().toISOString().replace(/\W/g,'').slice(0,14);
const out=path.resolve(opts['out-dir'] || path.join(process.cwd(),`.archify/visual-regression-${stamp}`));
fs.mkdirSync(out,{recursive:false});
function call(args,cwd){
  const r=spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8',timeout:120000,maxBuffer:16_000_000,windowsHide:true});
  let data={};try{data=JSON.parse(r.stdout.trim());}catch{}
  if(r.status!==0 || data.ok!==true)throw Error(`CLI ${args[0]} failed: ${JSON.stringify(data.diagnostics||[]).slice(0,650)} ${r.stderr.slice(-350)}`);
  return data;
}
const report={schemaVersion:1,renderer:{version:JSON.parse(fs.readFileSync(path.join(skill,'package.json'))).version,
  architectureRendererSha256:hash(path.join(skill,'renderers/architecture/render-architecture.mjs')),
  architectureRoutingSha256:hash(path.join(skill,'renderers/architecture/routing.mjs'))},
  note:'Samples are upstream v3.0.1 examples rendered with current installed engine; project uses copied current candidate. Pixel signatures are informative; screenshot visual judgment remains human.',
  cases:[],comparison:null};
const expected=opts.baseline?JSON.parse(fs.readFileSync(path.resolve(opts.baseline),'utf8')):null;
let failures=0;
for(const entry of caseNames){
  const dir=path.join(out,entry.id);fs.mkdirSync(dir);
  try{
    const spec=JSON.parse(fs.readFileSync(entry.file,'utf8'));
    const type=spec.diagram_type;
    const sourceSha=hash(entry.file);
    // Only rewrite the artifact path on an isolated COPY of this stable fixture.
    spec.meta.output='diagram.html';
    const input=path.join(dir,'candidate.json'),html=path.join(dir,'diagram.html');
    fs.writeFileSync(input,JSON.stringify(spec,null,2)+'\n');
    const quality=spec.meta.quality_profile==='standard'?'standard':'showcase';
    call(['finalize',type,input,html,'--quality',quality,'--out-dir',path.join(dir,'finalize-evidence'),'--json'],dir);
    const check=call(['check',html,'--require-provenance'],dir);
    const visual=call(['visual-check',html,'--out-dir',path.join(dir,'visual-evidence'),'--summary','--require-provenance'],dir);
    const visualFull=JSON.parse(fs.readFileSync(visual.evidence.receipt,'utf8'));
    const v=visualFull.containment?.viewports?.find(x=>x.width===1440&&x.height===900&&x.theme==='light')||{};
    const cm=check.composition?.metrics||{};
    const screenshots=(visual.evidence.screenshots||[]).map(x=>({viewport:`${x.width}x${x.height}`,theme:x.theme,
      file:path.relative(out,x.path).replaceAll('\\','/'),sha256:hash(x.path)}));
    const result={id:entry.id,diagramType:type,source:entry.file,sourceSha256:sourceSha,
      candidateSha256:hash(input),htmlSha256:hash(html),
      gates:{finalize:'pass',check:'pass',visualCapture:'pass'},
      metrics:{projectedText1440:v.minimumProjectedNodeTextPx??null,viewBoxWidth1440:v.viewBoxWidth??null,
        resolvedCrossovers:cm.resolvedCrossovers??0,properCrossings:cm.properCrossings??0,
        routeDetours:cm.routesOverSuggestedBends??0,emptyTopRatio:cm.leadingSpace?.emptyTopRatio??null},
      screenshots,visualReview:'pending-human-inspection'};
    result.reviewFlags=[
      ...(result.metrics.projectedText1440!==null&&result.metrics.projectedText1440<7.5?['text-1440-below-7.5px-target']:[]),
      ...(result.metrics.resolvedCrossovers>0?['crossovers-need-human-review']:[]),
      ...(result.metrics.emptyTopRatio!==null&&result.metrics.emptyTopRatio>0.2?['excess-top-whitespace']:[]),
    ];
    report.cases.push(result);
    console.log(`PASS ${entry.id}: text@1440=${result.metrics.projectedText1440?.toFixed(2)}px, crossovers=${result.metrics.resolvedCrossovers}; ${result.reviewFlags.join(', ')||'no automatic review flags'}`);
  }catch(e){failures++;report.cases.push({id:entry.id,error:e.message,gates:{status:'fail'}});console.error(`FAIL ${entry.id}: ${e.message}`);}
}
if(expected){
  const regressions=[];
  for(const current of report.cases){const old=expected.cases?.find(x=>x.id===current.id);if(!old||current.error)continue;
    if(old.sourceSha256!==current.sourceSha256){regressions.push({id:current.id,kind:'fixture-input-changed'});continue;}
    if(current.metrics.projectedText1440!==null&&old.metrics.projectedText1440!==null&&current.metrics.projectedText1440<old.metrics.projectedText1440-0.4)
      regressions.push({id:current.id,kind:'projected-text-shrunk',before:old.metrics.projectedText1440,after:current.metrics.projectedText1440});
    if(current.metrics.resolvedCrossovers>old.metrics.resolvedCrossovers)regressions.push({id:current.id,kind:'more-crossovers'});
    if(current.metrics.properCrossings>old.metrics.properCrossings)regressions.push({id:current.id,kind:'more-proper-crossings'});
  }
  report.comparison={baseline:path.resolve(opts.baseline),regressions,notCompared:report.cases.filter(x=>!expected.cases?.some(y=>y.id===x.id)).map(x=>x.id)};
  if(regressions.length)failures++;
}
const reportPath=path.join(out,'report.json');fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
if(opts['baseline-out'] && failures===0){
  const dest=path.resolve(opts['baseline-out']);fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log('New immutable baseline:',dest);
}
if(opts['baseline-out'] && failures>0)console.error('Baseline NOT recorded because a test or comparison failed.');
console.log('Report:',reportPath,'Failures:',failures);
process.exitCode=failures?1:0;
