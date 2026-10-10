#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRoutePreviewPipeline } from './route-preview-cache.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const candidate = id => ({ id });
let tests = 0;
function pass(name) { tests++; console.log('PASS: ' + name); }

{
  let calls = 0;
  const pipeline = createRoutePreviewPipeline(async c => { calls++; return [c.id]; });
  assert.deepEqual(await pipeline.get(candidate('a')), { edges: ['a'], cache: 'miss' });
  assert.deepEqual(await pipeline.get(candidate('a')), { edges: ['a'], cache: 'hit' });
  assert.equal(calls, 1);
  pass('identical candidates hit the bounded official-result cache');
}
{
  let calls = 0;
  const pipeline = createRoutePreviewPipeline(async c => {
    calls++;
    await sleep(30);
    return [c.id];
  });
  const results = await Promise.all(Array.from({ length: 4 }, () => pipeline.get(candidate('b'))));
  assert.equal(calls, 1);
  assert.equal(results[0].cache, 'miss');
  assert.ok(results.slice(1).every(r => r.cache === 'shared'));
  pass('concurrent identical requests share one renderer invocation');
}
{
  let calls = 0;
  const pipeline = createRoutePreviewPipeline(async c => { calls++; return [c.id]; },
    { maxEntries: 2 });
  await pipeline.get(candidate('a'));
  await pipeline.get(candidate('b'));
  await pipeline.get(candidate('a'));
  await pipeline.get(candidate('c'));
  assert.equal((await pipeline.get(candidate('b'))).cache, 'miss');
  assert.equal(calls, 4);
  pass('LRU evicts the least recently used entry');
}
{
  let active = 0, peak = 0;
  const pipeline = createRoutePreviewPipeline(async c => {
    active++;
    peak = Math.max(peak, active);
    await sleep(25);
    active--;
    return [c.id];
  }, { maxConcurrent: 2 });
  await Promise.all(Array.from({ length: 6 }, (_, i) => pipeline.get(candidate(i))));
  assert.equal(peak, 2);
  pass('bounded concurrency protects the local renderer');
}
{
  let release;
  const pipeline = createRoutePreviewPipeline(async c => {
    if (c.id === 'first') await new Promise(resolve => { release = resolve; });
    return [c.id];
  }, { maxConcurrent: 1, maxQueued: 1 });
  const first = pipeline.get(candidate('first'));
  await sleep(0);
  assert.equal(typeof release, 'function');
  const second = pipeline.get(candidate('second'));
  await assert.rejects(pipeline.get(candidate('overflow')), { code: 'PREVIEW_BUSY' });
  release();
  assert.equal((await first).cache, 'miss');
  assert.equal((await second).cache, 'miss');
  pass('bounded queue rejects overload without losing accepted work');
}
{
  let calls = 0;
  const pipeline = createRoutePreviewPipeline(async c => {
    calls++;
    await sleep(30);
    return [c.id];
  });
  const first = new AbortController();
  const second = new AbortController();
  const rejected = pipeline.get(candidate('shared'), { signal: first.signal });
  const surviving = pipeline.get(candidate('shared'), { signal: second.signal });
  first.abort();
  await assert.rejects(rejected, { name: 'AbortError' });
  assert.equal((await surviving).cache, 'shared');
  assert.equal(calls, 1);
  pass('aborting one subscriber does not cancel other subscribers');
}
{
  let calls = 0;
  const pipeline = createRoutePreviewPipeline(async (c, { signal }) => {
    calls++;
    await sleep(30);
    if (signal.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
    return [c.id];
  });
  const controller = new AbortController();
  const rejected = pipeline.get(candidate('cancelled'), { signal: controller.signal });
  controller.abort();
  await assert.rejects(rejected, { name: 'AbortError' });
  assert.equal((await pipeline.get(candidate('cancelled'))).cache, 'miss');
  assert.ok(calls >= 1);
  pass('fully aborted jobs are never cached and may be retried');
}
{
  let calls = 0;
  const pipeline = createRoutePreviewPipeline(async c => {
    if (++calls === 1) throw new Error('official render failed');
    return [c.id];
  });
  await assert.rejects(pipeline.get(candidate('retry')), /official render failed/);
  assert.equal((await pipeline.get(candidate('retry'))).cache, 'miss');
  assert.equal(calls, 2);
  pass('failed official render is never presented as a cached success');
}
console.log('ALL_PIPELINE_TESTS_PASS: ' + tests);
