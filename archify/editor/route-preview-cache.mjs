// Session-local cache and bounded async queue for the *official* Archify renderer.
// This module never calculates a route; it only schedules/caches verified SVG results.
import { createHash } from 'node:crypto';

const aborted = () => Object.assign(new Error('预览已取消'), { name: 'AbortError' });

export function createRoutePreviewPipeline(render, {
  maxEntries = 32, maxConcurrent = 2, maxQueued = 12,
} = {}) {
  const cache = new Map();
  const pending = new Map();
  const queue = [];
  let active = 0;
  const envelope = value => Array.isArray(value) ? { edges: value } : value;

  function pump() {
    while (active < maxConcurrent && queue.length) {
      const job = queue.shift();
      if (job.controller.signal.aborted) {
        if (pending.get(job.key) === job) pending.delete(job.key);
        job.reject(aborted());
        continue;
      }
      active++;
      Promise.resolve().then(() => render(job.candidate, { signal: job.controller.signal }))
        .then(edges => {
          if (job.controller.signal.aborted) throw aborted();
          cache.delete(job.key);
          cache.set(job.key, edges);
          if (cache.size > maxEntries) cache.delete(cache.keys().next().value);
          job.resolve(edges);
        }, error => job.reject(error))
        .catch(error => job.reject(error))
        .finally(() => {
          if (pending.get(job.key) === job) pending.delete(job.key);
          active--;
          pump();
        });
    }
  }

  function get(candidate, { signal } = {}) {
    if (signal?.aborted) return Promise.reject(aborted());
    const key = createHash('sha256').update(JSON.stringify(candidate)).digest('hex');
    if (cache.has(key)) {
      const edges = cache.get(key);
      cache.delete(key);
      cache.set(key, edges);
      return Promise.resolve({ ...envelope(edges), cache: 'hit' });
    }
    let job = pending.get(key);
    const source = job ? 'shared' : 'miss';
    if (!job) {
      if (queue.length >= maxQueued) {
        return Promise.reject(Object.assign(new Error('路由预览繁忙，请稍候重试'), {
          code: 'PREVIEW_BUSY',
        }));
      }
      job = { key, candidate, controller: new AbortController(), waiters: 0 };
      job.promise = new Promise((resolve, reject) => {
        job.resolve = resolve;
        job.reject = reject;
      });
      pending.set(key, job);
      queue.push(job);
    }
    const current = job;
    const result = new Promise((resolve, reject) => {
      current.waiters++;
      let finished = false;
      const finish = (callback, value) => {
        if (finished) return;
        finished = true;
        signal?.removeEventListener('abort', onAbort);
        current.waiters--;
        callback(value);
      };
      const onAbort = () => {
        finish(reject, aborted());
        if (current.waiters === 0) {
          current.controller.abort();
          if (pending.get(current.key) === current) pending.delete(current.key);
        }
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      current.promise.then(
        edges => finish(resolve, { ...envelope(edges), cache: source }),
        error => finish(reject, error),
      );
      if (signal?.aborted) onAbort();
    });
    pump();
    return result;
  }

  return { get };
}
