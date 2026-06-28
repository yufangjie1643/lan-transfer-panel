import test from 'node:test';
import assert from 'node:assert/strict';

import {
  chooseFolderDownloadPlan,
  folderArchiveThresholds,
} from '../lib/folder-plan.js';

test('downloads small files directly when there are 10 or fewer small files', () => {
  assert.deepEqual(
    chooseFolderDownloadPlan({
      files: [
        ...Array.from({ length: 10 }, (_, index) => ({
          RelPath: `small-${index}.txt`,
          Size: folderArchiveThresholds.smallFileBytes - 1,
        })),
        { RelPath: 'video.bin', Size: folderArchiveThresholds.smallFileBytes },
      ],
    }),
    {
      strategy: 'files',
      requiresConfirmation: true,
      smallFileBytes: folderArchiveThresholds.smallFileBytes,
      minSmallFilesToArchive: folderArchiveThresholds.minSmallFilesToArchive,
      archive: {
        fileCount: 0,
        totalSize: 0,
        files: [],
      },
      direct: {
        fileCount: 11,
        totalSize: 10 * (folderArchiveThresholds.smallFileBytes - 1) + folderArchiveThresholds.smallFileBytes,
        files: [
          ...Array.from({ length: 10 }, (_, index) => ({
            RelPath: `small-${index}.txt`,
            Size: folderArchiveThresholds.smallFileBytes - 1,
          })),
          { RelPath: 'video.bin', Size: folderArchiveThresholds.smallFileBytes },
        ],
      },
      compressionSelectable: false,
    },
  );
});

test('archives small files only when there are more than 10', () => {
  const plan = chooseFolderDownloadPlan({
    files: Array.from({ length: 11 }, (_, index) => ({
      RelPath: `small-${index}.txt`,
      Size: 12,
    })),
  });

  assert.equal(plan.strategy, 'archive-small-files');
  assert.equal(plan.requiresConfirmation, true);
  assert.equal(plan.compressionSelectable, false);
  assert.equal(plan.archive.fileCount, 11);
  assert.deepEqual(plan.direct.files, []);
});

test('downloads all files greater than or equal to 1MB directly', () => {
  const plan = chooseFolderDownloadPlan({
    files: [
      { RelPath: 'large-a.bin', Size: folderArchiveThresholds.smallFileBytes },
      { RelPath: 'large-b.bin', Size: folderArchiveThresholds.smallFileBytes + 1 },
    ],
  });

  assert.equal(plan.strategy, 'files');
  assert.equal(plan.requiresConfirmation, true);
  assert.equal(plan.compressionSelectable, false);
  assert.deepEqual(plan.archive.files, []);
  assert.deepEqual(plan.direct.files.map((file) => file.RelPath), ['large-a.bin', 'large-b.bin']);
});

test('uses the configured small file threshold', () => {
  const plan = chooseFolderDownloadPlan({
    files: [
      ...Array.from({ length: 11 }, (_, index) => ({ RelPath: `small-${index}.dat`, Size: 99 })),
      { RelPath: 'large.dat', Size: 100 },
    ],
  }, { smallFileBytes: 100, minSmallFilesToArchive: 10 });

  assert.equal(plan.strategy, 'mixed');
  assert.equal(plan.archive.fileCount, 11);
  assert.deepEqual(plan.direct.files.map((file) => file.RelPath), ['large.dat']);
});

test('marks truncated summaries as requiring a full listing', () => {
  const plan = chooseFolderDownloadPlan({
    files: [{ RelPath: 'a.txt', Size: 12 }],
    filesTruncated: true,
  });

  assert.equal(plan.strategy, 'unavailable');
  assert.equal(plan.requiresFullListing, true);
});
