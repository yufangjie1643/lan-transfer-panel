import test from 'node:test';
import assert from 'node:assert/strict';

import { getFolderDownloadWorkOrder } from '../lib/folder-download-order.js';

test('prioritizes the small-file archive before direct large-file downloads', () => {
  const order = getFolderDownloadWorkOrder({
    strategy: 'mixed',
    archive: { fileCount: 12 },
    direct: { fileCount: 3 },
  });

  assert.deepEqual(order, ['archive', 'direct']);
});

test('skips empty mixed download batches', () => {
  const order = getFolderDownloadWorkOrder({
    strategy: 'mixed',
    archive: { fileCount: 0 },
    direct: { fileCount: 2 },
  });

  assert.deepEqual(order, ['direct']);
});
