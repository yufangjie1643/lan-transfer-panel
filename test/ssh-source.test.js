import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPythonRangeServeScript,
  buildRcloneServeArgs,
  buildSshTunnelArgs,
  buildSshServedFileDownload,
} from '../lib/ssh-source.js';

test('builds an ssh tunnel to a server-side rclone serve port', () => {
  assert.deepEqual(
    buildSshTunnelArgs({
      host: 'yufanssh',
      localPort: 19001,
      remotePort: 18765,
    }),
    [
      '-o',
      'BatchMode=yes',
      '-N',
      '-L',
      '127.0.0.1:19001:127.0.0.1:18765',
      'yufanssh',
    ],
  );
});

test('builds server-side rclone serve args for a directory', () => {
  assert.deepEqual(
    buildRcloneServeArgs({
      directory: '/home/yufan/.codex',
      port: 18765,
    }),
    [
      'serve',
      'http',
      '/home/yufan/.codex',
      '--addr',
      '127.0.0.1:18765',
      '--read-only',
      '--dir-cache-time',
      '30s',
      '--server-read-timeout',
      '24h',
      '--server-write-timeout',
      '24h',
    ],
  );
});

test('builds a local aria2 request for a file served from the ssh tunnel', () => {
  const request = buildSshServedFileDownload({
    stat: {
      Name: 'logs 2.sqlite',
      ParentPath: '/home/yufan/.codex',
    },
    localPort: 19001,
  });

  assert.equal(request.url, 'http://127.0.0.1:19001/logs%202.sqlite');
  assert.equal(request.serveDirectory, '/home/yufan/.codex');
  assert.equal(request.options.out, 'logs 2.sqlite');
});

test('builds a server-side python range helper startup script', () => {
  const script = buildPythonRangeServeScript({
    helperPath: '/tmp/ltp-helper.py',
    directory: '/home/yufan/.codex',
    port: 18765,
    logPath: '/tmp/ltp-helper.log',
  });

  assert.match(script, /Accept-Ranges/);
  assert.match(script, /nohup python3/);
  assert.match(script, /home\/yufan\/\.codex/);
  assert.match(script, /18765/);
});
