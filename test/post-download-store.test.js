import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import {
  loadPostDownloadJobs,
  savePostDownloadJobs,
} from '../lib/post-download-store.js';

test('persists post-download archive jobs and restores them as waiting jobs', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'lan-transfer-post-jobs-test-'));
  const storePath = path.join(tempDir, 'jobs.json');

  try {
    const jobs = new Map([
      [
        'gid-archive',
        {
          type: 'extract-archive',
          gid: 'gid-archive',
          archiveFileName: '.codex-small.tar',
          remoteArchivePath: '/tmp/.codex-small.tar',
          extractDir: 'D:\\Downloads',
          createdAt: 123,
          status: 'running',
        },
      ],
    ]);

    await savePostDownloadJobs(storePath, jobs);
    assert.match(await readFile(storePath, 'utf8'), /gid-archive/);

    const restored = await loadPostDownloadJobs(storePath);
    assert.deepEqual(restored.get('gid-archive'), {
      type: 'extract-archive',
      gid: 'gid-archive',
      archiveFileName: '.codex-small.tar',
      remoteArchivePath: '/tmp/.codex-small.tar',
      extractDir: 'D:\\Downloads',
      createdAt: 123,
      status: 'waiting',
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('preserves failed post-download archive jobs when saving', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'lan-transfer-post-jobs-test-'));
  const storePath = path.join(tempDir, 'jobs.json');

  try {
    const jobs = new Map([
      [
        'gid-failed-archive',
        {
          type: 'extract-archive',
          gid: 'gid-failed-archive',
          archiveFileName: '.local-small.tar',
          remoteArchivePath: '/tmp/.local-small.tar',
          extractDir: 'D:\\Downloads',
          createdAt: 456,
          status: 'error',
          errorMessage: 'tar extraction failed',
        },
      ],
    ]);

    await savePostDownloadJobs(storePath, jobs);

    const restored = await loadPostDownloadJobs(storePath);
    assert.deepEqual(restored.get('gid-failed-archive'), {
      type: 'extract-archive',
      gid: 'gid-failed-archive',
      archiveFileName: '.local-small.tar',
      remoteArchivePath: '/tmp/.local-small.tar',
      extractDir: 'D:\\Downloads',
      createdAt: 456,
      status: 'error',
      errorMessage: 'tar extraction failed',
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('does not preserve stale error messages on restored waiting jobs', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'lan-transfer-post-jobs-test-'));
  const storePath = path.join(tempDir, 'jobs.json');

  try {
    const jobs = new Map([
      [
        'gid-running-archive',
        {
          type: 'extract-archive',
          gid: 'gid-running-archive',
          archiveFileName: '.local-small.tar',
          remoteArchivePath: '/tmp/.local-small.tar',
          extractDir: 'D:\\Downloads',
          createdAt: 789,
          status: 'running',
          errorMessage: 'stale extraction failure',
        },
      ],
    ]);

    await savePostDownloadJobs(storePath, jobs);

    const restored = await loadPostDownloadJobs(storePath);
    assert.deepEqual(restored.get('gid-running-archive'), {
      type: 'extract-archive',
      gid: 'gid-running-archive',
      archiveFileName: '.local-small.tar',
      remoteArchivePath: '/tmp/.local-small.tar',
      extractDir: 'D:\\Downloads',
      createdAt: 789,
      status: 'waiting',
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
