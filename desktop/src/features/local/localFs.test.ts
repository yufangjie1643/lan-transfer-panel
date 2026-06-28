import { describe, expect, it, vi } from 'vitest';
import {
  collectUploadEntries,
  listLocalDirectory,
  listLocalRoots,
  startVirtualDownloadDrag
} from './localFs';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn((command: string) => {
    if (command === 'list_local_roots') {
      return Promise.resolve([{ path: 'C:\\', name: 'C:' }]);
    }
    if (command === 'collect_upload_entries') {
      return Promise.resolve([
        { sourcePath: 'C:\\Temp\\file.txt', relativePath: 'file.txt', isDir: false }
      ]);
    }
    if (command === 'start_virtual_download_drag') {
      return Promise.resolve();
    }
    return Promise.resolve([{ path: 'C:\\Temp\\file.txt', name: 'file.txt', isDir: false, size: 4 }]);
  })
}));

describe('localFs', () => {
  it('lists local roots through Tauri invoke', async () => {
    const roots = await listLocalRoots();

    expect(invoke).toHaveBeenCalledWith('list_local_roots');
    expect(roots[0].name).toBe('C:');
  });

  it('lists local directories through Tauri invoke', async () => {
    const items = await listLocalDirectory('C:\\Temp');

    expect(invoke).toHaveBeenCalledWith('list_local_directory', { path: 'C:\\Temp' });
    expect(items[0].name).toBe('file.txt');
  });

  it('collects upload entries through Tauri invoke', async () => {
    const entries = await collectUploadEntries(['C:\\Temp\\file.txt']);

    expect(invoke).toHaveBeenCalledWith('collect_upload_entries', {
      paths: ['C:\\Temp\\file.txt']
    });
    expect(entries[0].relativePath).toBe('file.txt');
  });

  it('starts a virtual download drag through Tauri invoke', async () => {
    await startVirtualDownloadDrag(
      'file.txt',
      '/home/yufan/file.txt',
      'http://localhost:5590/api/download?downloadToken=abc',
      12
    );

    expect(invoke).toHaveBeenCalledWith('start_virtual_download_drag', {
      name: 'file.txt',
      remotePath: '/home/yufan/file.txt',
      downloadUrl: 'http://localhost:5590/api/download?downloadToken=abc',
      size: 12
    });
  });
});
