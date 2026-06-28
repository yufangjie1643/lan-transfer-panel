import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSshArchiveScript } from '../lib/ssh-archive-script.js';

test('writes large archive file lists through stdin instead of python argv', () => {
  const files = Array.from({ length: 7000 }, (_, index) => ({
    RelPath: `sessions/2026/06/file-${index}.jsonl`,
  }));

  const script = buildSshArchiveScript({
    parentPath: '/home/yufan',
    folderName: '.codex',
    remotePath: '/tmp/.codex-test.tar',
    listPath: '/tmp/.codex-test.files',
    compression: 'none',
    files,
  });

  assert.match(script, /python3 -c/);
  assert.doesNotMatch(script, /python3\s+-c\s+'.*'\s+'[A-Za-z0-9+/=]{1000,}'/s);
  assert.match(script, /base64\.b64decode\(sys\.stdin\.read\(\)/);
  assert.match(script, /<<'ARCHIVE_LIST_BASE64'/);
});

test('dereferences linux symlinks when creating archives for windows extraction', () => {
  const script = buildSshArchiveScript({
    parentPath: '/home/yufan',
    folderName: '.local',
    remotePath: '/tmp/.local-test.tar',
    listPath: '/tmp/.local-test.files',
    compression: 'none',
    files: [{ RelPath: 'lib/python3-config' }],
  });

  assert.match(script, /tar .* --dereference /);
});

test('dereferences linux hardlinks when creating archives for windows extraction', () => {
  const script = buildSshArchiveScript({
    parentPath: '/home/yufan',
    folderName: '.local',
    remotePath: '/tmp/.local-test.tar',
    listPath: '/tmp/.local-test.files',
    compression: 'none',
    files: [{ RelPath: 'share/terminfo/p/prism12' }],
  });

  assert.match(script, /tar .* --hard-dereference /);
});
