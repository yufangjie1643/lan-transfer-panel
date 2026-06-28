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
          label: '本机面板 + 服务器 10.42.0.1',
          backendUrl: 'http://localhost:5590',
          username: 'rclone',
          password: 'loaded-secret'
        },
        {
          id: 'local-dev',
          label: '本机开发 127.0.0.1',
          backendUrl: 'http://localhost:5590',
          username: 'admin',
          password: ''
        },
        {
          id: 'custom',
          label: '自定义连接',
          backendUrl: '',
          username: '',
          password: ''
        }
      ]);
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
    if (command === 'start_virtual_download_drag') {
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
