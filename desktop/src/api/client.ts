import type { AddRemoteDownloadResponse, DownloadTasksResponse, ListResponse, SessionInfo } from './types';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type TaskAction = 'pause' | 'unpause' | 'remove' | 'purge';
const defaultFetch: FetchLike = (input, init) => globalThis.fetch(input, init);

export class PanelApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(baseUrl: string, fetchImpl: FetchLike = defaultFetch) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetchImpl = fetchImpl;
  }

  login(username: string, password: string) {
    return this.request<{ ok: true; username: string }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  }

  logout() {
    return this.request<{ ok: true }>('/api/logout', { method: 'POST' });
  }

  getSession() {
    return this.request<SessionInfo>('/api/session');
  }

  getRemotes() {
    return this.request<{ remotes: string[] }>('/api/remotes');
  }

  list(remote: string, path: string) {
    const query = new URLSearchParams({ remote, path });
    return this.request<ListResponse>(`/api/list?${query}`);
  }

  getTasks() {
    return this.request<DownloadTasksResponse>('/api/downloads/tasks');
  }

  controlTask(gid: string, action: TaskAction) {
    return this.request<{ ok: true; result: string }>('/api/downloads/control', {
      method: 'POST',
      body: JSON.stringify({ gid, action })
    });
  }

  addRemoteDownload(
    remote: string,
    path: string,
    dir: string,
    options: { confirmed?: boolean; compression?: 'none' | 'gzip'; planToken?: string } = {}
  ) {
    return this.request<AddRemoteDownloadResponse>('/api/downloads/add-remote', {
      method: 'POST',
      body: JSON.stringify({ remote, path, dir, ...options })
    });
  }

  async createVirtualDragDownload(remote: string, path: string) {
    const response = await this.request<{ ok: true; token: string; expiresAt: string }>(
      '/api/virtual-drag-token',
      {
        method: 'POST',
        body: JSON.stringify({ remote, path })
      }
    );
    const query = new URLSearchParams({ downloadToken: response.token });
    return {
      ...response,
      url: `${this.baseUrl}/api/download?${query}`
    };
  }

  async raw(path: string, init: RequestInit = {}) {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      credentials: 'include',
      ...init
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    return response;
  }

  mkdir(remote: string, path: string, name: string) {
    return this.request<{ ok: true; path: string }>('/api/mkdir', {
      method: 'POST',
      body: JSON.stringify({ remote, path, name })
    });
  }

  uploadFile(remote: string, path: string, name: string, body: Blob | ArrayBuffer) {
    const query = new URLSearchParams({ remote, path, name });
    return this.raw(`/api/upload?${query}`, { method: 'PUT', body });
  }

  buildDownloadUrl(remote: string, path: string) {
    const query = new URLSearchParams({ remote, path });
    return `${this.baseUrl}/api/download?${query}`;
  }

  buildFolderDownloadUrl(remote: string, path: string) {
    const query = new URLSearchParams({ remote, path });
    return `${this.baseUrl}/api/download-folder?${query}`;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(init.headers ?? {})
      },
      ...init
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    return response.json() as Promise<T>;
  }
}

async function readErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as { error?: string; detail?: string };
    if (body.error && body.detail) return `${body.error}: ${body.detail}`;
    if (body.error) return body.error;
  } catch {
    // Fall through to status-based message.
  }
  return response.statusText || String(response.status);
}
