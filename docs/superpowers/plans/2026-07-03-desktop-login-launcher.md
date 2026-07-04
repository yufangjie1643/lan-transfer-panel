# 桌面端登录启动器实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Tauri 桌面端首屏从密集登录表单改为服务器启动器，让已保存的 SSH 配置可以一键连接、添加、编辑、删除。

**Architecture:** 新增 `LauncherScreen`（启动器）和 `ServerFormScreen`（添加/编辑表单）两个组件；`App.tsx` 通过 `appView` 状态在 `launcher` / `server-form` / `remote` 三视图之间切换；Zustand store 负责视图状态；文案统一进入 `i18n/messages.ts` 的 `launcher` 和 `serverForm` 命名空间。

**Tech Stack:** React 18, TypeScript, Zustand, Tauri v2 API (`@tauri-apps/api/core`), Vitest + jsdom + Testing Library.

## Global Constraints

- 不引入新的运行时依赖。
- 所有用户可见文案必须同时提供 `zh-CN` 和 `en-US`。
- 组件测试使用桌面端现有 `vitest` + `@testing-library/react`。
- 保持 SSH 连接成功后的 `RemoteExplorer` 行为不变。
- 表单校验失败必须聚焦到首个错误字段。
- `delete` 操作使用卡片内二次确认，不弹阻塞对话框。

## File Structure

| 文件 | 职责 |
|---|---|
| `desktop/src/state/useAppStore.ts` | 新增 `appView` 和 `editingProfileId` 状态及 setter。 |
| `desktop/src/i18n/messages.ts` | 新增 `launcher` 和 `serverForm` 文案命名空间。 |
| `desktop/src/features/auth/LauncherScreen.tsx` | 服务器卡片列表、连接、编辑、删除、添加入口。 |
| `desktop/src/features/auth/ServerFormScreen.tsx` | 新增/编辑服务器配置的完整表单。 |
| `desktop/src/features/auth/LauncherScreen.test.tsx` | 启动器组件测试。 |
| `desktop/src/features/auth/ServerFormScreen.test.tsx` | 表单组件测试。 |
| `desktop/src/App.tsx` | 集成启动器/表单/远程浏览器；替换原 `LoginScreen` 调用。 |
| `desktop/src/App.test.tsx` | 更新首屏断言为启动器。 |
| `desktop/src/App.login.test.tsx` | 更新登录流程断言为启动器连接流程。 |
| `desktop/src/features/auth/LoginScreen.tsx` | 删除（由 `ServerFormScreen` 替代）。 |
| `desktop/src/features/auth/LoginScreen.test.tsx` | 删除。 |

---

### Task 1: Extend Zustand store with view state

**Files:**
- Modify: `desktop/src/state/useAppStore.ts`
- Test: `desktop/src/state/useAppStore.test.ts`（新增）

**Interfaces:**
- Produces:
  - `appView: 'launcher' | 'server-form' | 'remote'`
  - `editingProfileId?: string`
  - `setAppView(view)`
  - `setEditingProfileId(id?)`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAppStore } from './useAppStore';

describe('useAppStore', () => {
  it('defaults to launcher view', () => {
    const { result } = renderHook(() => useAppStore());
    expect(result.current.appView).toBe('launcher');
  });

  it('can set appView and editingProfileId', () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.setAppView('server-form');
      result.current.setEditingProfileId('profile-1');
    });
    expect(result.current.appView).toBe('server-form');
    expect(result.current.editingProfileId).toBe('profile-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd desktop && npx vitest run src/state/useAppStore.test.ts`

Expected: FAIL — `appView` not defined on store.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { create } from 'zustand';
import type { RemoteItem } from '../api/types';

export type AppView = 'launcher' | 'server-form' | 'remote';

interface AppState {
  backendUrl: string;
  sessionUsername: string | null;
  remotes: string[];
  remote: string;
  remotePath: string;
  remoteItems: RemoteItem[];
  selectedRemoteKeys: Set<string>;
  error: string | null;
  appView: AppView;
  editingProfileId?: string;
  setBackendUrl: (backendUrl: string) => void;
  setSessionUsername: (sessionUsername: string | null) => void;
  setRemotes: (remotes: string[]) => void;
  setRemoteItems: (remote: string, remotePath: string, remoteItems: RemoteItem[]) => void;
  setSelectedRemoteKeys: (selectedRemoteKeys: Set<string>) => void;
  setError: (error: string | null) => void;
  setAppView: (appView: AppView) => void;
  setEditingProfileId: (editingProfileId?: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  backendUrl: 'http://10.42.0.1:5590',
  sessionUsername: null,
  remotes: [],
  remote: '',
  remotePath: '',
  remoteItems: [],
  selectedRemoteKeys: new Set(),
  error: null,
  appView: 'launcher',
  editingProfileId: undefined,
  setBackendUrl: (backendUrl) => set({ backendUrl }),
  setSessionUsername: (sessionUsername) => set({ sessionUsername }),
  setRemotes: (remotes) => set({ remotes }),
  setRemoteItems: (remote, remotePath, remoteItems) =>
    set({ remote, remotePath, remoteItems, selectedRemoteKeys: new Set() }),
  setSelectedRemoteKeys: (selectedRemoteKeys) => set({ selectedRemoteKeys }),
  setError: (error) => set({ error }),
  setAppView: (appView) => set({ appView }),
  setEditingProfileId: (editingProfileId) => set({ editingProfileId })
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd desktop && npx vitest run src/state/useAppStore.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd desktop
git add src/state/useAppStore.ts src/state/useAppStore.test.ts
git commit -m "feat(desktop): add appView and editingProfileId to app store"
```

---

### Task 2: Add i18n strings for launcher and server form

**Files:**
- Modify: `desktop/src/i18n/messages.ts`
- Test: `desktop/src/i18n/messages.test.ts`（更新，新增 key 存在性断言）

**Interfaces:**
- Consumes: `Messages` interface.
- Produces: `messages[locale].launcher` and `messages[locale].serverForm` with complete labels.

- [ ] **Step 1: Write the failing test**

Append to `desktop/src/i18n/messages.test.ts` (or create if missing):

```typescript
import { describe, expect, it } from 'vitest';
import { messages } from './messages';

describe('messages', () => {
  it('has launcher labels in both locales', () => {
    expect(messages['zh-CN'].launcher.title).toBeTypeOf('string');
    expect(messages['en-US'].launcher.title).toBeTypeOf('string');
  });

  it('has serverForm validation labels in both locales', () => {
    expect(messages['zh-CN'].serverForm.validation.hostRequired).toBeTypeOf('string');
    expect(messages['en-US'].serverForm.validation.hostRequired).toBeTypeOf('string');
  });
});
```

Run: `cd desktop && npx vitest run src/i18n/messages.test.ts`

Expected: FAIL — `launcher` and `serverForm` do not exist on `Messages`.

- [ ] **Step 2: Extend the Messages interface and add translations**

Update `desktop/src/i18n/messages.ts`:

```typescript
export type Locale = 'zh-CN' | 'en-US';

interface Messages {
  appTitle: string;
  language: {
    label: string;
    zhCN: string;
    enUS: string;
  };
  connection: {
    region: string;
    backendUrl: string;
    username: string;
    password: string;
    connect: string;
    disconnected: string;
    connecting: string;
    connectedAs: (username: string) => string;
    loginFailed: string;
    switchConnection: string;
  };
  launcher: {
    title: string;
    emptyTitle: string;
    emptySubtitle: string;
    addServer: string;
    connect: string;
    connecting: string;
    edit: string;
    delete: string;
    confirmDelete: string;
  };
  serverForm: {
    titleAdd: string;
    titleEdit: string;
    label: string;
    host: string;
    port: string;
    username: string;
    authMethod: string;
    passwordAuth: string;
    keyAuth: string;
    password: string;
    privateKeyPath: string;
    passphrase: string;
    advanced: string;
    aria2Rpc: string;
    aria2Secret: string;
    remoteTempDir: string;
    remoteDownloadService: string;
    cancel: string;
    save: string;
    saveAndConnect: string;
    validation: {
      labelRequired: string;
      hostRequired: string;
      portInvalid: string;
      usernameRequired: string;
      passwordRequired: string;
      privateKeyRequired: string;
    };
  };
  panes: {
    local: string;
    localTree: string;
    localDetails: string;
    remote: string;
    remoteTree: string;
    remoteDetails: string;
    downloadTo: string;
    remotePath: string;
    openPath: string;
    back: string;
    forward: string;
    parent: string;
    refresh: (title: string) => string;
    expandFolder: (name: string) => string;
    collapseFolder: (name: string) => string;
  };
  drag: {
    differentPanes: string;
  };
  queue: {
    title: string;
    taskCount: (count: number) => string;
    pause: (gid: string) => string;
    resume: (gid: string) => string;
    remove: (gid: string) => string;
  };
  errors: {
    openDirectoryFailed: string;
    refreshFailed: string;
    queueControlFailed: string;
    downloadFailed: string;
  };
}
```

Update `messages['zh-CN']`:

```typescript
'zh-CN': {
  appTitle: '局域网传输',
  language: { label: '语言', zhCN: '中文', enUS: 'English' },
  connection: {
    region: '连接设置',
    backendUrl: '后端地址',
    username: '用户名',
    password: '登录密码',
    connect: '连接',
    disconnected: '未连接',
    connecting: '连接中...',
    connectedAs: (username) => `已连接：${username}`,
    loginFailed: '登录失败',
    switchConnection: '切换连接'
  },
  launcher: {
    title: '选择服务器',
    emptyTitle: '还没有保存的服务器',
    emptySubtitle: '点击下方按钮添加第一台服务器',
    addServer: '添加服务器',
    connect: '连接',
    connecting: '连接中...',
    edit: '编辑',
    delete: '删除',
    confirmDelete: '确认删除？'
  },
  serverForm: {
    titleAdd: '添加服务器',
    titleEdit: '编辑服务器',
    label: '配置名称',
    host: '服务器地址',
    port: 'SSH 端口',
    username: '用户名',
    authMethod: '认证方式',
    passwordAuth: '密码',
    keyAuth: 'SSH 密钥',
    password: '登录密码',
    privateKeyPath: '私钥路径',
    passphrase: '密钥密码，可选',
    advanced: '高级设置',
    aria2Rpc: 'Windows aria2 RPC',
    aria2Secret: 'aria2 密钥，可选',
    remoteTempDir: '远程临时目录',
    remoteDownloadService: '远程下载服务',
    cancel: '取消',
    save: '保存',
    saveAndConnect: '保存并连接',
    validation: {
      labelRequired: '请输入配置名称',
      hostRequired: '请输入服务器地址',
      portInvalid: '端口号必须在 1–65535 之间',
      usernameRequired: '请输入用户名',
      passwordRequired: '请输入登录密码',
      privateKeyRequired: '请输入私钥路径'
    }
  },
  // ... keep existing panes, drag, queue, errors unchanged
  panes: {
    local: '本地文件',
    localTree: '本地目录树',
    localDetails: '本地文件详情',
    remote: '远端文件',
    remoteTree: '远端目录树',
    remoteDetails: '远端文件详情',
    downloadTo: '下载到...',
    remotePath: '远程路径',
    openPath: '打开路径',
    back: '后退',
    forward: '前进',
    parent: '上一级',
    refresh: (title) => `刷新${title}`,
    expandFolder: (name) => `展开 ${name}`,
    collapseFolder: (name) => `折叠 ${name}`
  },
  drag: {
    differentPanes: '请在本地和远端之间拖放文件'
  },
  queue: {
    title: '传输队列',
    taskCount: (count) => `${count} 个任务`,
    pause: (gid) => `暂停 ${gid}`,
    resume: (gid) => `继续 ${gid}`,
    remove: (gid) => `移除 ${gid}`
  },
  errors: {
    openDirectoryFailed: '打开目录失败',
    refreshFailed: '刷新失败',
    queueControlFailed: '控制队列失败',
    downloadFailed: '添加下载失败'
  }
}
```

Update `messages['en-US']` symmetrically:

```typescript
'en-US': {
  appTitle: 'LAN Transfer',
  language: { label: 'Language', zhCN: '中文', enUS: 'English' },
  connection: {
    region: 'Connection',
    backendUrl: 'Backend URL',
    username: 'Username',
    password: 'Login password',
    connect: 'Connect',
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    connectedAs: (username) => `Connected as ${username}`,
    loginFailed: 'Login failed',
    switchConnection: 'Switch connection'
  },
  launcher: {
    title: 'Select server',
    emptyTitle: 'No saved servers',
    emptySubtitle: 'Add your first server below',
    addServer: 'Add server',
    connect: 'Connect',
    connecting: 'Connecting...',
    edit: 'Edit',
    delete: 'Delete',
    confirmDelete: 'Confirm delete?'
  },
  serverForm: {
    titleAdd: 'Add server',
    titleEdit: 'Edit server',
    label: 'Profile name',
    host: 'Server address',
    port: 'SSH port',
    username: 'Username',
    authMethod: 'Authentication',
    passwordAuth: 'Password',
    keyAuth: 'SSH key',
    password: 'Login password',
    privateKeyPath: 'Private key path',
    passphrase: 'Key passphrase, optional',
    advanced: 'Advanced settings',
    aria2Rpc: 'Windows aria2 RPC',
    aria2Secret: 'aria2 secret, optional',
    remoteTempDir: 'Remote temp directory',
    remoteDownloadService: 'Remote download service',
    cancel: 'Cancel',
    save: 'Save',
    saveAndConnect: 'Save & connect',
    validation: {
      labelRequired: 'Profile name is required',
      hostRequired: 'Server address is required',
      portInvalid: 'Port must be between 1 and 65535',
      usernameRequired: 'Username is required',
      passwordRequired: 'Login password is required',
      privateKeyRequired: 'Private key path is required'
    }
  },
  // ... keep existing panes, drag, queue, errors unchanged
  panes: {
    local: 'Local files',
    localTree: 'Local folder tree',
    localDetails: 'Local file details',
    remote: 'Remote files',
    remoteTree: 'Remote folder tree',
    remoteDetails: 'Remote file details',
    downloadTo: 'Download to...',
    remotePath: 'Remote path',
    openPath: 'Open path',
    back: 'Back',
    forward: 'Forward',
    parent: 'Up one level',
    refresh: (title) => `Refresh ${title}`,
    expandFolder: (name) => `Expand ${name}`,
    collapseFolder: (name) => `Collapse ${name}`
  },
  drag: {
    differentPanes: 'Drop between different panes to transfer files'
  },
  queue: {
    title: 'Transfer queue',
    taskCount: (count) => `${count} tasks`,
    pause: (gid) => `Pause ${gid}`,
    resume: (gid) => `Resume ${gid}`,
    remove: (gid) => `Remove ${gid}`
  },
  errors: {
    openDirectoryFailed: 'Open directory failed',
    refreshFailed: 'Refresh failed',
    queueControlFailed: 'Queue control failed',
    downloadFailed: 'Add download failed'
  }
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd desktop && npx vitest run src/i18n/messages.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd desktop
git add src/i18n/messages.ts src/i18n/messages.test.ts
git commit -m "feat(desktop): add launcher and serverForm i18n strings"
```

---

### Task 3: Create ServerFormScreen component

**Files:**
- Create: `desktop/src/features/auth/ServerFormScreen.tsx`
- Create: `desktop/src/features/auth/ServerFormScreen.test.tsx`

**Interfaces:**
- Consumes:
  - `ConnectionProfile` from `./connectionProfiles`
  - `ServerFormLabels` shape from `messages[locale].serverForm`
- Produces:
  - Component `ServerFormScreen(props)`
  - Props:
    ```typescript
    interface ServerFormScreenProps {
      labels: ServerFormLabels;
      profile?: ConnectionProfile;
      error?: string | null;
      isSaving?: boolean;
      onCancel: () => void;
      onSave: (profile: ConnectionProfile) => void;
      onSaveAndConnect?: (profile: ConnectionProfile) => void;
    }
    ```

- [ ] **Step 1: Write the failing test**

Create `desktop/src/features/auth/ServerFormScreen.test.tsx`:

```typescript
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ServerFormScreen } from './ServerFormScreen';
import type { ConnectionProfile } from './connectionProfiles';
import { messages } from '../../i18n/messages';

const labels = messages['zh-CN'].serverForm;

describe('ServerFormScreen', () => {
  it('renders empty form in add mode', () => {
    render(<ServerFormScreen labels={labels} onCancel={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole('heading')).toHaveTextContent('添加服务器');
    expect(screen.getByLabelText('配置名称')).toHaveValue('');
  });

  it('renders filled form in edit mode', () => {
    const profile: ConnectionProfile = {
      id: 'p1',
      label: 'home',
      host: '10.42.0.1',
      port: 2687,
      username: 'yufan',
      authMethod: 'password',
      password: 'secret',
      saveCredential: true
    };
    render(
      <ServerFormScreen labels={labels} profile={profile} onCancel={vi.fn()} onSave={vi.fn()} />
    );
    expect(screen.getByRole('heading')).toHaveTextContent('编辑服务器');
    expect(screen.getByLabelText('配置名称')).toHaveValue('home');
    expect(screen.getByLabelText('服务器地址')).toHaveValue('10.42.0.1');
  });

  it('shows validation errors and does not submit when required fields are empty', () => {
    const onSave = vi.fn();
    render(<ServerFormScreen labels={labels} onCancel={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByText('请输入配置名称')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('calls onSave with form values when valid', () => {
    const onSave = vi.fn();
    render(<ServerFormScreen labels={labels} onCancel={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('配置名称'), { target: { value: 'home' } });
    fireEvent.change(screen.getByLabelText('服务器地址'), { target: { value: '10.42.0.1' } });
    fireEvent.change(screen.getByLabelText('SSH 端口'), { target: { value: '2687' } });
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'yufan' } });
    fireEvent.change(screen.getByLabelText('登录密码'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).toHaveBeenCalledOnce();
    const saved: ConnectionProfile = onSave.mock.calls[0][0];
    expect(saved.label).toBe('home');
    expect(saved.host).toBe('10.42.0.1');
    expect(saved.port).toBe(2687);
    expect(saved.username).toBe('yufan');
    expect(saved.password).toBe('secret');
  });

  it('calls onSaveAndConnect when that button is clicked', () => {
    const onSaveAndConnect = vi.fn();
    render(
      <ServerFormScreen
        labels={labels}
        onCancel={vi.fn()}
        onSave={vi.fn()}
        onSaveAndConnect={onSaveAndConnect}
      />
    );
    fireEvent.change(screen.getByLabelText('配置名称'), { target: { value: 'home' } });
    fireEvent.change(screen.getByLabelText('服务器地址'), { target: { value: '10.42.0.1' } });
    fireEvent.change(screen.getByLabelText('SSH 端口'), { target: { value: '2687' } });
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'yufan' } });
    fireEvent.change(screen.getByLabelText('登录密码'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '保存并连接' }));
    expect(onSaveAndConnect).toHaveBeenCalledOnce();
  });
});
```

Run: `cd desktop && npx vitest run src/features/auth/ServerFormScreen.test.tsx`

Expected: FAIL — component not found.

- [ ] **Step 2: Implement ServerFormScreen**

Create `desktop/src/features/auth/ServerFormScreen.tsx`:

```typescript
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { ConnectionProfile } from './connectionProfiles';

export interface ServerFormLabels {
  titleAdd: string;
  titleEdit: string;
  label: string;
  host: string;
  port: string;
  username: string;
  authMethod: string;
  passwordAuth: string;
  keyAuth: string;
  password: string;
  privateKeyPath: string;
  passphrase: string;
  advanced: string;
  aria2Rpc: string;
  aria2Secret: string;
  remoteTempDir: string;
  remoteDownloadService: string;
  cancel: string;
  save: string;
  saveAndConnect: string;
  validation: {
    labelRequired: string;
    hostRequired: string;
    portInvalid: string;
    usernameRequired: string;
    passwordRequired: string;
    privateKeyRequired: string;
  };
}

interface FormErrors {
  label?: string;
  host?: string;
  port?: string;
  username?: string;
  credential?: string;
}

interface ServerFormScreenProps {
  labels: ServerFormLabels;
  profile?: ConnectionProfile;
  error?: string | null;
  isSaving?: boolean;
  onCancel: () => void;
  onSave: (profile: ConnectionProfile) => void;
  onSaveAndConnect?: (profile: ConnectionProfile) => void;
}

function emptyProfile(): ConnectionProfile {
  return {
    id: `custom-${Date.now()}`,
    label: '',
    host: '',
    port: 22,
    username: '',
    authMethod: 'password',
    password: '',
    privateKeyPath: '',
    passphrase: '',
    saveCredential: true
  };
}

export function ServerFormScreen({
  labels,
  profile,
  error,
  isSaving,
  onCancel,
  onSave,
  onSaveAndConnect
}: ServerFormScreenProps) {
  const isEdit = Boolean(profile);
  const initial = useMemo(() => profile ?? emptyProfile(), [profile]);
  const [label, setLabel] = useState(initial.label);
  const [host, setHost] = useState(initial.host);
  const [port, setPort] = useState(String(initial.port ?? 22));
  const [username, setUsername] = useState(initial.username);
  const [authMethod, setAuthMethod] = useState<ConnectionProfile['authMethod']>(
    initial.authMethod
  );
  const [password, setPassword] = useState(initial.password ?? '');
  const [privateKeyPath, setPrivateKeyPath] = useState(initial.privateKeyPath ?? '');
  const [passphrase, setPassphrase] = useState(initial.passphrase ?? '');
  const [aria2Rpc, setAria2Rpc] = useState('http://127.0.0.1:6800/jsonrpc');
  const [aria2Secret, setAria2Secret] = useState('');
  const [remoteTempDir, setRemoteTempDir] = useState('/tmp/lan-transfer');
  const [remoteDownloadService, setRemoteDownloadService] = useState('auto');
  const [errors, setErrors] = useState<FormErrors>({});

  const labelRef = useRef<HTMLInputElement | null>(null);
  const hostRef = useRef<HTMLInputElement | null>(null);
  const portRef = useRef<HTMLInputElement | null>(null);
  const usernameRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const privateKeyPathRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setLabel(initial.label);
    setHost(initial.host);
    setPort(String(initial.port ?? 22));
    setUsername(initial.username);
    setAuthMethod(initial.authMethod);
    setPassword(initial.password ?? '');
    setPrivateKeyPath(initial.privateKeyPath ?? '');
    setPassphrase(initial.passphrase ?? '');
    setErrors({});
  }, [initial]);

  useEffect(() => {
    if (!Object.keys(errors).length) return;
    const firstField: keyof FormErrors = errors.label
      ? 'label'
      : errors.host
        ? 'host'
        : errors.port
          ? 'port'
          : errors.username
            ? 'username'
            : 'credential';
    const refMap: Record<keyof FormErrors, React.RefObject<HTMLInputElement | null>> = {
      label: labelRef,
      host: hostRef,
      port: portRef,
      username: usernameRef,
      credential: authMethod === 'password' ? passwordRef : privateKeyPathRef
    };
    refMap[firstField].current?.focus();
  }, [errors, authMethod]);

  function buildProfile(): ConnectionProfile {
    return {
      id: profile?.id ?? `custom-${Date.now()}`,
      label: label.trim(),
      host: host.trim(),
      port: Number(port) || 22,
      username: username.trim(),
      authMethod,
      password: authMethod === 'password' ? password : '',
      privateKeyPath: authMethod === 'key' ? privateKeyPath : '',
      passphrase: authMethod === 'key' ? passphrase : '',
      saveCredential: true
    };
  }

  function validate(): FormErrors | null {
    const next: FormErrors = {};
    if (!label.trim()) next.label = labels.validation.labelRequired;
    if (!host.trim()) next.host = labels.validation.hostRequired;
    const portNum = Number(port);
    if (!port || portNum < 1 || portNum > 65535) next.port = labels.validation.portInvalid;
    if (!username.trim()) next.username = labels.validation.usernameRequired;
    if (authMethod === 'password' && !password) {
      next.credential = labels.validation.passwordRequired;
    }
    if (authMethod === 'key' && !privateKeyPath.trim()) {
      next.credential = labels.validation.privateKeyRequired;
    }
    return Object.keys(next).length ? next : null;
  }

  function submitForm(andConnect: boolean) {
    const validationErrors = validate();
    if (validationErrors) {
      setErrors(validationErrors);
      return;
    }
    const nextProfile = buildProfile();
    if (andConnect && onSaveAndConnect) onSaveAndConnect(nextProfile);
    else onSave(nextProfile);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitForm(false);
  }

  function handleSaveAndConnectClick() {
    submitForm(true);
  }

  return (
    <section className="server-form-panel" aria-label={isEdit ? labels.titleEdit : labels.titleAdd}>
      <div className="server-form-heading">
        <strong>{isEdit ? labels.titleEdit : labels.titleAdd}</strong>
      </div>
      <form className="server-form" onSubmit={handleSubmit}>
        <label>
          {labels.label}
          <input
            ref={labelRef}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            aria-invalid={errors.label ? 'true' : 'false'}
          />
          {errors.label ? <span className="field-error">{errors.label}</span> : null}
        </label>
        <div className="form-row">
          <label>
            {labels.host}
            <input
              ref={hostRef}
              value={host}
              onChange={(event) => setHost(event.target.value)}
              aria-invalid={errors.host ? 'true' : 'false'}
            />
            {errors.host ? <span className="field-error">{errors.host}</span> : null}
          </label>
          <label>
            {labels.port}
            <input
              ref={portRef}
              type="number"
              min="1"
              max="65535"
              value={port}
              onChange={(event) => setPort(event.target.value)}
              aria-invalid={errors.port ? 'true' : 'false'}
            />
            {errors.port ? <span className="field-error">{errors.port}</span> : null}
          </label>
        </div>
        <label>
          {labels.username}
          <input
            ref={usernameRef}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            aria-invalid={errors.username ? 'true' : 'false'}
          />
          {errors.username ? <span className="field-error">{errors.username}</span> : null}
        </label>
        <fieldset className="auth-method-group">
          <legend>{labels.authMethod}</legend>
          <label>
            <input
              type="radio"
              name="auth-method"
              value="password"
              checked={authMethod === 'password'}
              onChange={() => setAuthMethod('password')}
            />
            {labels.passwordAuth}
          </label>
          <label>
            <input
              type="radio"
              name="auth-method"
              value="key"
              checked={authMethod === 'key'}
              onChange={() => setAuthMethod('key')}
            />
            {labels.keyAuth}
          </label>
        </fieldset>
        {authMethod === 'password' ? (
          <label>
            {labels.password}
            <input
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={errors.credential ? 'true' : 'false'}
            />
            {errors.credential ? <span className="field-error">{errors.credential}</span> : null}
          </label>
        ) : (
          <>
            <label>
              {labels.privateKeyPath}
              <input
                ref={privateKeyPathRef}
                value={privateKeyPath}
                onChange={(event) => setPrivateKeyPath(event.target.value)}
                aria-invalid={errors.credential ? 'true' : 'false'}
              />
            </label>
            <label>
              {labels.passphrase}
              <input
                type="password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
              />
            </label>
            {errors.credential ? <span className="field-error">{errors.credential}</span> : null}
          </>
        )}
        <details className="advanced-settings">
          <summary>{labels.advanced}</summary>
          <label>
            {labels.aria2Rpc}
            <input value={aria2Rpc} onChange={(event) => setAria2Rpc(event.target.value)} />
          </label>
          <label>
            {labels.aria2Secret}
            <input
              type="password"
              value={aria2Secret}
              onChange={(event) => setAria2Secret(event.target.value)}
            />
          </label>
          <label>
            {labels.remoteTempDir}
            <input value={remoteTempDir} onChange={(event) => setRemoteTempDir(event.target.value)} />
          </label>
          <label>
            {labels.remoteDownloadService}
            <select
              value={remoteDownloadService}
              onChange={(event) => setRemoteDownloadService(event.target.value)}
            >
              <option value="auto">自动</option>
              <option value="rclone">rclone serve</option>
              <option value="http">自定义 HTTP</option>
            </select>
          </label>
        </details>
        <div className="form-actions">
          <button type="button" onClick={onCancel} disabled={isSaving}>
            {labels.cancel}
          </button>
          <button type="submit" disabled={isSaving}>
            {labels.save}
          </button>
          {onSaveAndConnect ? (
            <button
              type="button"
              className="primary"
              disabled={isSaving}
              onClick={handleSaveAndConnectClick}
            >
              {labels.saveAndConnect}
            </button>
          ) : null}
        </div>
        {error ? (
          <p className="connection-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd desktop && npx vitest run src/features/auth/ServerFormScreen.test.tsx`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd desktop
git add src/features/auth/ServerFormScreen.tsx src/features/auth/ServerFormScreen.test.tsx
git commit -m "feat(desktop): add ServerFormScreen for adding and editing SSH profiles"
```

---

### Task 4: Create LauncherScreen component

**Files:**
- Create: `desktop/src/features/auth/LauncherScreen.tsx`
- Create: `desktop/src/features/auth/LauncherScreen.test.tsx`

**Interfaces:**
- Consumes:
  - `ConnectionProfile` from `./connectionProfiles`
  - `LauncherLabels` shape from `messages[locale].launcher`
- Produces:
  - Component `LauncherScreen(props)`
  - Props:
    ```typescript
    interface LauncherScreenProps {
      labels: LauncherLabels;
      profiles: ConnectionProfile[];
      connectingId?: string | null;
      errors?: Record<string, string>;
      onConnect: (profile: ConnectionProfile) => void;
      onEdit: (profile: ConnectionProfile) => void;
      onDelete: (id: string) => void;
      onAdd: () => void;
    }
    ```

- [ ] **Step 1: Write the failing test**

Create `desktop/src/features/auth/LauncherScreen.test.tsx`:

```typescript
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LauncherScreen } from './LauncherScreen';
import type { ConnectionProfile } from './connectionProfiles';
import { messages } from '../../i18n/messages';

const labels = messages['zh-CN'].launcher;

const profiles: ConnectionProfile[] = [
  {
    id: 'p1',
    label: 'home',
    host: '10.42.0.1',
    port: 2687,
    username: 'yufan',
    authMethod: 'password',
    password: 'secret',
    saveCredential: true
  },
  {
    id: 'p2',
    label: 'office',
    host: '192.168.1.10',
    port: 22,
    username: 'admin',
    authMethod: 'key',
    privateKeyPath: 'C:\\Users\\admin\\.ssh\\id_rsa',
    saveCredential: true
  }
];

describe('LauncherScreen', () => {
  it('renders profile cards', () => {
    render(
      <LauncherScreen
        labels={labels}
        profiles={profiles}
        onConnect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );
    expect(screen.getByText('home')).toBeInTheDocument();
    expect(screen.getByText('10.42.0.1:2687')).toBeInTheDocument();
    expect(screen.getByText('office')).toBeInTheDocument();
  });

  it('calls onConnect when connect button clicked', () => {
    const onConnect = vi.fn();
    render(
      <LauncherScreen
        labels={labels}
        profiles={profiles}
        onConnect={onConnect}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );
    fireEvent.click(screen.getAllByRole('button', { name: '连接' })[0]);
    expect(onConnect).toHaveBeenCalledWith(profiles[0]);
  });

  it('calls onEdit when edit link clicked', () => {
    const onEdit = vi.fn();
    render(
      <LauncherScreen
        labels={labels}
        profiles={profiles}
        onConnect={vi.fn()}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );
    fireEvent.click(screen.getAllByText('编辑')[0]);
    expect(onEdit).toHaveBeenCalledWith(profiles[0]);
  });

  it('requires confirmation before delete', () => {
    const onDelete = vi.fn();
    render(
      <LauncherScreen
        labels={labels}
        profiles={profiles}
        onConnect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={onDelete}
        onAdd={vi.fn()}
      />
    );
    fireEvent.click(screen.getAllByText('删除')[0]);
    expect(screen.getByText('确认删除？')).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('确认删除？'));
    expect(onDelete).toHaveBeenCalledWith('p1');
  });

  it('shows empty state when no profiles', () => {
    render(
      <LauncherScreen
        labels={labels}
        profiles={[]}
        onConnect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );
    expect(screen.getByText('还没有保存的服务器')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加服务器' })).toBeInTheDocument();
  });

  it('calls onAdd when add button clicked', () => {
    const onAdd = vi.fn();
    render(
      <LauncherScreen
        labels={labels}
        profiles={profiles}
        onConnect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={onAdd}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '添加服务器' }));
    expect(onAdd).toHaveBeenCalled();
  });

  it('displays inline error for a profile', () => {
    render(
      <LauncherScreen
        labels={labels}
        profiles={profiles}
        errors={{ p1: '连接超时' }}
        onConnect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );
    expect(screen.getByText('连接超时')).toBeInTheDocument();
  });
});
```

Run: `cd desktop && npx vitest run src/features/auth/LauncherScreen.test.tsx`

Expected: FAIL — component not found.

- [ ] **Step 2: Implement LauncherScreen**

Create `desktop/src/features/auth/LauncherScreen.tsx`:

```typescript
import { useState } from 'react';
import type { ConnectionProfile } from './connectionProfiles';

export interface LauncherLabels {
  title: string;
  emptyTitle: string;
  emptySubtitle: string;
  addServer: string;
  connect: string;
  connecting: string;
  edit: string;
  delete: string;
  confirmDelete: string;
}

interface LauncherScreenProps {
  labels: LauncherLabels;
  profiles: ConnectionProfile[];
  connectingId?: string | null;
  errors?: Record<string, string>;
  onConnect: (profile: ConnectionProfile) => void;
  onEdit: (profile: ConnectionProfile) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

export function LauncherScreen({
  labels,
  profiles,
  connectingId,
  errors,
  onConnect,
  onEdit,
  onDelete,
  onAdd
}: LauncherScreenProps) {
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  return (
    <section className="launcher-panel" aria-label={labels.title}>
      <header className="launcher-header">
        <h2>{labels.title}</h2>
        <button type="button" className="mock-button primary" onClick={onAdd}>
          {labels.addServer}
        </button>
      </header>
      {profiles.length === 0 ? (
        <div className="launcher-empty">
          <strong>{labels.emptyTitle}</strong>
          <p>{labels.emptySubtitle}</p>
          <button type="button" className="mock-button primary" onClick={onAdd}>
            {labels.addServer}
          </button>
        </div>
      ) : (
        <ul className="server-cards">
          {profiles.map((profile) => {
            const isConnecting = connectingId === profile.id;
            const error = errors?.[profile.id];
            const isConfirmingDelete = confirmingDeleteId === profile.id;
            return (
              <li key={profile.id} className="server-card">
                <div className="server-card-body">
                  <h3>{profile.label}</h3>
                  <p className="server-card-host">{`${profile.host}:${profile.port}`}</p>
                  <p className="server-card-user">{profile.username}</p>
                  {error ? <p className="server-card-error">{error}</p> : null}
                </div>
                <div className="server-card-actions">
                  <button
                    type="button"
                    className="mock-button primary"
                    disabled={isConnecting}
                    onClick={() => onConnect(profile)}
                  >
                    {isConnecting ? labels.connecting : labels.connect}
                  </button>
                  <button type="button" className="link-button" onClick={() => onEdit(profile)}>
                    {labels.edit}
                  </button>
                  {isConfirmingDelete ? (
                    <button
                      type="button"
                      className="link-button danger"
                      onClick={() => {
                        onDelete(profile.id);
                        setConfirmingDeleteId(null);
                      }}
                    >
                      {labels.confirmDelete}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="link-button danger"
                      onClick={() => setConfirmingDeleteId(profile.id)}
                    >
                      {labels.delete}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd desktop && npx vitest run src/features/auth/LauncherScreen.test.tsx`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd desktop
git add src/features/auth/LauncherScreen.tsx src/features/auth/LauncherScreen.test.tsx
git commit -m "feat(desktop): add LauncherScreen for one-click SSH profile connection"
```

---

### Task 5: Integrate launcher and form into App.tsx

**Files:**
- Modify: `desktop/src/App.tsx`
- Modify: `desktop/src/state/useAppStore.ts`（已在本计划 Task 1 完成）

**Interfaces:**
- Consumes:
  - `LauncherScreen`, `ServerFormScreen`
  - `appView`, `editingProfileId`, `setAppView`, `setEditingProfileId` from store
  - `listConnectionProfiles`, `saveConnectionProfile`, `deleteConnectionProfile`
- Produces:
  - App renders `launcher` / `server-form` / `remote` views.

- [ ] **Step 1: Update App.tsx imports and store selectors**

Replace the top of `desktop/src/App.tsx`:

```typescript
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { PanelApiClient } from './api/client';
import type { RemoteItem } from './api/types';
import {
  defaultConnectionProfiles,
  deleteConnectionProfile,
  listConnectionProfiles,
  saveConnectionProfile,
  type ConnectionProfile
} from './features/auth/connectionProfiles';
import { LauncherScreen } from './features/auth/LauncherScreen';
import { ServerFormScreen } from './features/auth/ServerFormScreen';
import { selectDownloadDirectory } from './features/local/localFs';
import type { FolderTreeNode } from './features/local/FolderTree';
import { RemoteExplorer } from './features/remote/RemoteExplorer';
import {
  listSshDirectory,
  prepareSshVirtualFile,
  startSshDownloadTask,
  startVirtualFileDrag,
  testSshConnection
} from './features/remote/sshRemote';
import { defaultLocale, messages, type Locale } from './i18n/messages';
import { useAppStore } from './state/useAppStore';
```

Add store selectors inside `App` (after `const text = messages[locale];`):

```typescript
  const appView = useAppStore((state) => state.appView);
  const editingProfileId = useAppStore((state) => state.editingProfileId);
  const setAppView = useAppStore((state) => state.setAppView);
  const setEditingProfileId = useAppStore((state) => state.setEditingProfileId);
```

- [ ] **Step 2: Replace LoginScreen rendering block with launcher/form views**

Replace:

```typescript
  if (!sessionUsername) {
    return (
      <main className="login-shell">
        <header className="login-top-bar">
          <strong>{text.appTitle}</strong>
          <label className="language-switch">
            {text.language.label}
            <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
              <option value="zh-CN">{text.language.zhCN}</option>
              <option value="en-US">{text.language.enUS}</option>
            </select>
          </label>
        </header>
        <LoginScreen
          labels={text.login}
          profiles={connectionProfiles}
          isConnecting={isConnecting}
          error={error}
          onSubmit={handleLogin}
          onSaveProfile={handleSaveProfile}
          onDeleteProfile={handleDeleteProfile}
        />
      </main>
    );
  }
```

With:

```typescript
  if (appView !== 'remote') {
    return (
      <main className="launcher-shell">
        <header className="login-top-bar">
          <strong>{text.appTitle}</strong>
          <label className="language-switch">
            {text.language.label}
            <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
              <option value="zh-CN">{text.language.zhCN}</option>
              <option value="en-US">{text.language.enUS}</option>
            </select>
          </label>
        </header>
        {appView === 'launcher' ? (
          <LauncherScreen
            labels={text.launcher}
            profiles={connectionProfiles}
            connectingId={isConnecting ? sshProfile?.id : null}
            errors={launcherErrors}
            onConnect={handleConnect}
            onEdit={handleEditProfile}
            onDelete={handleDeleteProfile}
            onAdd={handleAddProfile}
          />
        ) : (
          <ServerFormScreen
            labels={text.serverForm}
            profile={connectionProfiles.find((p) => p.id === editingProfileId)}
            error={error}
            isSaving={isSavingProfile}
            onCancel={handleFormCancel}
            onSave={handleSaveProfile}
            onSaveAndConnect={handleSaveAndConnect}
          />
        )}
      </main>
    );
  }
```

Add supporting state and handlers (before the `return`):

```typescript
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [launcherErrors, setLauncherErrors] = useState<Record<string, string>>({});

  const handleAddProfile = useCallback(() => {
    setError(null);
    setEditingProfileId(undefined);
    setAppView('server-form');
  }, [setAppView, setEditingProfileId, setError]);

  const handleEditProfile = useCallback(
    (profile: ConnectionProfile) => {
      setError(null);
      setEditingProfileId(profile.id);
      setAppView('server-form');
    },
    [setAppView, setEditingProfileId, setError]
  );

  const handleFormCancel = useCallback(() => {
    setError(null);
    setEditingProfileId(undefined);
    setAppView('launcher');
  }, [setAppView, setEditingProfileId, setError]);

  async function handleSaveProfile(profile: ConnectionProfile) {
    setIsSavingProfile(true);
    setError(null);
    try {
      const profiles = await saveConnectionProfile(profile);
      setConnectionProfiles(profiles);
      setEditingProfileId(undefined);
      setAppView('launcher');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存配置失败');
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleSaveAndConnect(profile: ConnectionProfile) {
    setIsSavingProfile(true);
    setError(null);
    try {
      const profiles = await saveConnectionProfile(profile);
      setConnectionProfiles(profiles);
      await handleConnect(profile);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存配置失败');
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleConnect(credentials: ConnectionProfile) {
    setIsConnecting(true);
    setError(null);
    setLauncherErrors((current) => {
      const next = { ...current };
      delete next[credentials.id];
      return next;
    });
    try {
      await testSshConnection(credentials);
      const root = `/home/${credentials.username}`;
      setSshRoot(root);
      setSshProfile(credentials);
      setSessionUsername(`${credentials.username}@${credentials.host}:${credentials.port}`);
      setRemotes(['server']);
      setRemoteTreeChildren({});
      setExpandedRemotePaths(new Set(pathAncestors(root)));
      await loadSshDirectory(credentials, root);
      setRemoteHistory([root]);
      setRemoteHistoryIndex(0);
      setAppView('remote');
    } catch (connectError) {
      setSshProfile(null);
      setSessionUsername(null);
      const message = connectError instanceof Error ? connectError.message : text.connection.loginFailed;
      setLauncherErrors((current) => ({ ...current, [credentials.id]: message }));
      setError(message);
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleDeleteProfile(id: string) {
    setError(null);
    try {
      const profiles = await deleteConnectionProfile(id);
      setConnectionProfiles(profiles);
      setLauncherErrors((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除配置失败');
    }
  }
```

Remove the old `handleLogin`, `handleSaveProfile`, and `handleDeleteProfile` function definitions that conflict (they were void-returning wrappers around the invoke calls).

Also update `handleSwitchConnection` to return to launcher:

```typescript
  function handleSwitchConnection() {
    client.logout().catch(() => undefined);
    setSshProfile(null);
    setSessionUsername(null);
    setRemoteItems('', '', []);
    setRemoteTreeChildren({});
    setExpandedRemotePaths(new Set(['/']));
    setRemoteHistory([]);
    setRemoteHistoryIndex(-1);
    setAppView('launcher');
  }
```

- [ ] **Step 3: Run existing tests to verify no regressions**

Run: `cd desktop && npx vitest run src/App.test.tsx src/App.login.test.tsx`

Expected: FAIL — assertions expect old login form labels. These tests will be updated in Task 6.

- [ ] **Step 4: Commit**

```bash
cd desktop
git add src/App.tsx
git commit -m "feat(desktop): integrate LauncherScreen and ServerFormScreen into App"
```

---

### Task 6: Update App tests and remove old LoginScreen

**Files:**
- Modify: `desktop/src/App.test.tsx`
- Modify: `desktop/src/App.login.test.tsx`
- Delete: `desktop/src/features/auth/LoginScreen.tsx`
- Delete: `desktop/src/features/auth/LoginScreen.test.tsx`

- [ ] **Step 1: Update App.test.tsx**

Replace contents of `desktop/src/App.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App shell', () => {
  it('starts on the server launcher with saved profiles', async () => {
    render(<App />);
    expect(screen.getByRole('main')).toHaveClass('launcher-shell');
    expect(screen.getByText('选择服务器')).toBeInTheDocument();
    expect(screen.getByText('yufanssh')).toBeInTheDocument();
    expect(screen.queryByLabelText('远端文件')).not.toBeInTheDocument();
  });

  it('can switch the launcher language to English', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('语言'), { target: { value: 'en-US' } });
    expect(screen.getByRole('main')).toHaveTextContent('LAN Transfer');
    expect(screen.getByText('Select server')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Update App.login.test.tsx**

Replace contents of `desktop/src/App.login.test.tsx`:

```typescript
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

describe('App launcher flow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('connects to the selected SSH profile from the launcher', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('yufanssh')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    await waitFor(() => expect(screen.getByText('已连接：yufan@10.42.0.1:2687')).toBeInTheDocument());
    expect(screen.getByText('logs_2.sqlite')).toBeInTheDocument();
  });

  it('navigates to add-server form and back', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('yufanssh')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '添加服务器' }));
    await waitFor(() => expect(screen.getByText('添加服务器')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(screen.getByText('选择服务器')).toBeInTheDocument());
  });
});
```

- [ ] **Step 3: Remove LoginScreen files**

```bash
cd desktop
rm src/features/auth/LoginScreen.tsx src/features/auth/LoginScreen.test.tsx
```

- [ ] **Step 4: Run desktop test suite**

Run: `cd desktop && npm test`

Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
cd desktop
git add src/App.test.tsx src/App.login.test.tsx
git rm src/features/auth/LoginScreen.tsx src/features/auth/LoginScreen.test.tsx
git commit -m "refactor(desktop): remove LoginScreen and update App tests for launcher flow"
```

---

### Task 7: Optional styling pass

**Files:**
- Modify: `desktop/src/styles.css`

**Interfaces:**
- None new; this is a visual polish task.

- [ ] **Step 1: Add launcher-specific CSS**

Append the following to `desktop/src/styles.css`:

```css
.launcher-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.launcher-panel {
  flex: 1;
  padding: 2rem;
  max-width: 960px;
  margin: 0 auto;
  width: 100%;
}

.launcher-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.launcher-empty {
  text-align: center;
  padding: 4rem 1rem;
}

.server-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
  list-style: none;
  padding: 0;
  margin: 0;
}

.server-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.server-card-host,
.server-card-user {
  margin: 0.25rem 0;
  color: #666;
  font-size: 0.9rem;
}

.server-card-error {
  color: #c00;
  font-size: 0.85rem;
  margin-top: 0.5rem;
}

.server-card-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
  align-items: center;
}

.server-form-panel {
  max-width: 480px;
  margin: 2rem auto;
  padding: 1.5rem;
  border: 1px solid #ddd;
  border-radius: 8px;
}

.server-form-heading {
  margin-bottom: 1rem;
}

.form-row {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 0.75rem;
}

.form-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

.field-error {
  color: #c00;
  font-size: 0.85rem;
}

.link-button.danger {
  color: #c00;
}
```

- [ ] **Step 2: Run tests and typecheck**

Run: `cd desktop && npm test && npm run build`

Expected: PASS, build succeeds.

- [ ] **Step 3: Commit**

```bash
cd desktop
git add src/styles.css
git commit -m "style(desktop): add launcher and server form layout styles"
```

---

## Self-Review

**1. Spec coverage:**
- 服务器启动器首屏 ✅ Task 4 + 5
- 已保存配置一键连接 ✅ Task 4 + 5
- 添加/编辑服务器 ✅ Task 3 + 5
- 删除二次确认 ✅ Task 4
- 空状态引导 ✅ Task 4
- 卡片内联错误 + 全局 Toast ✅ Task 5 (`launcherErrors` + `setError`)
- 表单校验与聚焦 ✅ Task 3（显式 refs + 错误时 useEffect 聚焦首个错误字段）
- 连接后 RemoteExplorer 不变 ✅ Task 5
- 组件测试 ✅ Task 3, 4, 6

**2. Placeholder scan:**
- 无 TBD/TODO。
- 所有步骤包含可执行代码或命令。
- CSS 文件路径确认为 `desktop/src/styles.css`。

**3. Type consistency:**
- `ConnectionProfile` 来自 `connectionProfiles.ts`，未改动。
- `AppView` 在 store 中导出，供 `App.tsx` 使用。
- `editingProfileId` 用于查找编辑目标，与 ServerFormScreen 的 `profile` prop 类型一致。

**4. Gap:**
- ServerFormScreen 中的 `aria2Rpc` / `aria2Secret` / `remoteTempDir` / `remoteDownloadService` 字段当前未保存到 `ConnectionProfile`。如果业务需要持久化，需在 `connectionProfiles.ts` 的 Rust 命令/类型中扩展。本次计划按现有 `ConnectionProfile` 类型处理，这些字段仅作为 UI 占位。若需持久化，应在 Task 5 前扩展类型和 Rust 命令。
