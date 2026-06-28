import test from 'node:test';
import assert from 'node:assert/strict';

import { createFolderPlanCache } from '../lib/folder-plan-cache.js';

test('stores and consumes folder download plans by token', () => {
  const cache = createFolderPlanCache({ now: () => 1000, ttlMs: 5000 });
  const entry = {
    remote: 'server',
    remotePath: '.local',
    summary: { fileCount: 1 },
    plan: { strategy: 'files' },
  };

  const token = cache.put(entry);

  assert.match(token, /^[a-f0-9]{32}$/);
  assert.deepEqual(cache.take(token, { remote: 'server', remotePath: '.local' }), entry);
  assert.equal(cache.take(token, { remote: 'server', remotePath: '.local' }), null);
});

test('rejects folder download plan tokens for a different path', () => {
  const cache = createFolderPlanCache({ now: () => 1000, ttlMs: 5000 });
  const token = cache.put({
    remote: 'server',
    remotePath: '.local',
    summary: { fileCount: 1 },
    plan: { strategy: 'files' },
  });

  assert.equal(cache.take(token, { remote: 'server', remotePath: '.cache' }), null);
});

test('expires stale folder download plans', () => {
  let now = 1000;
  const cache = createFolderPlanCache({ now: () => now, ttlMs: 5000 });
  const token = cache.put({
    remote: 'server',
    remotePath: '.local',
    summary: { fileCount: 1 },
    plan: { strategy: 'files' },
  });

  now = 7001;

  assert.equal(cache.take(token, { remote: 'server', remotePath: '.local' }), null);
});
