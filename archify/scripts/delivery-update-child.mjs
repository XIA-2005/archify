#!/usr/bin/env node

import { checkForUpdate } from './check-update.mjs';

// The parent can be busy in synchronous renderer work. Enforce its original
// deadline here, in a separate event loop, so cache work cannot continue late.
if (!/^\d{1,30}$/.test(process.argv[2] || '')) process.exit(1);
const deadlineAt = BigInt(process.argv[2]);
const remainingMs = Number(deadlineAt - process.hrtime.bigint()) / 1_000_000;
if (remainingMs <= 0) process.exit(1);
const deadlineTimer = setTimeout(() => process.kill(process.pid, 'SIGKILL'), remainingMs);
deadlineTimer.unref();

// Cache preparation also uses the service budget. Abort the network against
// the absolute deadline so its timeout cannot consume the time needed to
// commit the failure/backoff state afterwards.
const reserveMs = Math.max(150, remainingMs * 0.4);
const networkController = new AbortController();
const networkTimer = setTimeout(() => networkController.abort(), Math.max(1, remainingMs - reserveMs));
networkTimer.unref();
const networkCleanups = [];
const fetchWithinDeadline = (url, options) => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal.addEventListener('abort', abort, { once: true });
  networkController.signal.addEventListener('abort', abort, { once: true });
  if (options.signal.aborted || networkController.signal.aborted) controller.abort();
  if (controller.signal.aborted) {
    options.signal.removeEventListener('abort', abort);
    networkController.signal.removeEventListener('abort', abort);
    return Promise.reject(new Error('update check network deadline elapsed'));
  }
  networkCleanups.push(() => {
    options.signal.removeEventListener('abort', abort);
    networkController.signal.removeEventListener('abort', abort);
  });
  return Promise.resolve().then(() => globalThis.fetch(url, { ...options, signal: controller.signal }));
};

const result = await checkForUpdate({
  fetchImpl: typeof globalThis.fetch === 'function' ? fetchWithinDeadline : globalThis.fetch,
  ...(process.env.ARCHIFY_UPDATE_RELEASE_PATH
    ? { releasePath: process.env.ARCHIFY_UPDATE_RELEASE_PATH } : {}),
  ...(process.env.ARCHIFY_UPDATE_CACHE_DIRECTORY
    ? { cacheDirectory: process.env.ARCHIFY_UPDATE_CACHE_DIRECTORY } : {}),
  // Leave time to record a failed fetch, so a slow network backs off instead
  // of being killed before its result reaches the cache.
  timeoutMs: Math.max(1, Math.floor(remainingMs - 150)),
});
clearTimeout(networkTimer);
networkCleanups.forEach(cleanup => cleanup());
process.stdout.write(`${JSON.stringify(result)}\n`);
