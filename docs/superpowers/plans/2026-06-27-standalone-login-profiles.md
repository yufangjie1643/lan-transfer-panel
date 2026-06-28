# Standalone Login Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline connection bar with a standalone login view that defaults to the LAN server at `10.42.0.1` and supports saved or custom credentials.

**Architecture:** Tauri exposes saved connection profiles from the local credential file, React renders a login-first flow, and `App` only renders the file manager after a session is established. Passwords are read locally at runtime and are not hardcoded in source.

**Tech Stack:** React, TypeScript, Tauri Rust commands, Vitest, Testing Library.

---

### Task 1: Profile Loading

**Files:**
- Create: `desktop/src/features/auth/connectionProfiles.ts`
- Modify: `desktop/src-tauri/src/main.rs`
- Test: `desktop/src/features/auth/connectionProfiles.test.ts`

- [ ] Add a failing test that expects `listConnectionProfiles()` to invoke `list_connection_profiles`.
- [ ] Add a Tauri command returning `服务器 10.42.0.1`, `本机开发 127.0.0.1`, and a custom marker.
- [ ] Read username/password from `~/.config/file-transfer/rclone-rc.credentials` when present.

### Task 2: Login Screen

**Files:**
- Create: `desktop/src/features/auth/LoginScreen.tsx`
- Test: `desktop/src/features/auth/LoginScreen.test.tsx`
- Modify: `desktop/src/i18n/messages.ts`, `desktop/src/styles.css`

- [ ] Add a failing test for selecting server/local/custom profiles.
- [ ] Render backend URL, username, password, and connect button in a standalone login panel.
- [ ] Keep fields editable after selecting a preset.

### Task 3: App Flow

**Files:**
- Modify: `desktop/src/App.tsx`
- Test: `desktop/src/App.test.tsx`, `desktop/src/App.login.test.tsx`

- [ ] Add failing tests that unauthenticated startup shows only login, with `http://10.42.0.1:5590` default.
- [ ] Move login form out of the file manager shell.
- [ ] Add a `切换连接` action in the authenticated header.

### Task 4: Verification

- [ ] Run targeted auth tests.
- [ ] Run all desktop tests.
- [ ] Run `npm run build` in `desktop`.
- [ ] Run `cargo check --manifest-path desktop/src-tauri/Cargo.toml`.
- [ ] Run root `npm test`.
