# Tauri Desktop Client Design

Date: 2026-06-27

## Purpose

Build a Windows desktop client for the LAN transfer panel using Rust, React, and Tauri. The client should feel closer to Windows Explorer than the current browser panel: dense file lists, direct navigation, keyboard shortcuts, drag-and-drop upload/download, and a visible transfer queue.

The first version should reuse the existing Node.js backend and HTTP API documented in `docs/client-api.md`. Rust/Tauri is responsible for desktop integration, local file-system access, command boundaries, and packaging. The existing `server.js` remains responsible for SSH browsing, rclone/aria2 orchestration, folder packaging, and transfer task control.

## Goals

- Provide a desktop app launched from Windows, not a browser tab.
- Show a two-pane file manager: local files on the left and server files on the right.
- Support Explorer-like navigation: double-click folders, address breadcrumbs, Backspace parent, F5 refresh, multi-select, and sortable columns.
- Support drag-and-drop:
  - local file or folder into the remote pane uploads it;
  - remote file or folder into the local pane downloads it;
  - dragging from Windows Explorer into the app uploads local files.
- Surface existing aria2 queue state with progress, speed, pause, resume, remove, and purge controls.
- Keep secrets out of source files. Store only non-secret connection preferences locally.

## Non-Goals For MVP

- Replacing `server.js` with a full Rust backend.
- Dragging remote files directly out to Windows Explorer as virtual files.
- Full Windows shell context menu integration.
- Multi-server account management beyond one active backend URL.
- File preview, editor integration, sync workflows, or cloud-provider management.
- Installer signing and auto-update.

## Architecture

The desktop project lives under `desktop/`.

```text
desktop/
  package.json
  vite.config.ts
  src/
    main.tsx
    App.tsx
    api/client.ts
    api/types.ts
    state/useAppStore.ts
    components/
    features/
  src-tauri/
    Cargo.toml
    tauri.conf.json
    src/main.rs
```

The React frontend owns layout, selection, navigation, drag states, and queue presentation. It calls a small TypeScript API client that talks to the existing panel backend over HTTP using cookie-based authentication.

Rust commands are kept narrow:

- read local directories for the local pane;
- resolve local drag paths from Tauri drag events;
- open native folder/file pickers when needed;
- persist desktop preferences such as backend URL and last local directory.

This keeps the MVP focused and avoids duplicating working SSH, aria2, and rclone logic.

## UI Model

The main window is a work surface, not a landing page.

- Top bar: backend URL/status, active remote, refresh, queue toggle, settings.
- Left pane: local filesystem with path bar, parent button, list view, and upload drop target.
- Right pane: remote filesystem with remote selector, path bar, parent button, list view, and download drop target.
- Bottom queue: aria2 tasks grouped by active, waiting, and stopped.
- Status bar: selected item count, total selected size when known, transfer/download speeds.

The visual style should be quiet and utilitarian: compact rows, stable columns, clear icons, and restrained color. Cards should not wrap the main panes; the panes are the application surface.

## Data Flow

Login:

1. User enters backend URL, username, and password.
2. Frontend calls `POST /api/login`.
3. HTTP cookie is retained by the desktop webview/session.
4. Frontend loads `GET /api/session`, `GET /api/remotes`, and the root `GET /api/list`.

Browsing:

- Remote pane calls `GET /api/list?remote=<remote>&path=<path>`.
- Local pane calls a Tauri command such as `list_local_dir(path)`.
- Sorting and selection are client-side.

Upload:

- Local files dropped on the remote pane are uploaded with `PUT /api/upload?remote=<remote>&path=<remotePath>&name=<name>`.
- Local folders dropped on the remote pane are walked by a Rust command. The client creates remote folders with `POST /api/mkdir` and uploads files with `PUT /api/upload`, preserving relative paths.

Download:

- Remote files dropped on the local pane use `GET /api/download` for normal HTTP streaming in MVP.
- Remote folders use `GET /api/download-folder`.
- A later phase can route remote downloads through `/api/downloads/*` when the backend exposes a server-file-to-aria2 enqueue endpoint suitable for desktop clients.

Queue:

- The queue polls `GET /api/downloads/tasks` and `GET /api/transfers/stats`.
- Controls call `POST /api/downloads/control`.

## Error Handling

- HTTP `401` returns the app to the login state.
- HTTP `400` and `502` show a concise inline error and a copyable detail panel.
- Upload/download failures remain in the local activity list until dismissed.
- Network loss marks the backend as disconnected and keeps current pane state visible.
- Dragging unsupported items shows a non-modal warning.

## Persistence

Use a Tauri-safe app config file or plugin store for:

- backend URL;
- last local directory;
- last remote and path;
- UI density and queue visibility.

Do not store passwords, aria2 secrets, SSH passwords, or peer tokens in plaintext. MVP can require entering the panel password at launch.

## Testing Strategy

- Unit-test path utilities, sorting, selection, and API error normalization.
- Component-test file pane selection, drag targets, and queue controls.
- Rust-test local directory listing and preference serialization.
- Add a smoke script that starts the existing Node backend, launches the Tauri app in dev mode, and verifies login/listing manually until automated browser driving is added.

## Phasing

Phase 1: Desktop shell and API client.

Phase 2: Explorer-style local/remote panes.

Phase 3: Upload/download drag-and-drop.

Phase 4: Queue panel and transfer controls.

Phase 5: Packaging and Windows polish.

Phase 6: Optional Rust backend migration for stable pieces once UI behavior is proven.
