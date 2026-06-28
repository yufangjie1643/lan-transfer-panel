import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCorsHeaders } from '../lib/cors.js';

test('allows Vite dev origin with credentialed CORS headers', () => {
  const headers = buildCorsHeaders('http://localhost:1420');

  assert.equal(headers['Access-Control-Allow-Origin'], 'http://localhost:1420');
  assert.equal(headers['Access-Control-Allow-Credentials'], 'true');
  assert.match(headers['Access-Control-Allow-Methods'], /OPTIONS/);
  assert.match(headers['Access-Control-Allow-Headers'], /content-type/);
});

test('allows Tauri production origin', () => {
  const headers = buildCorsHeaders('http://tauri.localhost');

  assert.equal(headers['Access-Control-Allow-Origin'], 'http://tauri.localhost');
});

test('does not emit CORS headers for unknown origins', () => {
  assert.deepEqual(buildCorsHeaders('https://example.com'), {});
});
