// Re-render every bundled example from its JSON IR. Installed skills keep HTML
// beside the JSON examples; the development script passes the golden directory.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');
const outputRoots = [...new Set([path.resolve(process.argv[2] || path.join(skillRoot, 'examples')), path.join(skillRoot, 'examples')])];

const TARGETS = [
  ['workflow', 'agent-tool-call.workflow.json', 'workflow-agent-tool-call-rendered.html'],
  ['sequence', 'cache-miss-request.sequence.json', 'sequence-cache-miss-request.html'],
  ['dataflow', 'product-analytics.dataflow.json', 'dataflow-product-analytics.html'],
  ['lifecycle', 'agent-run.lifecycle.json', 'lifecycle-agent-run.html'],
  ['architecture', 'web-app.architecture.json', 'web-app-rendered.html'],
];

for (const outputRoot of outputRoots) for (const [mode, input, output] of TARGETS) {
  execFileSync(process.execPath, [
    path.join(skillRoot, `renderers/${mode}/render-${mode}.mjs`),
    path.join(skillRoot, 'examples', input),
    path.join(outputRoot, output),
  ], { stdio: 'inherit' });
}

// The legacy architecture example carries the same authoritative Viewer blocks.
const repoExamples = path.resolve(skillRoot, '../examples');
if (outputRoots.includes(repoExamples)) {
  for (const [source,target] of [['web-app-rendered.html','web-app.html']]) {
    fs.copyFileSync(path.join(repoExamples, source), path.join(repoExamples, target));
  }
  for (const name of ['archify-repo','archify-repo-grid','maka-architecture','rag-pipeline']) {
    execFileSync(process.execPath, [path.join(skillRoot,'renderers/architecture/render-architecture.mjs'),path.join(repoExamples,name+'.architecture.json'),path.join(repoExamples,name+'.html')], {stdio:'inherit'});
  }
  execFileSync(process.execPath,[path.join(skillRoot,'bin/archify.mjs'),'compare','architecture',path.join(skillRoot,'examples/checkout-platform.base.architecture.json'),path.join(skillRoot,'examples/checkout-platform.head.architecture.json'),path.join(repoExamples,'checkout-platform-delta.html'),'--receipt',path.join(repoExamples,'checkout-platform-delta.receipt.json'),'--quality','showcase','--json'],{stdio:['ignore','ignore','inherit']});
}
