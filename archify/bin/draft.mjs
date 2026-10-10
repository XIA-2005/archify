// Architecture authoring aid. Layout proposals are checked by the canonical
// renderer; they do not change rendering or confer browser/visual acceptance.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { planAutoLayout } from '../editor/auto-layout.mjs';
import { validateSchema } from '../renderers/shared/validator.mjs';
import { textUnits } from '../renderers/shared/utils.mjs';
import { validateNativeOutputPath } from '../renderers/shared/output-path.mjs';

const cli = fileURLToPath(new URL('./archify.mjs', import.meta.url));

function reject(code, subject, message, supportedFixes) {
  const error = new Error(message);
  error.archifyDiagnostics = [{code, severity:'error', subject:{diagramType:'architecture', path:subject},
    message, evidence:{stage:'draft'}, supportedFixes}];
  throw error;
}

export function architectureProposals(input) {
  validateSchema('architecture', input);
  const fixed = input.layout || input.meta.viewBox
    || input.components.some(n => ['pos','size','row','col'].some(k => Object.hasOwn(n,k)))
    || (input.connections || []).some(e => ['via','fromSide','toSide','labelAt','labelDx','labelDy','labelSegment']
      .some(k => Object.hasOwn(e,k)) || (e.route && e.route !== 'auto'));
  if (fixed) reject('draft/fixed-geometry', '/', 'Draft accepts new semantic input without authored geometry.',
    ['deliver the existing candidate directly; preserve its authored geometry',
      'for a new diagram, supply a separate semantic input without layout, viewBox, node geometry or route controls']);
  const ids = new Set();
  input.components.forEach((node, i) => {
    if (ids.has(node.id)) reject('draft/duplicate-id', `/components/${i}/id`, `Duplicate component: ${node.id}`,
      ['assign a unique component id and update its references']);
    ids.add(node.id);
  });
  for (const [i,e] of (input.connections || []).entries()) for (const key of ['from','to']) {
    if (!ids.has(e[key])) reject('draft/dangling-endpoint', `/connections/${i}/${key}`, `Unknown endpoint: ${e[key]}`,
      ['supply the required component or correct the endpoint id; do not drop the relationship']);
  }
  const candidate = structuredClone(input);
  const scale = candidate.meta.font_scale ?? 1;
  candidate.meta.quality_profile ??= 'showcase';
  const edges = candidate.connections || [];
  for (const node of candidate.components) {
    const degree = edges.filter(e => e.from === node.id || e.to === node.id).length;
    const width = Math.ceil(Math.max(160, ...['label','sublabel','tag'].map((key,i) =>
      textUnits(node[key] || '') * (node.font_sizes?.[key] ?? [11,9,8][i]*scale) * 0.6 + 56)));
    node.size = [Math.ceil(width/2)*2, Math.max(80, 40 + 14 * Math.ceil(degree/2))];
  }
  const labelGap = Math.ceil(Math.max(100, ...edges.map(e =>
    textUnits(e.label || '') * (e.font_sizes?.label ?? 8*scale) * 0.6 + 48)));
  if (labelGap > 320) reject('draft/label-space', '/connections', 'Relationship text needs more than the supported layer gap.',
    ['keep the action and condition in a concise edge label; move supporting explanation to a card',
      'use manual authoring when the exact long label must remain']);
  // Back edges must not collapse the whole primary journey into one layer.
  // Remove DFS back edges only from the placement graph, never from output.
  const active = new Set(), visited = new Set(), feedback = new Set();
  const outgoing = new Map(candidate.components.map(n => [n.id,[]]));
  edges.forEach((e,i) => outgoing.get(e.from).push([e,i]));
  function visit(id) {
    visited.add(id); active.add(id);
    for (const [edge,index] of outgoing.get(id)) {
      if (active.has(edge.to)) feedback.add(index);
      else if (!visited.has(edge.to)) visit(edge.to);
    }
    active.delete(id);
  }
  // Entrances first, then any fully cyclic/disconnected scene.
  for (const node of candidate.components) if (!edges.some(e => e.to === node.id)) visit(node.id);
  for (const node of candidate.components) if (!visited.has(node.id)) visit(node.id);
  const placementGraphs = [candidate];
  if (feedback.size) placementGraphs.unshift({...candidate,connections:edges.filter((_,i) => !feedback.has(i))});
  // Boundary strips are useful for deployment maps but can create excessive
  // width for a runtime journey. Also try topology-first placement; actual
  // boundary membership is still preserved and checked by the renderer.
  if (candidate.boundaries?.length) {
    placementGraphs.unshift(...placementGraphs.map(graph => ({...graph,boundaries:[]})));
  }
  const proposals = [];
  // Fold a long journey into alternating rows instead of a shallow wide strip
  // or one very tall column. Nodes sharing a layer retain their local order.
  const foldedGraph = {...placementGraphs[0],boundaries:[]};
  const unfolded = planAutoLayout(foldedGraph,{direction:'LR',layerGap:labelGap,nodeGap:64,margin:100});
  const centerOf = node => unfolded.positions[node.id][0]+node.size[0]/2;
  const ranks = [...new Set(candidate.components.map(centerOf))].sort((a,b)=>a-b);
  const cellWidth = Math.max(...candidate.components.map(n=>n.size[0]));
  const layerHeight = Math.max(...candidate.components.map(n=>unfolded.positions[n.id][1]+n.size[1]))-100;
  for (const cols of [2,3,4]) for (const rowGap of [120,200]) {
    const proposed = structuredClone(candidate);
    for (const node of proposed.components) {
      const [,y] = unfolded.positions[node.id],rank=ranks.indexOf(centerOf(node));
      const row=Math.floor(rank/cols),col=row%2 ? cols-1-rank%cols : rank%cols;
      node.pos=[100+col*(cellWidth+labelGap), y+row*(layerHeight+rowGap)];
    }
    const bounds={width:Math.max(...proposed.components.map(n=>n.pos[0]+n.size[0]))+100,
      height:Math.max(...proposed.components.map(n=>n.pos[1]+n.size[1]))+100};
    proposals.push({candidate:proposed,direction:`fold-${cols}`,layerGap:labelGap,nodeGap:rowGap,bounds});
  }
  for (const graph of placementGraphs) for (const direction of ['LR','TB']) for (const extra of [0,60,120]) {
    const layerGap = Math.min(320, labelGap + extra);
    const nodeGap = 64 + extra;
    const plan = planAutoLayout(graph,{direction,layerGap,nodeGap,componentGap:160,margin:100});
    const proposed = structuredClone(candidate);
    for (const node of proposed.components) node.pos = plan.positions[node.id];
    // Omit viewBox: the renderer measures routes, boundaries and legend too.
    proposals.push({candidate:proposed, direction, layerGap, nodeGap, bounds:plan.bounds});
  }
  return proposals;
}

export function draftArchitecture(input, {repoRoot} = {}) {
  const proposals = architectureProposals(input);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'archify-draft-'));
  const attempts = [];
  try {
    for (const proposal of proposals) {
      const filename = path.join(temp,'proposal.json');
      fs.writeFileSync(filename,JSON.stringify(proposal.candidate));
      const result = spawnSync(process.execPath,[cli,'validate','architecture',filename,
        '--quality',input.meta.quality_profile ?? 'showcase','--json',
        ...(repoRoot ? ['--repo-root',repoRoot] : [])],{encoding:'utf8',maxBuffer:8*1024*1024});
      let receipt;
      try {receipt = JSON.parse(result.stdout);} catch {
        reject('draft/validator-runtime','/',result.error?.message || result.stderr || 'Validator produced no receipt.',
          ['resolve the validator runtime error and rerun draft']);
      }
      const {direction,layerGap,nodeGap,bounds} = proposal;
      attempts.push({direction,layerGap,nodeGap,ok:result.status === 0 && receipt.ok === true,
        diagnostics:receipt.diagnostics || []});
      proposal.accepted = attempts.at(-1).ok;
      // Width is limited by desktop readability; height can use page scroll.
      proposal.score = Math.max(0,bounds.width-1280)*10 + bounds.width + bounds.height*0.35;
    }
    const best = proposals.filter(p => p.accepted).sort((a,b) => a.score-b.score)[0];
    return {ok:Boolean(best), command:'draft', diagramType:'architecture',
      ...(best ? {candidate:best.candidate, selected:{direction:best.direction,layerGap:best.layerGap,nodeGap:best.nodeGap}} : {}),
      attempts, visualReview:'not-requested',
      diagnostics:best ? [] : [{code:'draft/no-valid-layout',severity:'error',subject:{diagramType:'architecture',path:'/'},
        message:'No bounded proposal passed canonical validation. No candidate was published.',
        evidence:{attempts:attempts.length},supportedFixes:['inspect attempts[].diagnostics and repair semantic input or author geometry manually without deleting facts']} ]};
  } finally {fs.rmSync(temp,{recursive:true,force:true});}
}

export function commandDraft(args) {
  let output;
  try {
    const [type,source,target,...rest] = args;
    let repoRoot, json = false, invalid = false;
    for (let i=0;i<rest.length;i++) {
      if (rest[i] === '--json' && !json) json = true;
      else if (rest[i] === '--repo-root' && repoRoot === undefined && rest[i+1] && !rest[i+1].startsWith('--')) repoRoot = rest[++i];
      else invalid = true;
    }
    if (type !== 'architecture' || !source || !target || invalid) {
      reject('draft/arguments','/','Use: archify draft architecture <semantic.json> <candidate.json> [--repo-root <path>] --json',
        ['use the documented draft invocation']);
    }
    // Exclusive creation protects previous candidates, including symlinks.
    validateNativeOutputPath(target,{kind:'file'});
    try {
      fs.lstatSync(target);
      reject('draft/output-conflict','/', 'Candidate destination already exists.', ['choose a fresh candidate path']);
    } catch (error) {if (error.code !== 'ENOENT') throw error;}
    output = draftArchitecture(JSON.parse(fs.readFileSync(source,'utf8').replace(/^\uFEFF/,'')),
      {repoRoot});
    if (output.ok) {
      fs.writeFileSync(target,JSON.stringify(output.candidate,null,2)+'\n',{flag:'wx'});
      delete output.candidate;
      output.output = path.resolve(target);
    }
  } catch (error) {
    output = {ok:false,command:'draft',diagnostics:error.archifyDiagnostics || [{code:'draft/runtime',severity:'error',
      subject:{diagramType:'architecture',path:'/'},message:error.message,evidence:{systemCode:error.code},
      supportedFixes:['correct the input or choose a fresh writable output path, then rerun draft']} ]};
  }
  console.log(JSON.stringify(output,null,2));
  if (!output.ok) process.exitCode = 1;
}
