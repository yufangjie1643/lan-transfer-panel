import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSshRemotePath } from '../lib/ssh-paths.js';

test('keeps absolute server paths for ssh browsing', () => {
  assert.equal(
    normalizeSshRemotePath('/mnt/tipro4t/data/OTB99/OTB_query_train'),
    '/mnt/tipro4t/data/OTB99/OTB_query_train',
  );
  assert.equal(
    normalizeSshRemotePath('/home/yufan/yfj_home_from_wsl/vit-texgen/'),
    '/home/yufan/yfj_home_from_wsl/vit-texgen',
  );
});

test('normalizes relative ssh paths under the configured ssh root', () => {
  assert.equal(normalizeSshRemotePath('yfj_home_from_wsl//vit-texgen'), 'yfj_home_from_wsl/vit-texgen');
});

test('rejects ssh paths that traverse upward', () => {
  assert.throws(() => normalizeSshRemotePath('../etc/passwd'), /路径不合法/);
  assert.throws(() => normalizeSshRemotePath('/mnt/tipro4t/../secret'), /路径不合法/);
});
