import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn((command: string) => {
    if (command === 'list_local_roots') {
      return Promise.resolve([{ path: 'C:\\', name: 'C:' }]);
    }
    if (command === 'list_connection_profiles') {
      return Promise.resolve([
        {
          id: 'server-10-42-0-1',
          label: 'yufanssh',
          host: '10.42.0.1',
          port: 2687,
          username: 'yufan',
          authMethod: 'key',
          privateKeyPath: 'C:\\Users\\admin\\.ssh\\id_ed25519_local',
          password: '',
          saveCredential: false
        }
      ]);
    }
    if (command === 'save_connection_profile') {
      return Promise.resolve([]);
    }
    if (command === 'delete_connection_profile') {
      return Promise.resolve([]);
    }
    if (command === 'test_ssh_connection') {
      return Promise.resolve('/home/yufan');
    }
    if (command === 'list_ssh_directory') {
      return Promise.resolve({
        path: '/home/yufan',
        list: [
          { Path: '/home/yufan/.codex', Name: '.codex', IsDir: true },
          { Path: '/home/yufan/logs_2.sqlite', Name: 'logs_2.sqlite', IsDir: false, Size: 2048 }
        ]
      });
    }
    if (command === 'list_local_directory') {
      return Promise.resolve([]);
    }
    if (command === 'collect_upload_entries') {
      return Promise.resolve([]);
    }
    if (command === 'select_download_directory') {
      return Promise.resolve('D:\\download');
    }
    if (command === 'select_upload_files') {
      return Promise.resolve(null);
    }
    if (command === 'upload_ssh_entries') {
      return Promise.resolve([]);
    }
    if (command === 'download_ssh_file') {
      return Promise.resolve('D:\\download');
    }
    if (command === 'download_ssh_folder') {
      return Promise.resolve('D:\\download');
    }
    if (command === 'prepare_ssh_virtual_file') {
      return Promise.resolve('D:\\Temp\\lan-transfer-virtual-drag\\logs_2.sqlite');
    }
    if (command === 'start_virtual_file_drag') {
      return Promise.resolve();
    }
    if (command === 'start_ssh_download_task') {
      return Promise.resolve('ssh-1-logs_2.sqlite');
    }
    if (command === 'start_ssh_aria2_download') {
      return Promise.resolve(['aria2-gid-001']);
    }
    if (command === 'get_aria2_config') {
      return Promise.resolve({ rpcUrl: 'http://127.0.0.1:6800/jsonrpc', rpcSecret: '', defaultDir: '' });
    }
    if (command === 'save_aria2_config') {
      return Promise.resolve();
    }
    if (command === 'list_transfer_tasks') {
      return Promise.resolve({
        globalStat: {},
        active: [
          {
            gid: 'ssh-1-logs_2.sqlite',
            status: 'active',
            completedLength: '0',
            totalLength: '2048',
            downloadSpeed: '0'
          }
        ],
        waiting: [],
        stopped: []
      });
    }
    if (command === 'control_transfer_task') {
      return Promise.resolve();
    }
    return Promise.reject(new Error(`Unexpected Tauri command: ${command}`));
  })
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: vi.fn().mockImplementation(() => ({
    once: vi.fn(),
    setFocus: vi.fn()
  }))
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
