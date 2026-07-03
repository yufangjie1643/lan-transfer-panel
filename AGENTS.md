# Agent Guide

## Project Overview

LAN Transfer Panel is a Node.js-based LAN file-transfer web panel with an optional Tauri desktop client.

- The backend proxies local rclone RC and aria2 RPC, and can browse a remote Linux server over SSH as a file source.
- The browser UI is vanilla JavaScript/CSS served from `public/`.
- The desktop client lives in `desktop/` and is built with Tauri v2, React 18, TypeScript, Vite, and Rust. It is currently Windows-focused and uses SSH for remote file browsing and downloads.

## Repository Layout

- `server.js` — backend entry point.
- `public/` — static browser UI (`index.html`, `app.js`, `styles.css`).
- `lib/` — small helper modules used by `server.js`.
- `test/` — backend unit tests using Node's built-in test runner.
- `scripts/` — development helpers (`dev-all.js`, `dev-server.js`).
- `desktop/` — Tauri desktop client.
  - `src/` — React/TypeScript frontend.
  - `src-tauri/` — Rust backend and Tauri configuration.
- `docs/client-api.md` — HTTP API documentation for native/desktop clients.

## Technology Stack

- Backend: Node.js >=20, ES modules, only Node core dependencies at runtime.
- External tools: rclone, aria2 RPC, OpenSSH client, Python 3 on the remote server.
- Browser UI: vanilla JavaScript, no build step.
- Desktop: Tauri v2, React 18, TypeScript, Vite, Rust; Vitest + jsdom + Testing Library for frontend tests.

## Configuration Files

- `package.json` — root scripts, engine requirement (`node >=20`), and project metadata.
- `server.js` — runtime configuration via environment variables.
- `desktop/package.json`, `desktop/vite.config.ts`, `desktop/tsconfig.json` — desktop web layer.
- `desktop/src-tauri/Cargo.toml`, `desktop/src-tauri/tauri.conf.json` — desktop Tauri/Rust layer.

## Runtime Architecture

`server.js` starts one HTTP server per address in `PANEL_BIND` (default `127.0.0.1,10.42.0.1`) on `PANEL_PORT` (default `5590`).

It:

- Serves `public/` as static files, falling back to `index.html` for SPA-style routes.
- Handles `/api/*` routes for authentication, file browsing, uploads/downloads, aria2 queue control, and transfer stats.
- Maintains in-memory sessions in a `Map`; sessions expire after 12 hours and refresh on use. Session cookie name: `ltp_session`.
- Reads rclone RC credentials from the `RCLONE_CREDENTIALS` file or env vars, and aria2 config from `ARIA2_CONF` file or env vars.
- Defaults: SSH host `yufanssh`, SSH root `/home/yufan`, display name `server`.

Key API routes:

- `POST /api/login`, `POST /api/logout`, `GET /api/session`
- `GET /api/remotes`, `GET /api/list`
- `POST /api/mkdir`, `POST /api/delete`
- `PUT /api/upload`, `GET /api/download`, `GET /api/download-folder`
- `GET /api/transfers/stats`
- `GET|POST /api/downloads/*` (legacy `/api/aria2/*` aliases also exist)
- `POST /api/send`

## Module Organization

Backend helpers under `lib/`:

- `lib/aria2-download.js` — build aria2 `addUri` requests for locally served rclone files.
- `lib/cors.js` — CORS origin parsing and header building.
- `lib/folder-plan.js` — decide whether to archive small files or download them directly.
- `lib/folder-plan-cache.js` — temporary cache for confirmed folder download plans.
- `lib/folder-download-order.js` — order archive vs direct download batches.
- `lib/post-download-store.js` — persist archive extraction jobs next to the aria2 dir.
- `lib/public-folder-plan.js` — sanitize plan data sent to clients.
- `lib/ssh-archive-script.js` — server-side tar archive shell script builder.
- `lib/ssh-paths.js` — SSH path normalization and traversal guard.
- `lib/ssh-python-args.js` — base64-encode args passed to server Python scripts.
- `lib/ssh-source.js` — rclone serve args, SSH tunnel args, and Python range-server helper.

Desktop frontend under `desktop/src/`:

- `api/` — HTTP client and shared types.
- `features/auth/` — login screen and saved SSH connection profiles.
- `features/remote/` — SSH remote browsing and download commands.
- `features/local/` — local directory picker and listing.
- `features/queue/` — transfer queue UI.
- `features/drag/` — Tauri drag helpers.
- `state/` — Zustand app store.
- `i18n/` — localized UI strings (mostly Chinese).

## Build, Test, and Development Commands

Root:

- `npm start` — run `node server.js`.
- `npm run dev` — run backend dev server and desktop Vite dev server in parallel.
- `npm run dev:server` — run backend dev server only.
- `npm test` — run backend unit tests with Node's built-in runner (`test/*.test.js`).
- `npm run build` — build the desktop frontend (`npm --prefix desktop run build`).
- `npm run desktop:dev` — run Tauri dev mode.
- `npm run desktop:build` — build the Tauri installer.
- `npm run desktop:test` — run desktop tests (`npm --prefix desktop test`).

Desktop (inside `desktop/`):

- `npm run dev` — Vite dev server on port `1420`.
- `npm run build` — `tsc && vite build`.
- `npm run tauri:dev` / `npm run tauri:build` — Tauri commands.
- `npm test` / `npm run test:watch` — Vitest.

Rust (desktop):

- `cargo check --manifest-path desktop/src-tauri/Cargo.toml`

## Code Style Guidelines

- Use ES modules everywhere; `type: "module"` is set in `package.json` files.
- JavaScript: two-space indentation, semicolons, single quotes, `const` by default, `async`/`await` for async work.
- `camelCase` for JavaScript variables/functions; `kebab-case` for CSS class names.
- Prefer small helper functions and keep shared logic in `lib/`.
- TypeScript/React desktop code follows similar formatting; Rust uses standard `snake_case` and `cargo fmt` formatting.
- UI strings and API error messages are mostly Chinese.

## Testing Instructions

Backend:

- Run `npm test` for unit tests.
- For manual smoke testing, run `npm start` or `npm run dev` and verify login, remote listing, file browsing, upload/download, folder download, and aria2 task controls.
- Tests live in `test/*.test.js` and use `node:test` plus `node:assert/strict`.

Desktop:

- Run `npm run desktop:test` (Vitest).
- Run `cargo check --manifest-path desktop/src-tauri/Cargo.toml` for Rust compile checks.
- Manual testing requires a reachable SSH server and the backend running.

## Security Considerations

- Never commit credentials, aria2 secrets, or machine-specific paths. `.gitignore` excludes `.env`, `.env.*`, `node_modules/`, Tauri `target/` and `gen/`, and `dist/`.
- Prefer environment variables for local overrides:
  - `PANEL_USER`, `PANEL_PASS`
  - `RCLONE_CREDENTIALS`, `RCLONE_URL`, `RCLONE_USER`, `RCLONE_PASS`
  - `ARIA2_CONF`, `ARIA2_URL`, `ARIA2_SECRET`, `ARIA2_DIR`
  - `SSH_HOST`, `SSH_ROOT`, `SSH_REMOTE_NAME`, `SSH_COMMAND`
  - `PANEL_CORS_ORIGINS`
- Session cookies are `HttpOnly; SameSite=Lax; Path=/`.
- Password comparison uses `crypto.timingSafeEqual`.
- Path traversal is guarded for both remote paths and SSH paths.
- rclone `serve http` instances use a random password and per-remote `.htpasswd` files with mode `0o600`.
- SSH commands are invoked with `BatchMode=yes` and shell-quoted arguments.
- Root remote deletion is blocked.
- CORS defaults allow only Vite/Tauri development origins; override with `PANEL_CORS_ORIGINS`.

## Deployment Notes

- The backend is a plain Node.js process; no container packaging is provided.
- The Windows desktop client is built with Tauri and produces an installer (e.g., `dist/LAN Transfer_0.1.0_x64-setup.exe`).
- Runtime requires Node, rclone (for non-SSH remotes), an accessible aria2 RPC, SSH access to the configured server, and Python 3 on that server.
