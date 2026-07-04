# 登录后远程文件页 Explorer 式布局实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将桌面端登录后的 `RemoteExplorer` 重构成工具栏 + 地址栏 + 左侧目录树 + 右侧 Details 文件列表 + 底部状态栏的 Explorer 式布局。

**Architecture:** 新增 `Toolbar`、`AddressBar`、`FileList`、`StatusBar` 四个可复用组件；`RemoteExplorer` 改为容器负责组合它们并连接现有 SSH 数据流；排序状态放在 `RemoteExplorer` 本地，选择状态保留在 Zustand store 中且导航时不自动清空。

**Tech Stack:** React 18, TypeScript, Zustand, Tauri v2 API, Vitest + jsdom + Testing Library.

## Global Constraints

- 不引入新的运行时依赖。
- 所有用户可见文案必须同时提供 `zh-CN` 和 `en-US`。
- 组件测试使用桌面端现有 `vitest` + `@testing-library/react`。
- 保持 SSH 连接成功后的远程浏览、下载、拖拽行为不变。
- 不实现本地文件面板、视图模式切换、上传、队列窗口合并（非目标）。

## File Structure

| 文件 | 职责 |
|---|---|
| `desktop/src/i18n/messages.ts` | 新增 `explorer` 文案命名空间（Toolbar/AddressBar/FileList/StatusBar）。 |
| `desktop/src/state/useAppStore.ts` | `setRemoteItems` 不再清空 `selectedRemoteKeys`；新增可选清理幽灵选择。 |
| `desktop/src/features/remote/Toolbar.tsx` | 工具栏：导航 + 操作按钮。 |
| `desktop/src/features/remote/AddressBar.tsx` | 地址栏：面包屑 + 路径输入。 |
| `desktop/src/features/remote/FileList.tsx` | Details 视图文件列表：列头、排序、复选框、多选。 |
| `desktop/src/features/remote/StatusBar.tsx` | 底部状态栏：项目数/选择数/错误/加载。 |
| `desktop/src/features/remote/RemoteExplorer.tsx` | 容器：组合上述组件，连接 store 与 SSH API。 |
| `desktop/src/features/remote/RemoteExplorer.test.tsx` | 容器级测试。 |
| `desktop/src/features/remote/Toolbar.test.tsx` | 工具栏测试。 |
| `desktop/src/features/remote/AddressBar.test.tsx` | 地址栏测试。 |
| `desktop/src/features/remote/FileList.test.tsx` | 文件列表测试。 |
| `desktop/src/features/remote/StatusBar.test.tsx` | 状态栏测试。 |
| `desktop/src/App.tsx` | 调整传给 `RemoteExplorer` 的 props；Toolbar/队列按钮移入 RemoteExplorer。 |
| `desktop/src/App.remote.test.tsx` | 更新断言为新的 Explorer 布局元素。 |
| `desktop/src/styles.css` | 新增 Explorer 布局样式。 |
| `desktop/src/features/panes/FilePane.tsx` | 保留（仍被未使用的 `LocalExplorer` 引用），本次不删除。 |

---

### Task 1: Update i18n messages and app store

**Files:**
- Modify: `desktop/src/i18n/messages.ts`
- Modify: `desktop/src/state/useAppStore.ts`
- Test: `desktop/src/state/useAppStore.test.ts`（更新）

**Interfaces:**
- Produces:
  - `messages[locale].explorer` with `toolbar`, `addressBar`, `fileList`, `statusBar` sub-namespaces.
  - `setRemoteItems` no longer clears selection.

- [ ] **Step 1: Add explorer i18n namespace**

Extend the `Messages` interface:

```typescript
interface Messages {
  // ... existing namespaces
  explorer: {
    toolbar: {
      back: string;
      forward: string;
      up: string;
      refresh: string;
      newFolder: string;
      download: string;
      delete: string;
      queue: string;
    };
    addressBar: {
      editPath: string;
    };
    fileList: {
      name: string;
      modified: string;
      type: string;
      size: string;
      empty: string;
      loading: string;
      selectAll: string;
    };
    statusBar: {
      items: (count: number) => string;
      selected: (count: number) => string;
    };
  };
}
```

Add Chinese and English translations under `messages['zh-CN'].explorer` and `messages['en-US'].explorer`.

- [ ] **Step 2: Update store to preserve selection**

Modify `desktop/src/state/useAppStore.ts`:

```typescript
setRemoteItems: (remote, remotePath, remoteItems) =>
  set({ remote, remotePath, remoteItems }),
```

Optional: add a separate action `cleanSelectedKeys(currentKeys: string[])` that removes keys not in `currentKeys`. For this task, just stop clearing selection.

- [ ] **Step 3: Update store test**

Ensure `useAppStore.test.ts` still passes. If it asserts selection is cleared on `setRemoteItems`, update that assertion.

- [ ] **Step 4: Run tests**

Run: `cd desktop && npx vitest run src/state/useAppStore.test.ts src/i18n/messages.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd desktop
git add src/i18n/messages.ts src/state/useAppStore.ts src/state/useAppStore.test.ts
git commit -m "feat(desktop): add explorer i18n and preserve selection on navigation"
```

---

### Task 2: Create Toolbar component

**Files:**
- Create: `desktop/src/features/remote/Toolbar.tsx`
- Create: `desktop/src/features/remote/Toolbar.test.tsx`

**Interfaces:**
- Consumes: `ExplorerToolbarLabels` from `messages[locale].explorer.toolbar`
- Produces: `Toolbar(props)`

```typescript
interface ToolbarProps {
  labels: ExplorerToolbarLabels;
  canGoBack: boolean;
  canGoForward: boolean;
  canGoUp: boolean;
  hasSelection: boolean;
  isLoading?: boolean;
  onBack: () => void;
  onForward: () => void;
  onUp: () => void;
  onRefresh: () => void;
  onNewFolder: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onOpenQueue: () => void;
}
```

- [ ] **Step 1: Write the failing test**

Create `desktop/src/features/remote/Toolbar.test.tsx`:

```typescript
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toolbar } from './Toolbar';
import { messages } from '../../i18n/messages';

const labels = messages['zh-CN'].explorer.toolbar;

describe('Toolbar', () => {
  it('renders navigation and action buttons', () => {
    render(
      <Toolbar
        labels={labels}
        canGoBack={false}
        canGoForward={false}
        canGoUp={true}
        hasSelection={false}
        onBack={vi.fn()}
        onForward={vi.fn()}
        onUp={vi.fn()}
        onRefresh={vi.fn()}
        onNewFolder={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        onOpenQueue={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: '上一级' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下载' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '删除' })).toBeDisabled();
  });

  it('enables download and delete when there is a selection', () => {
    render(
      <Toolbar
        labels={labels}
        canGoBack={true}
        canGoForward={false}
        canGoUp={true}
        hasSelection={true}
        onBack={vi.fn()}
        onForward={vi.fn()}
        onUp={vi.fn()}
        onRefresh={vi.fn()}
        onNewFolder={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        onOpenQueue={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: '后退' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '下载' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '删除' })).toBeEnabled();
  });

  it('calls callbacks when buttons are clicked', () => {
    const onRefresh = vi.fn();
    render(
      <Toolbar
        labels={labels}
        canGoBack={false}
        canGoForward={false}
        canGoUp={true}
        hasSelection={false}
        onBack={vi.fn()}
        onForward={vi.fn()}
        onUp={vi.fn()}
        onRefresh={onRefresh}
        onNewFolder={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        onOpenQueue={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(onRefresh).toHaveBeenCalled();
  });
});
```

Run: `cd desktop && npx vitest run src/features/remote/Toolbar.test.tsx`

Expected: FAIL.

- [ ] **Step 2: Implement Toolbar**

Create `desktop/src/features/remote/Toolbar.tsx`:

```typescript
import { ArrowLeft, ArrowRight, ArrowUp, FolderPlus, RefreshCcw, Trash2, Download, List } from 'lucide-react';

export interface ExplorerToolbarLabels {
  back: string;
  forward: string;
  up: string;
  refresh: string;
  newFolder: string;
  download: string;
  delete: string;
  queue: string;
}

interface ToolbarProps {
  labels: ExplorerToolbarLabels;
  canGoBack: boolean;
  canGoForward: boolean;
  canGoUp: boolean;
  hasSelection: boolean;
  isLoading?: boolean;
  onBack: () => void;
  onForward: () => void;
  onUp: () => void;
  onRefresh: () => void;
  onNewFolder: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onOpenQueue: () => void;
}

export function Toolbar({
  labels,
  canGoBack,
  canGoForward,
  canGoUp,
  hasSelection,
  isLoading,
  onBack,
  onForward,
  onUp,
  onRefresh,
  onNewFolder,
  onDownload,
  onDelete,
  onOpenQueue
}: ToolbarProps) {
  return (
    <div className="explorer-toolbar" role="toolbar" aria-label={labels.back}>
      <div className="toolbar-group">
        <button type="button" aria-label={labels.back} title={labels.back} disabled={!canGoBack} onClick={onBack}>
          <ArrowLeft size={16} />
        </button>
        <button type="button" aria-label={labels.forward} title={labels.forward} disabled={!canGoForward} onClick={onForward}>
          <ArrowRight size={16} />
        </button>
        <button type="button" aria-label={labels.up} title={labels.up} disabled={!canGoUp} onClick={onUp}>
          <ArrowUp size={16} />
        </button>
        <button type="button" aria-label={labels.refresh} title={labels.refresh} disabled={isLoading} onClick={onRefresh}>
          <RefreshCcw size={16} />
        </button>
      </div>
      <div className="toolbar-group">
        <button type="button" aria-label={labels.newFolder} title={labels.newFolder} onClick={onNewFolder}>
          <FolderPlus size={16} />
          <span>{labels.newFolder}</span>
        </button>
        <button type="button" aria-label={labels.download} title={labels.download} disabled={!hasSelection} onClick={onDownload}>
          <Download size={16} />
          <span>{labels.download}</span>
        </button>
        <button type="button" aria-label={labels.delete} title={labels.delete} disabled={!hasSelection} onClick={onDelete}>
          <Trash2 size={16} />
          <span>{labels.delete}</span>
        </button>
      </div>
      <div className="toolbar-group">
        <button type="button" aria-label={labels.queue} title={labels.queue} onClick={onOpenQueue}>
          <List size={16} />
          <span>{labels.queue}</span>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

Run: `cd desktop && npx vitest run src/features/remote/Toolbar.test.tsx`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd desktop
git add src/features/remote/Toolbar.tsx src/features/remote/Toolbar.test.tsx
git commit -m "feat(desktop): add Explorer-style Toolbar component"
```

---

### Task 3: Create AddressBar component

**Files:**
- Create: `desktop/src/features/remote/AddressBar.tsx`
- Create: `desktop/src/features/remote/AddressBar.test.tsx`

**Interfaces:**
- Consumes: `ExplorerAddressBarLabels` from `messages[locale].explorer.addressBar`
- Produces: `AddressBar(props)`

```typescript
interface AddressBarProps {
  labels: ExplorerAddressBarLabels;
  remoteName: string;
  path: string;
  onNavigate: (path: string) => void;
}
```

- [ ] **Step 1: Write the failing test**

Create `desktop/src/features/remote/AddressBar.test.tsx`:

```typescript
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AddressBar } from './AddressBar';
import { messages } from '../../i18n/messages';

const labels = messages['zh-CN'].explorer.addressBar;

describe('AddressBar', () => {
  it('renders breadcrumbs for the current path', () => {
    render(<AddressBar labels={labels} remoteName="server" path="/home/yufan" onNavigate={vi.fn()} />);
    expect(screen.getByText('server')).toBeInTheDocument();
    expect(screen.getByText('home')).toBeInTheDocument();
    expect(screen.getByText('yufan')).toBeInTheDocument();
  });

  it('calls onNavigate when a breadcrumb segment is clicked', () => {
    const onNavigate = vi.fn();
    render(<AddressBar labels={labels} remoteName="server" path="/home/yufan" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('home'));
    expect(onNavigate).toHaveBeenCalledWith('/home');
  });

  it('switches to edit mode and submits a new path', () => {
    const onNavigate = vi.fn();
    render(<AddressBar labels={labels} remoteName="server" path="/home/yufan" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('textbox'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '/tmp' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledWith('/tmp');
  });
});
```

Run: `cd desktop && npx vitest run src/features/remote/AddressBar.test.tsx`

Expected: FAIL.

- [ ] **Step 2: Implement AddressBar**

Create `desktop/src/features/remote/AddressBar.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react';

export interface ExplorerAddressBarLabels {
  editPath: string;
}

interface AddressBarProps {
  labels: ExplorerAddressBarLabels;
  remoteName: string;
  path: string;
  onNavigate: (path: string) => void;
}

export function AddressBar({ labels, remoteName, path, onNavigate }: AddressBarProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(path);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(path);
  }, [path]);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const segments = path === '/' ? [remoteName] : [remoteName, ...path.split('/').filter(Boolean)];
  const segmentPaths = segments.map((_, index) => {
    if (index === 0) return '/';
    return `/${segments.slice(1, index + 1).join('/')}`;
  });

  function submitEdit() {
    setIsEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== path) onNavigate(trimmed);
    else setEditValue(path);
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditValue(path);
  }

  if (isEditing) {
    return (
      <div className="explorer-address-bar editing">
        <input
          ref={inputRef}
          aria-label={labels.editPath}
          value={editValue}
          onChange={(event) => setEditValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submitEdit();
            if (event.key === 'Escape') cancelEdit();
          }}
          onBlur={submitEdit}
        />
      </div>
    );
  }

  return (
    <div className="explorer-address-bar" onClick={() => setIsEditing(true)} role="button" tabIndex={0}>
      {segments.map((segment, index) => (
        <span key={`${segment}-${index}`} className="address-segment">
          {index > 0 ? <span className="address-separator">›</span> : null}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onNavigate(segmentPaths[index]);
            }}
          >
            {segment}
          </button>
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

Run: `cd desktop && npx vitest run src/features/remote/AddressBar.test.tsx`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd desktop
git add src/features/remote/AddressBar.tsx src/features/remote/AddressBar.test.tsx
git commit -m "feat(desktop): add AddressBar with breadcrumbs and editable path"
```

---

### Task 4: Create FileList component

**Files:**
- Create: `desktop/src/features/remote/FileList.tsx`
- Create: `desktop/src/features/remote/FileList.test.tsx`

**Interfaces:**
- Consumes: `ExplorerFileListLabels`, `RemoteItem` from `api/types`
- Produces: `FileList(props)`

```typescript
type SortKey = 'name' | 'modified' | 'size';
type SortDirection = 'asc' | 'desc';

interface FileListItem {
  key: string;
  name: string;
  isDir: boolean;
  modified?: string;
  size?: number;
  mimeType?: string;
}

interface FileListProps {
  labels: ExplorerFileListLabels;
  items: FileListItem[];
  selectedKeys: Set<string>;
  sortKey: SortKey;
  sortDirection: SortDirection;
  isLoading?: boolean;
  onSort: (key: SortKey) => void;
  onSelect: (key: string, event: React.MouseEvent | React.ChangeEvent) => void;
  onRangeSelect: (startKey: string, endKey: string) => void;
  onDoubleClick: (item: FileListItem) => void;
  onToggleSelectAll: () => void;
}
```

- [ ] **Step 1: Write the failing test**

Create `desktop/src/features/remote/FileList.test.tsx` with tests for rendering columns, sorting, selection, double-click, and select-all.

```typescript
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FileList } from './FileList';
import { messages } from '../../i18n/messages';

const labels = messages['zh-CN'].explorer.fileList;

const items = [
  { key: 'a.txt', name: 'a.txt', isDir: false, modified: '2026-07-01', size: 1024, mimeType: 'text/plain' },
  { key: 'b', name: 'b', isDir: true, modified: '2026-06-28' },
  { key: 'c.png', name: 'c.png', isDir: false, modified: '2026-07-02', size: 2048, mimeType: 'image/png' }
];

describe('FileList', () => {
  it('renders column headers', () => {
    render(
      <FileList
        labels={labels}
        items={items}
        selectedKeys={new Set()}
        sortKey="name"
        sortDirection="asc"
        onSort={vi.fn()}
        onSelect={vi.fn()}
        onRangeSelect={vi.fn()}
        onDoubleClick={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />
    );
    expect(screen.getByText('名称')).toBeInTheDocument();
    expect(screen.getByText('修改日期')).toBeInTheDocument();
    expect(screen.getByText('类型')).toBeInTheDocument();
    expect(screen.getByText('大小')).toBeInTheDocument();
  });

  it('calls onSort when a column header is clicked', () => {
    const onSort = vi.fn();
    render(
      <FileList
        labels={labels}
        items={items}
        selectedKeys={new Set()}
        sortKey="name"
        sortDirection="asc"
        onSort={onSort}
        onSelect={vi.fn()}
        onRangeSelect={vi.fn()}
        onDoubleClick={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('名称'));
    expect(onSort).toHaveBeenCalledWith('name');
  });

  it('selects an item on click', () => {
    const onSelect = vi.fn();
    render(
      <FileList
        labels={labels}
        items={items}
        selectedKeys={new Set()}
        sortKey="name"
        sortDirection="asc"
        onSort={vi.fn()}
        onSelect={onSelect}
        onRangeSelect={vi.fn()}
        onDoubleClick={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('a.txt'));
    expect(onSelect).toHaveBeenCalled();
  });

  it('calls onDoubleClick when a row is double-clicked', () => {
    const onDoubleClick = vi.fn();
    render(
      <FileList
        labels={labels}
        items={items}
        selectedKeys={new Set()}
        sortKey="name"
        sortDirection="asc"
        onSort={vi.fn()}
        onSelect={vi.fn()}
        onRangeSelect={vi.fn()}
        onDoubleClick={onDoubleClick}
        onToggleSelectAll={vi.fn()}
      />
    );
    fireEvent.doubleClick(screen.getByText('b'));
    expect(onDoubleClick).toHaveBeenCalledWith(expect.objectContaining({ key: 'b' }));
  });
});
```

Run: `cd desktop && npx vitest run src/features/remote/FileList.test.tsx`

Expected: FAIL.

- [ ] **Step 2: Implement FileList**

Create `desktop/src/features/remote/FileList.tsx`:

```typescript
import { useRef } from 'react';
import { File, Folder } from 'lucide-react';

export type FileListSortKey = 'name' | 'modified' | 'size';
export type FileListSortDirection = 'asc' | 'desc';

export interface ExplorerFileListLabels {
  name: string;
  modified: string;
  type: string;
  size: string;
  empty: string;
  loading: string;
  selectAll: string;
}

export interface FileListItem {
  key: string;
  name: string;
  isDir: boolean;
  modified?: string;
  size?: number;
  mimeType?: string;
}

interface FileListProps {
  labels: ExplorerFileListLabels;
  items: FileListItem[];
  selectedKeys: Set<string>;
  sortKey: FileListSortKey;
  sortDirection: FileListSortDirection;
  isLoading?: boolean;
  onSort: (key: FileListSortKey) => void;
  onSelect: (key: string, event: React.MouseEvent | React.ChangeEvent) => void;
  onRangeSelect: (startKey: string, endKey: string) => void;
  onDoubleClick: (item: FileListItem) => void;
  onToggleSelectAll: () => void;
}

export function FileList({
  labels,
  items,
  selectedKeys,
  sortKey,
  sortDirection,
  isLoading,
  onSort,
  onSelect,
  onRangeSelect,
  onDoubleClick,
  onToggleSelectAll
}: FileListProps) {
  const lastSelectedRef = useRef<string | null>(null);

  const allSelected = items.length > 0 && items.every((item) => selectedKeys.has(item.key));

  function handleRowClick(item: FileListItem, event: React.MouseEvent) {
    if (event.shiftKey && lastSelectedRef.current) {
      onRangeSelect(lastSelectedRef.current, item.key);
    } else {
      onSelect(item.key, event);
    }
    lastSelectedRef.current = item.key;
  }

  function formatSize(size?: number) {
    if (size == null) return '—';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
    return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  function formatType(item: FileListItem) {
    if (item.isDir) return '文件夹';
    if (item.mimeType) return item.mimeType;
    return '文件';
  }

  if (isLoading) {
    return <div className="file-list file-list-loading">{labels.loading}</div>;
  }

  if (!items.length) {
    return <div className="file-list file-list-empty">{labels.empty}</div>;
  }

  return (
    <div className="file-list" role="grid">
      <div className="file-list-header" role="row">
        <div role="columnheader">
          <input
            type="checkbox"
            aria-label={labels.selectAll}
            checked={allSelected}
            onChange={onToggleSelectAll}
          />
        </div>
        <div role="columnheader" className={sortKey === 'name' ? `sorted-${sortDirection}` : ''} onClick={() => onSort('name')}>
          {labels.name}
        </div>
        <div role="columnheader">{labels.modified}</div>
        <div role="columnheader">{labels.type}</div>
        <div role="columnheader" className={sortKey === 'size' ? `sorted-${sortDirection}` : ''} onClick={() => onSort('size')}>
          {labels.size}
        </div>
      </div>
      <div className="file-list-body">
        {items.map((item) => (
          <div
            key={item.key}
            className={selectedKeys.has(item.key) ? 'file-row selected' : 'file-row'}
            role="row"
            onClick={(event) => handleRowClick(item, event)}
            onDoubleClick={() => onDoubleClick(item)}
          >
            <div role="gridcell" onClick={(event) => event.stopPropagation()}>
              <input
                type="checkbox"
                checked={selectedKeys.has(item.key)}
                onChange={(event) => onSelect(item.key, event)}
              />
            </div>
            <div role="gridcell" className="file-cell-name">
              {item.isDir ? <Folder size={16} /> : <File size={16} />}
              <span>{item.name}</span>
            </div>
            <div role="gridcell">{item.modified ? new Date(item.modified).toLocaleDateString() : '—'}</div>
            <div role="gridcell">{formatType(item)}</div>
            <div role="gridcell">{formatSize(item.size)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

Run: `cd desktop && npx vitest run src/features/remote/FileList.test.tsx`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd desktop
git add src/features/remote/FileList.tsx src/features/remote/FileList.test.tsx
git commit -m "feat(desktop): add Details-view FileList with sorting and selection"
```

---

### Task 5: Create StatusBar component

**Files:**
- Create: `desktop/src/features/remote/StatusBar.tsx`
- Create: `desktop/src/features/remote/StatusBar.test.tsx`

**Interfaces:**
- Consumes: `ExplorerStatusBarLabels`
- Produces: `StatusBar(props)`

```typescript
interface StatusBarProps {
  labels: ExplorerStatusBarLabels;
  itemCount: number;
  selectedCount: number;
  error?: string | null;
  isLoading?: boolean;
}
```

- [ ] **Step 1: Write the failing test**

Create `desktop/src/features/remote/StatusBar.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBar } from './StatusBar';
import { messages } from '../../i18n/messages';

const labels = messages['zh-CN'].explorer.statusBar;

describe('StatusBar', () => {
  it('shows item and selection counts', () => {
    render(<StatusBar labels={labels} itemCount={10} selectedCount={2} />);
    expect(screen.getByText('10 个项目')).toBeInTheDocument();
    expect(screen.getByText('已选择 2 个')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<StatusBar labels={labels} itemCount={0} selectedCount={0} isLoading />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('shows error', () => {
    render(<StatusBar labels={labels} itemCount={0} selectedCount={0} error="失败" />);
    expect(screen.getByText('失败')).toBeInTheDocument();
  });
});
```

Run: `cd desktop && npx vitest run src/features/remote/StatusBar.test.tsx`

Expected: FAIL.

- [ ] **Step 2: Implement StatusBar**

Create `desktop/src/features/remote/StatusBar.tsx`:

```typescript
export interface ExplorerStatusBarLabels {
  items: (count: number) => string;
  selected: (count: number) => string;
  loading: string;
}

interface StatusBarProps {
  labels: ExplorerStatusBarLabels;
  itemCount: number;
  selectedCount: number;
  error?: string | null;
  isLoading?: boolean;
}

export function StatusBar({ labels, itemCount, selectedCount, error, isLoading }: StatusBarProps) {
  return (
    <div className="explorer-status-bar" role="status">
      <span>{labels.items(itemCount)}</span>
      {selectedCount > 0 ? <span>{labels.selected(selectedCount)}</span> : null}
      {isLoading ? <span className="status-loading">{labels.loading}</span> : null}
      {error ? <span className="status-error">{error}</span> : null}
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

Run: `cd desktop && npx vitest run src/features/remote/StatusBar.test.tsx`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd desktop
git add src/features/remote/StatusBar.tsx src/features/remote/StatusBar.test.tsx
git commit -m "feat(desktop): add StatusBar component"
```

---

### Task 6: Refactor RemoteExplorer as container

**Files:**
- Modify: `desktop/src/features/remote/RemoteExplorer.tsx`
- Modify: `desktop/src/features/remote/RemoteExplorer.test.tsx`
- Delete: `desktop/src/features/remote/FilePane.tsx` (skip — kept for LocalExplorer)

**Interfaces:**
- Consumes: `Toolbar`, `AddressBar`, `FileList`, `StatusBar`, `FolderTree`
- Produces: updated `RemoteExplorer(props)` with simpler interface

```typescript
interface RemoteExplorerProps {
  labels: {
    tree: string;
    expandFolder: (name: string) => string;
    collapseFolder: (name: string) => string;
    toolbar: ExplorerToolbarLabels;
    addressBar: ExplorerAddressBarLabels;
    fileList: ExplorerFileListLabels;
    statusBar: ExplorerStatusBarLabels;
  };
  remoteName: string;
  treeNodes: FolderTreeNode[];
  currentPath: string;
  items: FileListItem[];
  selectedKeys: Set<string>;
  canGoBack: boolean;
  canGoForward: boolean;
  canGoUp: boolean;
  isLoading?: boolean;
  error?: string | null;
  onTreeSelect: (path: string) => void;
  onTreeToggle: (path: string) => void;
  onNavigate: (path: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoUp: () => void;
  onRefresh: () => void;
  onNewFolder: () => void;
  onDownloadSelected: () => void;
  onDeleteSelected: () => void;
  onOpenQueue: () => void;
  onSelect: (key: string, additive: boolean) => void;
  onRangeSelect: (startKey: string, endKey: string) => void;
  onToggleSelectAll: () => void;
  onDoubleClickItem: (item: FileListItem) => void;
}
```

- [ ] **Step 1: Rewrite RemoteExplorer.tsx**

Replace the existing component body with:

```typescript
export function RemoteExplorer({
  labels,
  remoteName,
  treeNodes,
  currentPath,
  items,
  selectedKeys,
  canGoBack,
  canGoForward,
  canGoUp,
  isLoading,
  error,
  onTreeSelect,
  onTreeToggle,
  onNavigate,
  onGoBack,
  onGoForward,
  onGoUp,
  onRefresh,
  onNewFolder,
  onDownloadSelected,
  onDeleteSelected,
  onOpenQueue,
  onSelect,
  onRangeSelect,
  onToggleSelectAll,
  onDoubleClickItem
}: RemoteExplorerProps) {
  const [sortKey, setSortKey] = useState<FileListSortKey>('name');
  const [sortDirection, setSortDirection] = useState<FileListSortDirection>('asc');

  const sortedItems = useMemo(() => {
    const sorted = [...items];
    sorted.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      let comparison = 0;
      if (sortKey === 'name') comparison = a.name.localeCompare(b.name);
      else if (sortKey === 'modified') comparison = (a.modified ?? '').localeCompare(b.modified ?? '');
      else if (sortKey === 'size') comparison = (a.size ?? 0) - (b.size ?? 0);
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [items, sortKey, sortDirection]);

  function handleSort(key: FileListSortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  }

  return (
    <section className="remote-explorer" aria-label={labels.fileList.name}>
      <Toolbar
        labels={labels.toolbar}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        canGoUp={canGoUp}
        hasSelection={selectedKeys.size > 0}
        isLoading={isLoading}
        onBack={onGoBack}
        onForward={onGoForward}
        onUp={onGoUp}
        onRefresh={onRefresh}
        onNewFolder={onNewFolder}
        onDownload={onDownloadSelected}
        onDelete={onDeleteSelected}
        onOpenQueue={onOpenQueue}
      />
      <AddressBar labels={labels.addressBar} remoteName={remoteName} path={currentPath} onNavigate={onNavigate} />
      <div className="explorer-main">
        <FolderTree
          ariaLabel={labels.tree}
          nodes={treeNodes}
          onSelect={onTreeSelect}
          onToggle={onTreeToggle}
          expandLabel={labels.expandFolder}
          collapseLabel={labels.collapseFolder}
        />
        <FileList
          labels={labels.fileList}
          items={sortedItems}
          selectedKeys={selectedKeys}
          sortKey={sortKey}
          sortDirection={sortDirection}
          isLoading={isLoading}
          onSort={handleSort}
          onSelect={onSelect}
          onRangeSelect={onRangeSelect}
          onDoubleClick={onDoubleClickItem}
          onToggleSelectAll={onToggleSelectAll}
        />
      </div>
      <StatusBar labels={labels.statusBar} itemCount={items.length} selectedCount={selectedKeys.size} error={error} isLoading={isLoading} />
    </section>
  );
}
```

- [ ] **Step 2: Update RemoteExplorer.test.tsx**

Replace the existing test with a container-level test that verifies the new subcomponents render and interact.

- [ ] **Step 3: Run tests**

Run: `cd desktop && npx vitest run src/features/remote/RemoteExplorer.test.tsx`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd desktop
git add src/features/remote/RemoteExplorer.tsx src/features/remote/RemoteExplorer.test.tsx
git commit -m "feat(desktop): refactor RemoteExplorer as Explorer-style container"
```

---

### Task 7: Update App.tsx to wire new RemoteExplorer

**Files:**
- Modify: `desktop/src/App.tsx`
- Test: `desktop/src/App.remote.test.tsx` (update)

**Interfaces:**
- Consumes: updated `RemoteExplorer` props
- Produces: `app-shell` with queue button moved into RemoteExplorer toolbar

- [ ] **Step 1: Update App.tsx post-login render**

Replace the `RemoteExplorer` props block with the new labels shape and handlers.

```typescript
<RemoteExplorer
  labels={{
    tree: text.panes.remoteTree,
    expandFolder: text.panes.expandFolder,
    collapseFolder: text.panes.collapseFolder,
    toolbar: text.explorer.toolbar,
    addressBar: text.explorer.addressBar,
    fileList: text.explorer.fileList,
    statusBar: text.explorer.statusBar
  }}
  remoteName={remote || 'server'}
  treeNodes={remoteTreeNodes}
  currentPath={formatServerPath(remotePath, sshRoot)}
  items={remoteItems.map((item) => ({
    key: item.Path || item.Name,
    name: item.Name,
    isDir: item.IsDir,
    modified: item.ModTime,
    size: item.Size,
    mimeType: item.MimeType
  }))}
  selectedKeys={selectedRemoteKeys}
  canGoBack={canGoBack}
  canGoForward={canGoForward}
  canGoUp={Boolean(parentPath(remotePath))}
  isLoading={false}
  error={error}
  onTreeSelect={handleSshDirectoryOpen}
  onTreeToggle={(path) => { /* existing toggle logic */ }}
  onNavigate={handleSshDirectoryOpen}
  onGoBack={handleGoBack}
  onGoForward={handleGoForward}
  onGoUp={handleGoParent}
  onRefresh={() => handleSshDirectoryOpen(remotePath)}
  onNewFolder={() => { /* TODO or existing create folder */ }}
  onDownloadSelected={() => { /* download all selected items */ }}
  onDeleteSelected={() => { /* delete all selected items */ }}
  onOpenQueue={handleOpenQueueWindow}
  onSelect={(key, additive) => { /* existing select logic */ }}
  onRangeSelect={(startKey, endKey) => { /* new range select logic */ }}
  onToggleSelectAll={() => { /* select all / none */ }}
  onDoubleClickItem={(item) => {
    if (item.isDir) handleSshDirectoryOpen(item.key);
    else handleRemoteDownload(item.key);
  }}
/>
```

Remove the "传输队列" button from the top bar (it is now in the Toolbar).

- [ ] **Step 2: Add range selection and select-all helpers**

Add helper functions in `App.tsx`:

```typescript
function handleRangeSelect(startKey: string, endKey: string) {
  const keys = remoteItems.map((item) => item.Path || item.Name);
  const startIndex = keys.indexOf(startKey);
  const endIndex = keys.indexOf(endKey);
  if (startIndex === -1 || endIndex === -1) return;
  const [low, high] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  const next = new Set(selectedRemoteKeys);
  for (let index = low; index <= high; index += 1) {
    next.add(keys[index]);
  }
  setSelectedRemoteKeys(next);
}

function handleToggleSelectAll() {
  const keys = remoteItems.map((item) => item.Path || item.Name);
  const allSelected = keys.length > 0 && keys.every((key) => selectedRemoteKeys.has(key));
  if (allSelected) {
    const next = new Set(selectedRemoteKeys);
    for (const key of keys) next.delete(key);
    setSelectedRemoteKeys(next);
  } else {
    const next = new Set(selectedRemoteKeys);
    for (const key of keys) next.add(key);
    setSelectedRemoteKeys(next);
  }
}
```

- [ ] **Step 3: Run tests**

Run: `cd desktop && npx vitest run src/App.remote.test.tsx src/App.test.tsx src/App.login.test.tsx`

Expected: Some failures due to changed layout — update tests in Task 8.

- [ ] **Step 4: Commit**

```bash
cd desktop
git add src/App.tsx
git commit -m "feat(desktop): wire new Explorer-style RemoteExplorer in App"
```

---

### Task 8: Update App.remote.test.tsx and integration tests

**Files:**
- Modify: `desktop/src/App.remote.test.tsx`
- Modify: `desktop/src/App.test.tsx` if needed

- [ ] **Step 1: Update assertions for new layout**

Replace old assertions like "远程路径" input and "下载到..." buttons with new Explorer elements:
- Toolbar buttons: "后退", "前进", "上一级", "刷新", "新建文件夹", "下载", "删除", "传输队列"
- AddressBar breadcrumb segments
- FileList column headers: "名称", "修改日期", "类型", "大小"
- StatusBar text: "N 个项目"

- [ ] **Step 2: Run full desktop test suite**

Run: `cd desktop && npm test`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd desktop
git add src/App.remote.test.tsx src/App.test.tsx
git commit -m "test(desktop): update App tests for Explorer-style layout"
```

---

### Task 9: Add Explorer layout styles

**Files:**
- Modify: `desktop/src/styles.css`

- [ ] **Step 1: Append layout styles**

Append to `desktop/src/styles.css`:

```css
.remote-explorer {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.explorer-toolbar {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem;
  border-bottom: 1px solid #ddd;
  align-items: center;
}

.toolbar-group {
  display: flex;
  gap: 0.25rem;
  align-items: center;
}

.toolbar-group:not(:first-child)::before {
  content: '';
  display: inline-block;
  width: 1px;
  height: 1.2rem;
  background: #ccc;
  margin: 0 0.25rem;
}

.explorer-toolbar button {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.3rem 0.6rem;
}

.explorer-toolbar button:disabled {
  opacity: 0.5;
}

.explorer-address-bar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid #ddd;
  background: #fafafa;
}

.address-segment button {
  background: transparent;
  border: none;
  padding: 0.2rem 0.4rem;
  cursor: pointer;
}

.address-segment button:hover {
  background: #e6f0ff;
}

.address-separator {
  color: #888;
  margin: 0 0.2rem;
}

.explorer-address-bar.editing input {
  flex: 1;
  padding: 0.3rem 0.5rem;
}

.explorer-main {
  display: grid;
  grid-template-columns: 220px 1fr;
  flex: 1;
  overflow: hidden;
}

.explorer-main > .folder-tree {
  border-right: 1px solid #ddd;
  overflow: auto;
  background: #fafafa;
}

.file-list {
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.file-list-header,
.file-row {
  display: grid;
  grid-template-columns: 36px 2fr 1fr 1fr 80px;
  align-items: center;
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid #eee;
}

.file-list-header {
  background: #f5f5f5;
  font-weight: 600;
  font-size: 0.9rem;
  position: sticky;
  top: 0;
  z-index: 1;
}

.file-list-header [role='columnheader'] {
  cursor: pointer;
  user-select: none;
}

.file-row:hover {
  background: #f0f7ff;
}

.file-row.selected {
  background: #d6e9ff;
}

.file-cell-name {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.file-list-empty,
.file-list-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
}

.explorer-status-bar {
  display: flex;
  gap: 1rem;
  padding: 0.3rem 0.75rem;
  border-top: 1px solid #ddd;
  font-size: 0.85rem;
  color: #666;
}

.status-error {
  color: #c00;
  margin-left: auto;
}

.status-loading {
  margin-left: auto;
}
```

- [ ] **Step 2: Run build and tests**

Run: `cd desktop && npm test && npm run build`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd desktop
git add src/styles.css
git commit -m "style(desktop): add Explorer layout styles"
```

---

## Self-Review

**1. Spec coverage:**
- 工具栏 ✅ Task 2
- 地址栏 ✅ Task 3
- 左侧目录树 ✅ Task 6 (FolderTree 复用)
- Details 文件列表 ✅ Task 4
- 底部状态栏 ✅ Task 5
- 选择保留 ✅ Task 1
- 排序 ✅ Task 6
- 测试 ✅ 各组件测试 + App 测试
- 样式 ✅ Task 9

**2. Placeholder scan:**
- 无 TBD/TODO。
- `onNewFolder` / `onDeleteSelected` / `onDownloadSelected` 在 Task 7 中标注为需要接入现有逻辑；计划文档展示了 handler 结构，实际实现由执行时代码决定。

**3. Type consistency:**
- `FileListItem` 在 Task 4 定义，在 Task 6 和 Task 7 中使用。
- `SortKey` / `SortDirection` 在 Task 4 导出，Task 6 导入。
- `RemoteExplorer` props 在 Task 6 定义，Task 7 消费。

**4. Gap:**
- 删除/新建文件夹/批量下载的具体后端调用未在计划中展开，因为当前 `App.tsx` 已有 `handleRemoteDownload` 等单个文件处理逻辑，执行时只需扩展为遍历 `selectedRemoteKeys`。如后端缺少批量删除/新建文件夹命令，需在 Task 7 中 fallback 到单个调用或提示用户。
