# Tauri Desktop Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows desktop Explorer-style client for the existing LAN transfer panel using Rust, React, and Tauri.

**Architecture:** Add a `desktop/` Tauri app that reuses the existing Node.js HTTP API from `server.js` and `docs/client-api.md`. React owns the Explorer-like UI and queue presentation; Rust commands provide local filesystem access and desktop preference persistence.

**Tech Stack:** Tauri v2, Rust, React, TypeScript, Vite, Vitest, Node.js `node:test`, existing LAN transfer panel API.

---

## File Map

- Create `desktop/package.json`: frontend scripts and Tauri dev/build commands.
- Create `desktop/vite.config.ts`, `desktop/tsconfig.json`, `desktop/index.html`, `desktop/src/test/setup.ts`: Vite/React test setup.
- Create `desktop/src-tauri/Cargo.toml`, `desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/src/main.rs`: Tauri shell and Rust commands.
- Create `desktop/src/api/types.ts`: shared API and view-model types.
- Create `desktop/src/api/client.ts`: cookie-aware HTTP client for `docs/client-api.md`.
- Create `desktop/src/state/useAppStore.ts`: small app state store.
- Create `desktop/src/features/local/localFs.ts`: frontend wrapper around Rust local filesystem commands.
- Create `desktop/src/features/panes/FilePane.tsx`: reusable Explorer-like file pane.
- Create `desktop/src/features/queue/QueuePanel.tsx`: aria2 task view and controls.
- Create `desktop/src/App.tsx`, `desktop/src/main.tsx`, `desktop/src/styles.css`: application shell.
- Create `desktop/src/**/*.test.ts[x]`: unit and component tests.
- Modify root `package.json`: add `desktop:dev`, `desktop:build`, and `desktop:test` convenience scripts.
- Modify `README.md`: document desktop dev prerequisites and commands.

## Task 1: Scaffold Tauri React App

**Files:**
- Create: `desktop/package.json`
- Create: `desktop/index.html`
- Create: `desktop/vite.config.ts`
- Create: `desktop/tsconfig.json`
- Create: `desktop/src/test/setup.ts`
- Create: `desktop/src/main.tsx`
- Create: `desktop/src/App.tsx`
- Create: `desktop/src/styles.css`
- Create: `desktop/src-tauri/Cargo.toml`
- Create: `desktop/src-tauri/tauri.conf.json`
- Create: `desktop/src-tauri/src/main.rs`
- Modify: `package.json`
- Test: `npm run desktop:test`

- [ ] **Step 1: Write the failing scaffold smoke test**

Create `desktop/src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App shell', () => {
  it('renders the desktop file manager shell', () => {
    render(<App />);
    expect(screen.getByRole('banner')).toHaveTextContent('LAN Transfer');
    expect(screen.getByLabelText('Local files')).toBeInTheDocument();
    expect(screen.getByLabelText('Remote files')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm run desktop:test
```

Expected: FAIL because `desktop/` scripts and React shell do not exist yet.

- [ ] **Step 3: Create the minimal package files**

Create `desktop/package.json`:

```json
{
  "name": "lan-transfer-desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "lucide-react": "^0.468.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^4.5.5"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^15.0.7",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.3",
    "vite": "^6.0.7",
    "vitest": "^2.1.8"
  }
}
```

Create `desktop/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 1420,
    strictPort: true
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts'
  }
});
```

Create `desktop/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

Create `desktop/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Create the minimal React shell**

Create `desktop/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LAN Transfer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `desktop/src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `desktop/src/App.tsx`:

```tsx
export default function App() {
  return (
    <main className="app-shell">
      <header className="top-bar">
        <strong>LAN Transfer</strong>
        <span>Disconnected</span>
      </header>
      <section className="pane-grid">
        <section className="file-pane" aria-label="Local files">
          <header>Local</header>
        </section>
        <section className="file-pane" aria-label="Remote files">
          <header>Remote</header>
        </section>
      </section>
    </main>
  );
}
```

Create `desktop/src/styles.css` with compact Explorer-like layout:

```css
:root {
  color: #1f2933;
  background: #f4f6f8;
  font-family: "Segoe UI", system-ui, sans-serif;
}

body {
  margin: 0;
}

.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-rows: 44px 1fr;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid #ccd3dc;
  background: #fff;
}

.pane-grid {
  display: grid;
  grid-template-columns: minmax(320px, 1fr) minmax(360px, 1.3fr);
  min-height: 0;
}

.file-pane {
  min-width: 0;
  border-right: 1px solid #d8dee6;
  background: #fff;
}
```

- [ ] **Step 5: Create Tauri shell files**

Create `desktop/src-tauri/Cargo.toml`:

```toml
[package]
name = "lan-transfer-desktop"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri = { version = "2", features = [] }
```

Create `desktop/src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "LAN Transfer",
  "version": "0.1.0",
  "identifier": "local.lan-transfer.desktop",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "LAN Transfer",
        "width": 1180,
        "height": 760,
        "minWidth": 900,
        "minHeight": 560
      }
    ]
  }
}
```

Create `desktop/src-tauri/src/main.rs`:

```rust
fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to run LAN Transfer desktop app");
}
```

- [ ] **Step 6: Add root convenience scripts**

Modify root `package.json` scripts:

```json
{
  "desktop:dev": "npm --prefix desktop run tauri:dev",
  "desktop:build": "npm --prefix desktop run tauri:build",
  "desktop:test": "npm --prefix desktop test"
}
```

- [ ] **Step 7: Verify scaffold**

Run:

```powershell
npm install --prefix desktop
npm run desktop:test
cargo check --manifest-path desktop/src-tauri/Cargo.toml
```

Expected: tests pass and Rust shell checks.

## Task 2: API Client And Login State

**Files:**
- Create: `desktop/src/api/types.ts`
- Create: `desktop/src/api/client.ts`
- Create: `desktop/src/api/client.test.ts`
- Modify: `desktop/src/App.tsx`

- [ ] **Step 1: Write API client tests**

Create `desktop/src/api/client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { PanelApiClient } from './client';

describe('PanelApiClient', () => {
  it('normalizes backend URLs and calls login', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, username: 'admin' })
    });
    const client = new PanelApiClient('http://127.0.0.1:5590/', fetchMock as any);

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
    const client = new PanelApiClient('http://127.0.0.1:5590', fetchMock as any);

    await expect(client.getSession()).rejects.toThrow('backend failed: aria2 offline');
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm run desktop:test -- client.test.ts
```

Expected: FAIL because `PanelApiClient` does not exist.

- [ ] **Step 3: Implement API types**

Create `desktop/src/api/types.ts`:

```ts
export interface SessionInfo {
  ok: true;
  username: string;
  rcloneUrl?: string;
  aria2Dir?: string;
  bindAddresses?: string[];
  port?: number;
}

export interface RemoteItem {
  Path: string;
  Name: string;
  Size?: number;
  MimeType?: string;
  ModTime?: string;
  IsDir: boolean;
}

export interface ListResponse {
  remote: string;
  path: string;
  list: RemoteItem[];
}

export interface DownloadTasksResponse {
  globalStat: Record<string, string>;
  active: Aria2Task[];
  waiting: Aria2Task[];
  stopped: Aria2Task[];
}

export interface Aria2Task {
  gid: string;
  status?: string;
  totalLength?: string;
  completedLength?: string;
  downloadSpeed?: string;
  files?: unknown[];
}
```

- [ ] **Step 4: Implement API client**

Create `desktop/src/api/client.ts`:

```ts
import type { DownloadTasksResponse, ListResponse, SessionInfo } from './types';

type FetchLike = typeof fetch;

export class PanelApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(baseUrl: string, fetchImpl: FetchLike = fetch) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetchImpl = fetchImpl;
  }

  async login(username: string, password: string) {
    return this.request<{ ok: true; username: string }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  }

  async getSession() {
    return this.request<SessionInfo>('/api/session');
  }

  async getRemotes() {
    return this.request<{ remotes: string[] }>('/api/remotes');
  }

  async list(remote: string, path: string) {
    const query = new URLSearchParams({ remote, path });
    return this.request<ListResponse>(`/api/list?${query}`);
  }

  async getTasks() {
    return this.request<DownloadTasksResponse>('/api/downloads/tasks');
  }

  async controlTask(gid: string, action: 'pause' | 'unpause' | 'remove' | 'purge') {
    return this.request<{ ok: true; result: string }>('/api/downloads/control', {
      method: 'POST',
      body: JSON.stringify({ gid, action })
    });
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
      let message = `${response.status}`;
      try {
        const body = await response.json();
        message = body.detail ? `${body.error}: ${body.detail}` : body.error;
      } catch {
        message = response.statusText || message;
      }
      throw new Error(message);
    }
    return response.json() as Promise<T>;
  }
}
```

- [ ] **Step 5: Verify API client**

Run:

```powershell
npm run desktop:test -- client.test.ts
```

Expected: PASS.

## Task 3: Rust Local Filesystem Commands

**Files:**
- Modify: `desktop/src-tauri/src/main.rs`
- Create: `desktop/src/features/local/localFs.ts`
- Create: `desktop/src/features/local/localFs.test.ts`

- [ ] **Step 1: Write Rust command contract in frontend test**

Create `desktop/src/features/local/localFs.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { listLocalDirectory } from './localFs';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([
    { path: 'C:\\Temp\\file.txt', name: 'file.txt', isDir: false, size: 4 }
  ])
}));

describe('localFs', () => {
  it('lists local directories through Tauri invoke', async () => {
    const items = await listLocalDirectory('C:\\Temp');
    expect(items[0].name).toBe('file.txt');
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npm run desktop:test -- localFs.test.ts
```

Expected: FAIL because `localFs.ts` does not exist.

- [ ] **Step 3: Implement frontend local wrapper**

Create `desktop/src/features/local/localFs.ts`:

```ts
import { invoke } from '@tauri-apps/api/core';

export interface LocalItem {
  path: string;
  name: string;
  isDir: boolean;
  size?: number;
  modified?: number;
}

export async function listLocalDirectory(path: string): Promise<LocalItem[]> {
  return invoke<LocalItem[]>('list_local_directory', { path });
}
```

- [ ] **Step 4: Implement Rust command**

Replace `desktop/src-tauri/src/main.rs`:

```rust
use serde::Serialize;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalItem {
    path: String,
    name: String,
    is_dir: bool,
    size: Option<u64>,
    modified: Option<u64>,
}

#[tauri::command]
fn list_local_directory(path: String) -> Result<Vec<LocalItem>, String> {
    let dir = PathBuf::from(path);
    let entries = fs::read_dir(&dir).map_err(|err| err.to_string())?;
    let mut items = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|err| err.to_string())?;
        let metadata = entry.metadata().map_err(|err| err.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        items.push(LocalItem {
            path: entry.path().to_string_lossy().to_string(),
            name,
            is_dir: metadata.is_dir(),
            size: if metadata.is_file() { Some(metadata.len()) } else { None },
            modified: metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|duration| duration.as_secs()),
        });
    }
    items.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(items)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![list_local_directory])
        .run(tauri::generate_context!())
        .expect("failed to run LAN Transfer desktop app");
}
```

- [ ] **Step 5: Verify**

Run:

```powershell
npm run desktop:test -- localFs.test.ts
cargo test --manifest-path desktop/src-tauri/Cargo.toml
```

Expected: PASS.

## Task 4: Explorer File Pane Component

**Files:**
- Create: `desktop/src/features/panes/FilePane.tsx`
- Create: `desktop/src/features/panes/FilePane.test.tsx`
- Modify: `desktop/src/App.tsx`

- [ ] **Step 1: Write component test**

Create `desktop/src/features/panes/FilePane.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilePane } from './FilePane';

describe('FilePane', () => {
  it('opens folders on double click and selects rows', () => {
    const onOpenDirectory = vi.fn();
    render(
      <FilePane
        title="Remote"
        path="/home"
        items={[{ key: 'docs', name: 'docs', isDir: true }, { key: 'a.txt', name: 'a.txt', isDir: false, size: 12 }]}
        selectedKeys={new Set()}
        onSelect={() => undefined}
        onOpenDirectory={onOpenDirectory}
        onRefresh={() => undefined}
      />
    );

    fireEvent.doubleClick(screen.getByText('docs'));
    expect(onOpenDirectory).toHaveBeenCalledWith('docs');
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npm run desktop:test -- FilePane.test.tsx
```

Expected: FAIL because `FilePane` does not exist.

- [ ] **Step 3: Implement `FilePane`**

Create `desktop/src/features/panes/FilePane.tsx`:

```tsx
import { Folder, File, RefreshCcw } from 'lucide-react';

export interface PaneItem {
  key: string;
  name: string;
  isDir: boolean;
  size?: number;
  modified?: string | number;
}

interface FilePaneProps {
  title: string;
  path: string;
  items: PaneItem[];
  selectedKeys: Set<string>;
  onSelect: (key: string, additive: boolean) => void;
  onOpenDirectory: (key: string) => void;
  onRefresh: () => void;
}

export function FilePane(props: FilePaneProps) {
  return (
    <section className="file-pane" aria-label={`${props.title} files`}>
      <header className="pane-header">
        <strong>{props.title}</strong>
        <code>{props.path || '/'}</code>
        <button type="button" aria-label={`Refresh ${props.title}`} onClick={props.onRefresh}>
          <RefreshCcw size={16} />
        </button>
      </header>
      <div className="file-table" role="grid">
        {props.items.map((item) => (
          <button
            type="button"
            className={props.selectedKeys.has(item.key) ? 'file-row selected' : 'file-row'}
            key={item.key}
            onClick={(event) => props.onSelect(item.key, event.ctrlKey || event.metaKey)}
            onDoubleClick={() => item.isDir && props.onOpenDirectory(item.key)}
          >
            {item.isDir ? <Folder size={16} /> : <File size={16} />}
            <span>{item.name}</span>
            <span>{item.isDir ? '' : formatSize(item.size)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function formatSize(size?: number) {
  if (size == null) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
```

- [ ] **Step 4: Wire component into `App`**

Update `desktop/src/App.tsx` to render two `FilePane` instances with empty lists.

- [ ] **Step 5: Verify**

Run:

```powershell
npm run desktop:test -- FilePane.test.tsx App.test.tsx
```

Expected: PASS.

## Task 5: Remote Browsing Flow

**Files:**
- Create: `desktop/src/state/useAppStore.ts`
- Modify: `desktop/src/App.tsx`
- Create: `desktop/src/App.remote.test.tsx`

- [ ] **Step 1: Write remote browsing test**

Create `desktop/src/App.remote.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

describe('remote browsing', () => {
  it('loads remotes and the root directory after login state exists', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/api/session')) return json({ ok: true, username: 'admin' });
      if (url.endsWith('/api/remotes')) return json({ remotes: ['server'] });
      if (url.includes('/api/list')) return json({ remote: 'server', path: '', list: [{ Path: 'logs', Name: 'logs', IsDir: true }] });
      return json({ ok: true });
    }));

    render(<App initialBackendUrl="http://127.0.0.1:5590" />);

    await waitFor(() => expect(screen.getByText('logs')).toBeInTheDocument());
  });
});

function json(body: unknown) {
  return {
    ok: true,
    json: async () => body
  } as Response;
}
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npm run desktop:test -- App.remote.test.tsx
```

Expected: FAIL because `App` does not accept `initialBackendUrl` and remote loading is not implemented.

- [ ] **Step 3: Implement app state store**

Create `desktop/src/state/useAppStore.ts` with state for backend URL, session, remotes, selected remote, remote path, remote items, local path, local items, selected keys, loading, and error.

Use zustand:

```ts
import { create } from 'zustand';
import type { RemoteItem } from '../api/types';

interface AppState {
  backendUrl: string;
  remote: string;
  remotePath: string;
  remoteItems: RemoteItem[];
  error: string | null;
  setBackendUrl: (url: string) => void;
  setRemoteItems: (remote: string, path: string, items: RemoteItem[]) => void;
  setError: (error: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  backendUrl: 'http://127.0.0.1:5590',
  remote: '',
  remotePath: '',
  remoteItems: [],
  error: null,
  setBackendUrl: (backendUrl) => set({ backendUrl }),
  setRemoteItems: (remote, remotePath, remoteItems) => set({ remote, remotePath, remoteItems }),
  setError: (error) => set({ error })
}));
```

- [ ] **Step 4: Implement remote loading in `App`**

Update `App` to:

- create `PanelApiClient`;
- call `getSession`, `getRemotes`, and `list` on mount;
- render remote items through `FilePane`;
- navigate into a directory by listing `item.Path`.

- [ ] **Step 5: Verify**

Run:

```powershell
npm run desktop:test -- App.remote.test.tsx
```

Expected: PASS.

## Task 6: Drag And Drop Upload/Download

**Files:**
- Create: `desktop/src/features/drag/dragModel.ts`
- Create: `desktop/src/features/drag/dragModel.test.ts`
- Create: `desktop/src/features/drag/useTauriFileDrops.ts`
- Modify: `desktop/src-tauri/src/main.rs`
- Modify: `desktop/src/features/panes/FilePane.tsx`
- Modify: `desktop/src/api/client.ts`

- [ ] **Step 1: Write drag model tests**

Create `desktop/src/features/drag/dragModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { classifyDrop } from './dragModel';

describe('classifyDrop', () => {
  it('uploads local files dropped on remote pane', () => {
    expect(classifyDrop({ source: 'local', target: 'remote', itemCount: 2 })).toEqual({ action: 'upload' });
  });

  it('downloads remote files dropped on local pane', () => {
    expect(classifyDrop({ source: 'remote', target: 'local', itemCount: 1 })).toEqual({ action: 'download' });
  });

  it('rejects same-pane drops for MVP', () => {
    expect(classifyDrop({ source: 'remote', target: 'remote', itemCount: 1 }).action).toBe('reject');
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npm run desktop:test -- dragModel.test.ts
```

Expected: FAIL because `dragModel.ts` does not exist.

- [ ] **Step 3: Implement drag model**

Create `desktop/src/features/drag/dragModel.ts`:

```ts
export type PaneKind = 'local' | 'remote';

export interface DropIntent {
  source: PaneKind;
  target: PaneKind;
  itemCount: number;
}

export function classifyDrop(intent: DropIntent): { action: 'upload' | 'download' | 'reject' } {
  if (intent.itemCount <= 0) return { action: 'reject' };
  if (intent.source === 'local' && intent.target === 'remote') return { action: 'upload' };
  if (intent.source === 'remote' && intent.target === 'local') return { action: 'download' };
  return { action: 'reject' };
}
```

- [ ] **Step 4: Add API upload/download helpers**

Add these methods to `PanelApiClient`:

```ts
async raw(path: string, init: RequestInit = {}) {
  const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
    credentials: 'include',
    ...init
  });
  if (!response.ok) {
    throw new Error(response.statusText || `${response.status}`);
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
```

- [ ] **Step 5: Add local folder collection command**

Add a Rust command that returns upload entries for dropped local files and folders:

```rust
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct UploadEntry {
    source_path: String,
    relative_path: String,
    is_dir: bool,
}

#[tauri::command]
fn collect_upload_entries(paths: Vec<String>) -> Result<Vec<UploadEntry>, String> {
    let mut entries = Vec::new();
    for path in paths {
        let root = std::path::PathBuf::from(&path);
        let base = root.parent().unwrap_or_else(|| std::path::Path::new(""));
        collect_upload_entry(&root, base, &mut entries)?;
    }
    Ok(entries)
}

fn collect_upload_entry(
    path: &std::path::Path,
    base: &std::path::Path,
    entries: &mut Vec<UploadEntry>,
) -> Result<(), String> {
    let metadata = std::fs::metadata(path).map_err(|err| err.to_string())?;
    let relative_path = path
        .strip_prefix(base)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/");
    entries.push(UploadEntry {
        source_path: path.to_string_lossy().to_string(),
        relative_path,
        is_dir: metadata.is_dir(),
    });
    if metadata.is_dir() {
        for child in std::fs::read_dir(path).map_err(|err| err.to_string())? {
            let child = child.map_err(|err| err.to_string())?;
            collect_upload_entry(&child.path(), base, entries)?;
        }
    }
    Ok(())
}
```

- [ ] **Step 6: Wire pane drag handlers**

Update `FilePane` to accept:

```ts
onDropItems?: (target: 'local' | 'remote') => void;
onStartDrag?: (key: string) => void;
```

Use HTML drag events for pane-to-pane drops. Add `desktop/src/features/drag/useTauriFileDrops.ts` for Windows Explorer-to-app drops:

```ts
import { useEffect } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';

export function useTauriFileDrops(onDropPaths: (paths: string[]) => void) {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'drop') {
        onDropPaths(event.payload.paths);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [onDropPaths]);
}
```

- [ ] **Step 7: Verify**

Run:

```powershell
npm run desktop:test -- dragModel.test.ts FilePane.test.tsx
```

Expected: PASS.

## Task 7: Queue Panel

**Files:**
- Create: `desktop/src/features/queue/QueuePanel.tsx`
- Create: `desktop/src/features/queue/QueuePanel.test.tsx`
- Modify: `desktop/src/App.tsx`

- [ ] **Step 1: Write queue panel test**

Create `desktop/src/features/queue/QueuePanel.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueuePanel } from './QueuePanel';

describe('QueuePanel', () => {
  it('shows active tasks and triggers pause', () => {
    const onControl = vi.fn();
    render(
      <QueuePanel
        tasks={{ active: [{ gid: 'abc', status: 'active', completedLength: '10', totalLength: '100', downloadSpeed: '5' }], waiting: [], stopped: [], globalStat: {} }}
        onControl={onControl}
      />
    );

    fireEvent.click(screen.getByLabelText('Pause abc'));
    expect(onControl).toHaveBeenCalledWith('abc', 'pause');
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npm run desktop:test -- QueuePanel.test.tsx
```

Expected: FAIL because `QueuePanel` does not exist.

- [ ] **Step 3: Implement queue panel**

Create `desktop/src/features/queue/QueuePanel.tsx`:

```tsx
import { Pause, Play, Trash2 } from 'lucide-react';
import type { DownloadTasksResponse } from '../../api/types';

interface QueuePanelProps {
  tasks: DownloadTasksResponse;
  onControl: (gid: string, action: 'pause' | 'unpause' | 'remove' | 'purge') => void;
}

export function QueuePanel({ tasks, onControl }: QueuePanelProps) {
  const allTasks = [...tasks.active, ...tasks.waiting, ...tasks.stopped];
  return (
    <section className="queue-panel" aria-label="Transfer queue">
      <header>Queue</header>
      {allTasks.map((task) => (
        <div className="queue-row" key={task.gid}>
          <span>{task.gid}</span>
          <span>{task.status}</span>
          <span>{formatProgress(task.completedLength, task.totalLength)}</span>
          <button type="button" aria-label={`Pause ${task.gid}`} onClick={() => onControl(task.gid, 'pause')}>
            <Pause size={14} />
          </button>
          <button type="button" aria-label={`Resume ${task.gid}`} onClick={() => onControl(task.gid, 'unpause')}>
            <Play size={14} />
          </button>
          <button type="button" aria-label={`Remove ${task.gid}`} onClick={() => onControl(task.gid, 'remove')}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </section>
  );
}

function formatProgress(done?: string, total?: string) {
  const doneNumber = Number(done ?? 0);
  const totalNumber = Number(total ?? 0);
  if (!totalNumber) return '';
  return `${Math.round((doneNumber / totalNumber) * 100)}%`;
}
```

- [ ] **Step 4: Wire polling in `App`**

Poll `client.getTasks()` every 1500 ms while connected. Stop polling when the component unmounts or backend URL changes.

- [ ] **Step 5: Verify**

Run:

```powershell
npm run desktop:test -- QueuePanel.test.tsx
```

Expected: PASS.

## Task 8: Documentation And Smoke Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/client-api.md`
- Create: `desktop/README.md`

- [ ] **Step 1: Document desktop commands**

Add to root `README.md`:

```markdown
## Desktop Client

The desktop client lives under `desktop/` and uses Tauri v2, React, and Rust.

```powershell
npm install
npm install --prefix desktop
npm start
npm run desktop:dev
```

The first version reuses this Node backend over `http://127.0.0.1:5590`.
```

- [ ] **Step 2: Create desktop README**

Create `desktop/README.md`:

```markdown
# LAN Transfer Desktop

Windows desktop client for the LAN transfer panel.

## Development

1. Start the backend from the repository root:

```powershell
npm start
```

2. Start the desktop client:

```powershell
npm run desktop:dev
```

## Verification

```powershell
npm run desktop:test
cargo check --manifest-path desktop/src-tauri/Cargo.toml
```
```

- [ ] **Step 3: Run full verification**

Run:

```powershell
npm test
npm run desktop:test
cargo check --manifest-path desktop/src-tauri/Cargo.toml
```

Expected: root backend tests pass, desktop tests pass, Rust shell checks.

- [ ] **Step 4: Manual smoke**

Run:

```powershell
npm start
npm run desktop:dev
```

Manual checks:

- login succeeds;
- remotes load;
- remote root lists files;
- local pane lists a Windows directory;
- double-click remote folder navigates;
- F5 refreshes the active pane;
- dragging a local file onto remote pane uploads it;
- dragging a remote file onto local pane downloads it;
- queue controls call pause/resume/remove without UI errors.

- [ ] **Step 5: Commit**

Run:

```powershell
git add desktop package.json README.md docs/client-api.md
git commit -m "add Tauri desktop client MVP"
```

## Self-Review Checklist

- Spec requirement coverage:
  - desktop app shell: Task 1;
  - existing API reuse: Task 2 and Task 5;
  - Explorer-like panes: Task 4;
  - local filesystem access through Rust: Task 3;
  - drag/drop upload and download model: Task 6;
  - queue controls: Task 7;
  - docs and smoke checks: Task 8.
- No task requires rewriting SSH/rclone/aria2 backend logic in MVP.
- No task stores passwords or aria2 secrets in source files.
- Direct remote-to-Windows-Explorer virtual dragging remains explicitly out of MVP scope.
