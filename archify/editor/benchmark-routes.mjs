#!/usr/bin/env node
// Reproducible HTTP-level route preview benchmark; never touches the input fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const fixture = process.argv[2];
const iterations = Number(process.argv[3] || 12);
if (!fixture || !fs.existsSync(fixture) || !Number.isSafeInteger(iterations)
  || iterations < 3 || iterations > 100) {
  console.error('用法: node editor/benchmark-routes.mjs <architecture.json> [iterations: 3..100]');
  process.exit(1);
}
const original = JSON.parse(fs.readFileSync(fixture, 'utf8'));
assert.equal(original.diagram_type, 'architecture');
assert.ok(original.connections.length > 0);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-route-benchmark-'));
const candidate = structuredClone(original);
candidate.meta.output = 'diagram.html';
fs.writeFileSync(path.join(directory, 'candidate.json'), JSON.stringify(candidate));
const server = spawn(process.execPath,
  [fileURLToPath(new URL('./serve.mjs', import.meta.url)), 'candidate.json'], {
    cwd: directory, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
let stdout = '', stderr = '';
server.stdout.on('data', chunk => { stdout += chunk.toString(); });
server.stderr.on('data', chunk => { stderr += chunk.toString(); });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitForUrl() {
  for (let i = 0; i < 180; i++) {
    const url = stdout.match(/http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{40}\//)?.[0];
    if (url) return url;
    if (server.exitCode !== null) throw Error('Editor server failed: ' + stderr);
    await sleep(100);
  }
  throw Error('Editor server start timed out: ' + stdout + stderr);
}
function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    samples: sorted.length,
    p50Ms: Math.round(sorted[Math.ceil(sorted.length * 0.5) - 1] * 10) / 10,
    p95Ms: Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1] * 10) / 10,
    maxMs: Math.round(sorted.at(-1) * 10) / 10,
  };
}
try {
  const base = await waitForUrl();
  const origin = new URL(base).origin;
  async function preview(next) {
    const started = performance.now();
    const response = await fetch(base + 'api/routes', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json', 'x-archify-editor': '1' },
      body: JSON.stringify(next),
    });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.source, 'archify-render');
    assert.equal(result.edges.length, next.connections.length);
    return performance.now() - started;
  }
  const coldFirstMs = await preview(candidate);
  const repeated = [];
  for (let i = 0; i < iterations; i++) repeated.push(await preview(candidate));
  const distinct = [];
  for (let i = 0; i < iterations; i++) {
    const next = structuredClone(candidate);
    next.meta.title = candidate.meta.title + ' · bench-' + i;
    distinct.push(await preview(next));
  }
  const concurrentCandidate = structuredClone(candidate);
  concurrentCandidate.meta.title += ' · concurrent';
  const started = performance.now();
  const sameKeyConcurrent = await Promise.all(
    Array.from({ length: 4 }, () => preview(concurrentCandidate)));
  const concurrentWallMs = performance.now() - started;
  const responsiveCandidate = structuredClone(candidate);
  responsiveCandidate.meta.title += ' · responsive';
  const inFlight = preview(responsiveCandidate);
  // Give the server time to enter its renderer; otherwise GET can race ahead
  // of the POST and falsely make a synchronous renderer appear responsive.
  await sleep(40);
  const pingStarted = performance.now();
  const specResponse = await fetch(base + 'api/spec');
  assert.equal(specResponse.status, 200);
  const specDuringRouteMs = performance.now() - pingStarted;
  await inFlight;
  assert.equal(fs.readFileSync(path.join(directory, 'candidate.json'), 'utf8'),
    JSON.stringify(candidate), 'Benchmark must not mutate candidate');
  console.log(JSON.stringify({
    benchmark: 'archify-route-preview-http-v1',
    date: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    fixture: path.basename(fixture),
    nodes: candidate.components.length,
    edges: candidate.connections.length,
    iterations,
    coldFirstMs: Math.round(coldFirstMs * 10) / 10,
    repeated: stats(repeated),
    distinct: stats(distinct),
    sameKeyConcurrent: {
      requests: sameKeyConcurrent.length,
      wallMs: Math.round(concurrentWallMs * 10) / 10,
    },
    specDuringRouteMs: Math.round(specDuringRouteMs * 10) / 10,
  }, null, 2));
} finally {
  server.kill();
  if (server.exitCode === null) await Promise.race([
    new Promise(resolve => server.once('exit', resolve)), sleep(2000),
  ]);
  try { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 }); }
  catch (error) { console.warn('Benchmark temporary directory retained: ' + error.message); }
}
