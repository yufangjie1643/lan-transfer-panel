import test from 'node:test';
import assert from 'node:assert/strict';

import { publicFolderPlan } from '../lib/public-folder-plan.js';

test('omits internal file lists from folder plans returned to clients', () => {
  const plan = publicFolderPlan({
    strategy: 'mixed',
    requiresConfirmation: true,
    smallFileBytes: 1048576,
    minSmallFilesToArchive: 10,
    compressionSelectable: false,
    archive: { fileCount: 2, totalSize: 22, files: [{ RelPath: 'a' }] },
    direct: { fileCount: 1, totalSize: 1048576, files: [{ RelPath: 'b' }] },
  });

  assert.deepEqual(plan, {
    strategy: 'mixed',
    requiresConfirmation: true,
    smallFileBytes: 1048576,
    minSmallFilesToArchive: 10,
    compressionSelectable: false,
    archive: { fileCount: 2, totalSize: 22 },
    direct: { fileCount: 1, totalSize: 1048576 },
  });
});
