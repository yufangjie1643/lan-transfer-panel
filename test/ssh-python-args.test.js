import test from 'node:test';
import assert from 'node:assert/strict';

import { encodeSshPythonArg, encodeSshRemotePath } from '../lib/ssh-python-args.js';

test('encodes an empty SSH remote path as a non-empty root path argument', () => {
  const encoded = encodeSshRemotePath('');

  assert.notEqual(encoded, '');
  assert.equal(Buffer.from(encoded, 'base64').toString('utf8'), '.');
});

test('encodes non-empty SSH remote paths unchanged', () => {
  const encoded = encodeSshRemotePath('.codex/logs_2.sqlite');

  assert.equal(Buffer.from(encoded, 'base64').toString('utf8'), '.codex/logs_2.sqlite');
});

test('encodes normal SSH helper arguments as UTF-8 base64', () => {
  const encoded = encodeSshPythonArg('/home/yufan');

  assert.equal(Buffer.from(encoded, 'base64').toString('utf8'), '/home/yufan');
});
