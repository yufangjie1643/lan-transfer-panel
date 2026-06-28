import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelApiClient } from './client';

describe('PanelApiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes backend URLs and calls login', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, username: 'admin' })
    });
    const client = new PanelApiClient('http://127.0.0.1:5590/', fetchMock as never);

    await client.login('admin', 'secret');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:5590/api/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include'
      })
    );
  });

  it('throws server error messages', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: 'backend failed', detail: 'aria2 offline' })
    });
    const client = new PanelApiClient('http://127.0.0.1:5590', fetchMock as never);

    await expect(client.getSession()).rejects.toThrow('backend failed: aria2 offline');
  });

  it('builds transfer URLs and uploads raw file bodies', async () => {
    const body = new Blob(['hello']);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, path: 'logs/a.txt' })
    });
    const client = new PanelApiClient('http://127.0.0.1:5590', fetchMock as never);

    await client.uploadFile('server', 'logs', 'a.txt', body);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:5590/api/upload?remote=server&path=logs&name=a.txt',
      expect.objectContaining({
        method: 'PUT',
        credentials: 'include',
        body
      })
    );
    expect(client.buildDownloadUrl('server', 'logs/a.txt')).toBe(
      'http://127.0.0.1:5590/api/download?remote=server&path=logs%2Fa.txt'
    );
  });

  it('creates tokenized virtual drag download URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, token: 'drag-token', expiresAt: '2026-06-28T00:00:00.000Z' })
    });
    const client = new PanelApiClient('http://127.0.0.1:5590', fetchMock as never);

    const result = await client.createVirtualDragDownload('server', '/home/yufan/.bash_history');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:5590/api/virtual-drag-token',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ remote: 'server', path: '/home/yufan/.bash_history' })
      })
    );
    expect(result.url).toBe('http://127.0.0.1:5590/api/download?downloadToken=drag-token');
  });

  it('calls the default browser fetch with the global receiver', async () => {
    const fetchMock = vi.fn(function (this: unknown) {
      expect(this).toBe(globalThis);
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, username: 'rclone' })
      } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new PanelApiClient('http://10.42.0.1:5590');

    await client.login('rclone', 'secret');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
