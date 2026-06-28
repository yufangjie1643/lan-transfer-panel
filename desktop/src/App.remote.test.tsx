import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useAppStore } from './state/useAppStore';

describe('remote browsing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useAppStore.setState({
      backendUrl: 'http://localhost:5590',
      sessionUsername: null,
      remotes: [],
      remote: '',
      remotePath: '',
      remoteItems: [],
      selectedRemoteKeys: new Set(),
      error: null
    });
  });

  it('loads remotes and the root directory after login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/login')) return json({ ok: true, username: 'admin' });
        if (url.endsWith('/api/remotes')) return json({ remotes: ['server'] });
        if (url.includes('/api/list')) {
          return json({
            remote: 'server',
            path: '',
            list: [{ Path: 'logs', Name: 'logs', IsDir: true }]
          });
        }
        return json({ ok: true });
      })
    );

    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('用户名')).toHaveValue('rclone'));
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    await waitFor(() => expect(screen.getAllByText('logs')).toHaveLength(2));
    const remoteTree = screen.getByRole('tree', { name: '远端目录树' });
    expect(within(remoteTree).getByRole('treeitem', { name: 'server:' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(within(remoteTree).getByRole('treeitem', { name: 'logs' })).toBeInTheDocument();
    expect(screen.getByText('已连接：admin')).toBeInTheDocument();
    expect(screen.queryByText('本地文件')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '传输队列' })).not.toBeInTheDocument();
  });

  it('opens the transfer queue in a separate window', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/login')) return json({ ok: true, username: 'admin' });
        if (url.endsWith('/api/remotes')) return json({ remotes: ['server'] });
        if (url.includes('/api/list')) {
          return json({ remote: 'server', path: '', list: [] });
        }
        return json({ ok: true });
      })
    );

    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('用户名')).toHaveValue('rclone'));
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    await waitFor(() => expect(screen.getByText('已连接：admin')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '传输队列' }));

    expect(WebviewWindow).toHaveBeenCalledWith(
      'transfer-queue',
      expect.objectContaining({
        url: '/queue',
        title: '传输队列'
      })
    );
  });

  it('adds a remote file download to the selected local directory', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/login')) return json({ ok: true, username: 'admin' });
      if (url.endsWith('/api/remotes')) return json({ remotes: ['server'] });
      if (url.includes('/api/list')) {
        return json({
          remote: 'server',
          path: '',
          list: [{ Path: 'logs/a.txt', Name: 'a.txt', IsDir: false, Size: 12 }]
        });
      }
      if (url.endsWith('/api/downloads/add-remote')) {
        return json({ ok: true, gid: 'gid-1' });
      }
      return json({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('用户名')).toHaveValue('rclone'));
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    await waitFor(() => expect(screen.getByText('a.txt')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '下载到... a.txt' }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('select_download_directory');
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:5590/api/downloads/add-remote',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ remote: 'server', path: 'logs/a.txt', dir: 'D:\\download' })
        })
      );
    });
  });

  it('uses native virtual drag for files and managed download for folders', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/login')) return json({ ok: true, username: 'admin' });
      if (url.endsWith('/api/session')) return json({ ok: true, username: 'admin', sshRoot: '/home/yufan' });
      if (url.endsWith('/api/remotes')) return json({ remotes: ['server'] });
      if (url.includes('/api/list')) {
        return json({
          remote: 'server',
          path: '',
          list: [
            { Path: '/mnt/tipro4t/data/OTB99/OTB_query_train/Ironman.txt', Name: 'Ironman.txt', IsDir: false, Size: 12 },
            { Path: '/mnt/tipro4t/data/OTB99/OTB_query_train/test', Name: 'test', IsDir: true }
          ]
        });
      }
      if (url.endsWith('/api/downloads/add-remote')) {
        return json({ ok: true, gid: 'gid-drag-file' });
      }
      if (url.endsWith('/api/virtual-drag-token')) {
        return json({ ok: true, token: 'drag-token', expiresAt: '2026-06-28T00:00:00.000Z' });
      }
      return json({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);
    const dataTransfer = {
      effectAllowed: '',
      setData: vi.fn()
    };

    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('用户名')).toHaveValue('rclone'));
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    const row = (await screen.findByText('Ironman.txt')).closest('.file-row');
    fireEvent.mouseDown(row!, { button: 0 });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:5590/api/virtual-drag-token',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            remote: 'server',
            path: '/mnt/tipro4t/data/OTB99/OTB_query_train/Ironman.txt'
          })
        })
      );
    });
    fireEvent.dragStart(row!, { dataTransfer });
    fireEvent.dragEnd(row!, { dataTransfer: { dropEffect: 'none' } });

    expect(dataTransfer.effectAllowed).toBe('');
    expect(dataTransfer.setData).not.toHaveBeenCalled();
    expect(dataTransfer.setData).not.toHaveBeenCalledWith('DownloadURL', expect.any(String));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('start_virtual_download_drag', {
      name: 'Ironman.txt',
      remotePath: '/mnt/tipro4t/data/OTB99/OTB_query_train/Ironman.txt',
      downloadUrl: 'http://localhost:5590/api/download?downloadToken=drag-token',
      size: 12
    }));
    expect(fetchMock).not.toHaveBeenCalledWith(
      'http://localhost:5590/api/downloads/add-remote',
      expect.objectContaining({
        body: JSON.stringify({
          remote: 'server',
          path: '/mnt/tipro4t/data/OTB99/OTB_query_train/Ironman.txt',
          dir: 'D:\\download'
        })
      })
    );

    const folderTransfer = {
      effectAllowed: '',
      setData: vi.fn()
    };
    const folderRow = screen.getAllByText('test')
      .map((element) => element.closest('.file-row'))
      .find(Boolean);
    fireEvent.dragStart(folderRow!, { dataTransfer: folderTransfer });
    fireEvent.dragEnd(folderRow!);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:5590/api/downloads/add-remote',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            remote: 'server',
            path: '/mnt/tipro4t/data/OTB99/OTB_query_train/test',
            dir: 'D:\\download'
          })
        })
      );
    });
  });

  it('falls back to managed download when dragging large remote files', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/login')) return json({ ok: true, username: 'admin' });
      if (url.endsWith('/api/session')) return json({ ok: true, username: 'admin', sshRoot: '/home/yufan' });
      if (url.endsWith('/api/remotes')) return json({ remotes: ['server'] });
      if (url.includes('/api/list')) {
        return json({
          remote: 'server',
          path: '',
          list: [
            {
              Path: '/mnt/data/big.bin',
              Name: 'big.bin',
              IsDir: false,
              Size: 200 * 1024 * 1024
            }
          ]
        });
      }
      if (url.endsWith('/api/downloads/add-remote')) {
        return json({ ok: true, gid: 'gid-large-file' });
      }
      return json({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('用户名')).toHaveValue('rclone'));
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    const row = (await screen.findByText('big.bin')).closest('.file-row');
    fireEvent.mouseDown(row!, { button: 0 });
    fireEvent.dragStart(row!, { dataTransfer: { effectAllowed: '', setData: vi.fn() } });
    fireEvent.dragEnd(row!);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('select_download_directory');
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:5590/api/downloads/add-remote',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            remote: 'server',
            path: '/mnt/data/big.bin',
            dir: 'D:\\download'
          })
        })
      );
    });
    expect(invoke).not.toHaveBeenCalledWith(
      'start_virtual_download_drag',
      expect.anything()
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      'http://localhost:5590/api/virtual-drag-token',
      expect.anything()
    );
  });

  it('opens an entered absolute remote directory path', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/login')) return json({ ok: true, username: 'admin' });
      if (url.endsWith('/api/remotes')) return json({ remotes: ['server'] });
      if (url.includes('/api/list?remote=server&path=')) {
        const requestUrl = new URL(url);
        const path = requestUrl.searchParams.get('path') || '';
        if (path === '/mnt/tipro4t/data/OTB99/OTB_query_train') {
          return json({
            remote: 'server',
            path,
            list: [{ Path: `${path}/frame001.jpg`, Name: 'frame001.jpg', IsDir: false }]
          });
        }
        return json({ remote: 'server', path: '', list: [] });
      }
      return json({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('用户名')).toHaveValue('rclone'));
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    const pathInput = await screen.findByLabelText('远程路径');
    fireEvent.change(pathInput, {
      target: { value: '/mnt/tipro4t/data/OTB99/OTB_query_train' }
    });
    fireEvent.click(screen.getByRole('button', { name: '打开路径' }));

    await waitFor(() => {
      expect(screen.getByText('frame001.jpg')).toBeInTheDocument();
      expect(pathInput).toHaveValue('/mnt/tipro4t/data/OTB99/OTB_query_train');
    });
  });

  it('downloads an entered absolute remote file path when listing it as a directory fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/login')) return json({ ok: true, username: 'admin' });
      if (url.endsWith('/api/remotes')) return json({ remotes: ['server'] });
      if (url.includes('/api/list')) {
        const requestUrl = new URL(url);
        if (requestUrl.searchParams.get('path') === '/home/yufan/yfj_home_from_wsl/vit-texgen/report.txt') {
          return { ok: false, json: async () => ({ error: 'path is not a directory' }) } as Response;
        }
        return json({ remote: 'server', path: '', list: [] });
      }
      if (url.endsWith('/api/downloads/add-remote')) {
        return json({ ok: true, gid: 'gid-path-file' });
      }
      return json({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('用户名')).toHaveValue('rclone'));
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    const pathInput = await screen.findByLabelText('远程路径');
    fireEvent.change(pathInput, {
      target: { value: '/home/yufan/yfj_home_from_wsl/vit-texgen/report.txt' }
    });
    fireEvent.click(screen.getByRole('button', { name: '打开路径' }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('select_download_directory');
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:5590/api/downloads/add-remote',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            remote: 'server',
            path: '/home/yufan/yfj_home_from_wsl/vit-texgen/report.txt',
            dir: 'D:\\download'
          })
        })
      );
    });
  });

  it('confirms a remote folder download plan before adding mixed download tasks', async () => {
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmMock);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/login')) return json({ ok: true, username: 'admin' });
      if (url.endsWith('/api/remotes')) return json({ remotes: ['server'] });
      if (url.includes('/api/list')) {
        return json({
          remote: 'server',
          path: '',
          list: [{ Path: 'logs', Name: 'logs', IsDir: true }]
        });
      }
      if (url.endsWith('/api/downloads/add-remote')) {
        const body = JSON.parse(String(init?.body));
        if (body.confirmed) return json({ ok: true, route: 'ssh-folder-mixed', count: 3 });
        return json({
          ok: true,
          requiresConfirmation: true,
          strategy: 'mixed',
          plan: {
            strategy: 'mixed',
            smallFileBytes: 1048576,
            archive: { fileCount: 2, totalSize: 2048 },
            direct: { fileCount: 1, totalSize: 2097152 },
            compressionSelectable: false
          },
          summary: { name: 'logs', path: 'logs', fileCount: 3, dirCount: 1, totalSize: 2099200 }
        });
      }
      return json({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('用户名')).toHaveValue('rclone'));
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    await waitFor(() => expect(screen.getAllByText('logs')).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: '下载到... logs' }));

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(expect.stringContaining('文件数：3'));
      expect(confirmMock).toHaveBeenCalledWith(expect.stringContaining('小文件归档：2 个，2.0 KB'));
      expect(confirmMock).toHaveBeenCalledWith(expect.stringContaining('大文件直下：1 个，2.0 MB'));
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:5590/api/downloads/add-remote',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            remote: 'server',
            path: 'logs',
            dir: 'D:\\download',
            confirmed: true
          })
        })
      );
    });
  });

  it('does not send compression for mixed folder downloads', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/login')) return json({ ok: true, username: 'admin' });
      if (url.endsWith('/api/remotes')) return json({ remotes: ['server'] });
      if (url.includes('/api/list')) {
        return json({
          remote: 'server',
          path: '',
          list: [{ Path: 'dataset', Name: 'dataset', IsDir: true }]
        });
      }
      if (url.endsWith('/api/downloads/add-remote')) {
        const body = JSON.parse(String(init?.body));
        if (body.confirmed) return json({ ok: true, route: 'ssh-folder-mixed', gid: 'gid-archive' });
        return json({
          ok: true,
          requiresConfirmation: true,
          strategy: 'mixed',
          plan: {
            strategy: 'mixed',
            smallFileBytes: 1048576,
            archive: { fileCount: 11, totalSize: 8192 },
            direct: { fileCount: 1, totalSize: 2097152 },
            compressionSelectable: false
          },
          summary: { name: 'dataset', path: 'dataset', fileCount: 11, dirCount: 2, totalSize: 8192 }
        });
      }
      return json({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('用户名')).toHaveValue('rclone'));
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    await waitFor(() => expect(screen.getAllByText('dataset')).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: '下载到... dataset' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:5590/api/downloads/add-remote',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            remote: 'server',
            path: 'dataset',
            dir: 'D:\\download',
            confirmed: true
          })
        })
      );
    });
  });

  it('reports stale folder download plans instead of showing zero values', async () => {
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmMock);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/login')) return json({ ok: true, username: 'admin' });
      if (url.endsWith('/api/remotes')) return json({ remotes: ['server'] });
      if (url.includes('/api/list')) {
        return json({
          remote: 'server',
          path: '',
          list: [{ Path: '.codex', Name: '.codex', IsDir: true }]
        });
      }
      if (url.endsWith('/api/downloads/add-remote')) {
        return json({
          ok: true,
          requiresConfirmation: true,
          strategy: 'mixed',
          plan: { strategy: 'mixed' },
          summary: { name: '.codex', path: '.codex', fileCount: 6368, dirCount: 20, totalSize: 9_663_676_416 }
        });
      }
      return json({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('用户名')).toHaveValue('rclone'));
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    await waitFor(() => expect(screen.getAllByText('.codex')).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: '下载到... .codex' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('下载计划格式过旧');
      expect(confirmMock).not.toHaveBeenCalled();
    });
  });
});

function json(body: unknown) {
  return {
    ok: true,
    json: async () => body
  } as Response;
}
