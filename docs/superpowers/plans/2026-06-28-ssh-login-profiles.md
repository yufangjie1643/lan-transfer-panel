# SSH Login Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the HTTP backend login form with an SSH-first server login form that can save and reuse multiple server credentials.

**Architecture:** The Tauri Rust layer owns local credential profile persistence and SSH connection probing. React renders SSH profile management and calls Tauri commands instead of asking users for a panel backend URL. Existing HTTP panel APIs remain in the repo during the transition but are no longer the login-page concept.

**Tech Stack:** Tauri v2, React, TypeScript, Zustand, Rust, JSON profile storage under the user's config directory.

---

## File Structure

- Modify `desktop/src/features/auth/connectionProfiles.ts`: change profile types from HTTP backend credentials to SSH server credentials, add save/delete command wrappers.
- Modify `desktop/src/features/auth/LoginScreen.tsx`: render SSH host, port, username, password/key mode, save profile controls, and advanced settings.
- Modify `desktop/src/i18n/messages.ts`: replace backend login labels with SSH labels.
- Modify `desktop/src-tauri/src/main.rs`: add SSH profile JSON persistence commands and a connection command boundary.
- Modify `desktop/src/App.tsx`: consume SSH credentials from the login page and set connected session state without exposing a backend URL field.
- Modify tests in `desktop/src/**/*.test.*`: update expectations to SSH fields and saved profile behavior.
- Modify `README.md`: document SSH-first login and saved server profiles.

## Task 1: Define SSH Profile Model

**Files:**
- Modify: `desktop/src/features/auth/connectionProfiles.ts`
- Test: `desktop/src/features/auth/connectionProfiles.test.ts`

- [ ] **Step 1: Update `ConnectionProfile` fields**

Use this shape:

```ts
export type AuthMethod = 'password' | 'key';

export interface ConnectionProfile {
  id: string;
  label: string;
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
  saveCredential: boolean;
}
```

- [ ] **Step 2: Add Tauri wrappers**

```ts
export function listConnectionProfiles() {
  return invoke<ConnectionProfile[]>('list_connection_profiles');
}

export function saveConnectionProfile(profile: ConnectionProfile) {
  return invoke<ConnectionProfile[]>('save_connection_profile', { profile });
}

export function deleteConnectionProfile(id: string) {
  return invoke<ConnectionProfile[]>('delete_connection_profile', { id });
}
```

- [ ] **Step 3: Update tests**

Run: `npm --prefix desktop test -- connectionProfiles`
Expected: profile tests pass with `host: "10.42.0.1"` and `port: 22`.

## Task 2: Add Rust Profile Persistence

**Files:**
- Modify: `desktop/src-tauri/src/main.rs`

- [ ] **Step 1: Replace backend profile struct**

Use serde `Deserialize` and store profiles in:

```text
%APPDATA%\LAN Transfer\ssh-profiles.json
```

- [ ] **Step 2: Implement commands**

Commands:

```rust
list_connection_profiles() -> Vec<ConnectionProfile>
save_connection_profile(profile: ConnectionProfile) -> Result<Vec<ConnectionProfile>, String>
delete_connection_profile(id: String) -> Result<Vec<ConnectionProfile>, String>
```

Default profile:

```text
label: 10.42.0.1
host: 10.42.0.1
port: 22
username: yufan
authMethod: password
```

- [ ] **Step 3: Keep credentials local**

Do not write secrets unless `saveCredential` is true. If false, persist only host, port, username, auth method, and label.

## Task 3: Redesign Login Screen

**Files:**
- Modify: `desktop/src/features/auth/LoginScreen.tsx`
- Modify: `desktop/src/i18n/messages.ts`
- Test: `desktop/src/features/auth/LoginScreen.test.tsx`

- [ ] **Step 1: Render SSH fields**

Fields:

```text
服务器配置 select
配置名称
服务器地址
SSH 端口
用户名
认证方式 radio: 密码 / SSH 密钥
密码 OR 私钥路径 + 密钥密码
保存此服务器配置 checkbox
保存配置 button
删除配置 button
连接 button
```

- [ ] **Step 2: Advanced section**

Use a native `<details>` block:

```text
Windows aria2 RPC
aria2 密钥
远程临时目录
远程下载服务：自动 / rclone serve / 自定义 HTTP
```

These values are UI-only in this task.

- [ ] **Step 3: Submit credentials**

`onSubmit` receives the full `ConnectionProfile` object.

## Task 4: Wire App Login Flow

**Files:**
- Modify: `desktop/src/App.tsx`
- Modify: `desktop/src/state/useAppStore.ts`
- Test: `desktop/src/App.test.tsx`
- Test: `desktop/src/App.login.test.tsx`

- [ ] **Step 1: Remove backend URL from login state**

Login should no longer ask for or display `backendUrl`.

- [ ] **Step 2: Add connected SSH session label**

After submit, show:

```text
已连接：yufan@10.42.0.1:22
```

- [ ] **Step 3: Keep remote browsing placeholder compatible**

Until the SSH directory backend is implemented, keep existing remote file UI isolated behind the session state so the login redesign can be tested independently.

## Task 5: Verification and Packaging

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run desktop tests**

Run:

```powershell
npm --prefix desktop test
```

Expected: `44` or more tests pass, `0` fail.

- [ ] **Step 2: Build installer**

Run:

```powershell
npm --prefix desktop exec tauri build -- --bundles nsis
```

Expected output includes:

```text
Finished 1 bundle at:
D:\Rust\target\release\bundle\nsis\LAN Transfer_0.1.0_x64-setup.exe
```

- [ ] **Step 3: Copy installer**

Copy to:

```text
E:\Code\lan-transfer-panel\dist\LAN Transfer_0.1.0_x64-setup.exe
```

## Self-Review

- The plan covers SSH login fields, password/key auth UI, multiple saved profiles, local profile persistence, tests, docs, and packaging.
- The plan intentionally excludes real SSH file listing and aria2 URL generation from this task; those are separate implementation tasks after the login model is corrected.
- No placeholder requirements remain.
