import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLocalAria2Download } from '../lib/aria2-download.js';

test('builds an aria2 request for a served remote file', () => {
  const request = buildLocalAria2Download({
    servedOrigin: 'http://ltp:secret@127.0.0.1:18765/',
    remotePath: 'logs/archive 01.sqlite',
    item: { Name: 'archive 01.sqlite' },
  });

  assert.equal(request.url, 'http://ltp:secret@127.0.0.1:18765/logs/archive%2001.sqlite');
  assert.deepEqual(request.params, [
    [request.url],
    {
      out: 'archive 01.sqlite',
      continue: 'true',
      split: '16',
      'max-connection-per-server': '16',
      'min-split-size': '20M',
      'auto-file-renaming': 'false',
      'allow-overwrite': 'false',
    },
  ]);
});

test('adds a target directory only when one is provided', () => {
  const request = buildLocalAria2Download({
    servedOrigin: 'http://127.0.0.1:18080',
    remotePath: 'video.mkv',
    item: { Name: 'video.mkv' },
    dir: 'D:\\download',
  });

  assert.equal(request.options.dir, 'D:\\download');
});

test('sanitizes unsafe output names', () => {
  const request = buildLocalAria2Download({
    servedOrigin: 'http://127.0.0.1:18080',
    remotePath: 'bad/name.txt',
    item: { Name: 'bad:name?.txt' },
  });

  assert.equal(request.options.out, 'bad_name_.txt');
});

test('preserves hidden file names for aria2 output', () => {
  const request = buildLocalAria2Download({
    servedOrigin: 'http://127.0.0.1:18080',
    remotePath: '.bash_history',
    item: { Name: '.bash_history' },
  });

  assert.equal(request.options.out, '.bash_history');
});
