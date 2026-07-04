# 登录后远程文件页 Explorer 式布局优化设计

## 目标

让 Tauri 桌面客户端登录后的远程文件浏览页面更接近 Windows 资源管理器：清晰的工具栏、面包屑地址栏、左侧目录树、右侧带列头的文件列表、行首复选框、底部状态栏，从而解决当前“每行重复下载按钮、缺少元数据列、选择易丢失、拖拽反直觉”等交互问题。

## 背景

当前 `RemoteExplorer` 渲染为：

- 顶部一行塞入后退/前进/向上/刷新/路径输入/打开路径/传输队列/切换连接，拥挤且没有主次。
- 文件列表每行一个“下载到...”按钮，视觉嘈杂。
- 只显示文件名和大小，不显示修改日期、类型等元数据。
- 选择仅支持 Ctrl/Cmd 加选，无 Shift 范围选、无全选、无复选框；每次切换目录清空选择。
- 本地文件面板 `LocalExplorer` 未接入，但本次设计不解决双窗格对传。

## 用户确认的设计决策

| 问题 | 用户选择 |
|---|---|
| 优化范围 | 登录后的远程文件页 |
| 核心目标 | 更像 Win 资源管理器 |
| 优先特征 | 左侧导航树 + 右侧文件列表 + 地址栏 |
| 实施方案 | 方案 A：重组成可复用 Explorer 组件 |
| 多视图切换 | 本次不做，后续再说 |
| 双窗格对传 | 本次不做 |

## 设计概要

将 `RemoteExplorer` 重构成一个容器，内部由四个子组件组成：

1. **Toolbar**：常用操作按钮（后退、前进、向上、刷新、新建文件夹、下载、删除、传输队列）。
2. **AddressBar**：面包屑路径 + 可编辑路径输入框。
3. **NavigationPane**：左侧目录树，高亮当前目录。
4. **FileList**：Details 视图文件列表，带列头（复选框、名称、修改日期、类型、大小），支持排序和多选。
5. **StatusBar**：底部项目数、选择数、错误/加载状态。

## 组件结构

```
RemoteExplorer
├── Toolbar
│   ├── 后退 / 前进 / 向上
│   ├── 新建文件夹
│   ├── 下载（多选时启用）
│   ├── 删除（多选时启用）
│   ├── 刷新
│   └── 传输队列
├── AddressBar
│   ├── 面包屑段（server › home › yufan）
│   └── 路径输入框
├── main-content
│   ├── NavigationPane（左侧 220px）
│   └── FileList（右侧自适应）
└── StatusBar
```

## 组件职责

### Toolbar

- 接收 props：
  - `canGoBack`, `canGoForward` — 导航历史状态
  - `hasSelection` — 是否有选中项
  - `isLoading` — 是否加载中
  - `onBack`, `onForward`, `onUp`, `onRefresh`, `onNewFolder`, `onDownload`, `onDelete`, `onOpenQueue`
- 按钮根据状态启用/禁用。
- 不直接操作 store，只触发回调。

### AddressBar

- 接收 props：
  - `path: string` — 当前路径（如 `/home/yufan`）
  - `remoteName: string` — 远程名称（如 `server`）
  - `onNavigate(path: string)` — 提交路径时调用
- 显示面包屑：`server › home › yufan`。
- 点击面包屑段直接跳转到对应目录。
- 点击空白处或按 F4 切换到路径输入框；按 Enter 提交；按 Esc 取消编辑。

### NavigationPane

- 接收 props：
  - `tree: FolderTreeNode[]` — 目录树数据
  - `currentPath: string`
  - `expandedPaths: Set<string>`
  - `onToggleExpand(path)`
  - `onSelect(path)`
- 渲染可展开/折叠的目录树。
- 当前路径节点高亮。
- 保留现有展开状态管理。

### FileList

- 接收 props：
  - `items: RemoteItem[]`
  - `selectedKeys: Set<string>`
  - `sortKey: 'name' | 'modified' | 'size'`
  - `sortDirection: 'asc' | 'desc'`
  - `onSort(key)`
  - `onSelect(key, event)` — 处理单击/Ctrl/Shift
  - `onDoubleClick(item)`
  - `onContextMenu(item, event)`
  - `onToggleSelectAll()`
- 渲染 Details 视图表格：
  - 列：复选框、名称、修改日期、类型、大小。
  - 名称列默认可排序；后续可扩展其他列排序。
  - 行首复选框；点击主体切换选择；Ctrl/Cmd 加选；Shift 范围选。
  - 表头复选框用于全选/取消全选当前页。
- 空目录显示“此文件夹为空”。
- 加载中显示骨架屏或 spinner。

### StatusBar

- 接收 props：
  - `itemCount: number`
  - `selectedCount: number`
  - `error?: string | null`
  - `isLoading?: boolean`
- 左侧显示项目数和选择数。
- 右侧显示加载 spinner 或错误提示。

## 用户流程

```text
登录成功
  │
  ▼
RemoteExplorer 加载根目录
  │
  ▼
用户通过左侧树 / 地址栏 / 双击目录 / 工具栏向上 浏览
  │
  ▼
用户点击行首复选框或行主体选择文件/文件夹
  │
  ▼
Toolbar 的下载/删除按钮随选择启用
  │
  ▼
用户点击下载 → 弹出目录选择器 → 加入传输队列
```

## 数据流

- 复用现有 Zustand store：
  - `remotePath`
  - `remoteItems`
  - `selectedRemoteKeys`
  - `remoteTreeChildren`
  - `expandedRemotePaths`
  - `remoteHistory` / `remoteHistoryIndex`
- `RemoteExplorer` 从 store 读取状态，调用 API 加载目录。
- `FileList` 的排序状态（`sortKey`、`sortDirection`）作为 `RemoteExplorer` 的本地 state，不进入全局 store。
- 选择状态保留在 store 中；导航到新目录时**不再清空**选择，允许跨目录批量操作。
- Toolbar 操作回调由 `RemoteExplorer` 提供，内部调用现有 `startSshDownloadTask`、`deleteRemoteItem`、`createRemoteFolder` 等逻辑。

## 错误与加载处理

| 场景 | 处理方式 |
|---|---|
| 目录加载中 | FileList 显示骨架屏；StatusBar 显示“加载中...” |
| 空目录 | FileList 居中显示“此文件夹为空” |
| 加载失败 | 顶部 error banner + StatusBar 错误文本 |
| 删除/新建失败 | error banner + StatusBar 错误文本 |
| 无选择时点击下载/删除 | 按钮禁用 |

## 状态管理调整

Zustand store 的 `setRemoteItems` 当前会在加载目录时清空 `selectedRemoteKeys`。需要改为：

- 不自动清空选择。
- 可选：加载完成后，移除选择集中已不存在于当前目录的 key（避免幽灵选择）。

## 关键文件变更

| 文件 | 变更 |
|---|---|
| `desktop/src/features/remote/RemoteExplorer.tsx` | 重写为容器，组合 Toolbar/AddressBar/NavigationPane/FileList/StatusBar。 |
| `desktop/src/features/remote/RemoteExplorer.test.tsx` | 更新测试为容器级别。 |
| `desktop/src/features/remote/Toolbar.tsx` | 新增工具栏组件。 |
| `desktop/src/features/remote/AddressBar.tsx` | 新增地址栏组件。 |
| `desktop/src/features/remote/NavigationPane.tsx` | 新增左侧目录树组件（可复用现有树逻辑）。 |
| `desktop/src/features/remote/FileList.tsx` | 新增 Details 视图文件列表。 |
| `desktop/src/features/remote/FilePane.tsx` | 删除（由 FileList 替代）。 |
| `desktop/src/features/remote/StatusBar.tsx` | 新增底部状态栏组件。 |
| `desktop/src/features/remote/RemoteExplorer.css` 或 `desktop/src/styles.css` | 新增布局样式。 |
| `desktop/src/i18n/messages.ts` | 新增 toolbar / addressBar / fileList / statusBar 文案。 |
| `desktop/src/state/useAppStore.ts` | 调整 `setRemoteItems` 不清空选择。 |

## 测试计划

- `Toolbar.test.tsx`：按钮渲染、启用/禁用状态、回调触发。
- `AddressBar.test.tsx`：面包屑渲染、点击跳转、编辑提交/取消。
- `NavigationPane.test.tsx`：树渲染、当前节点高亮、展开/折叠、点击加载。
- `FileList.test.tsx`：列渲染、排序切换、单击/Ctrl/Shift 选择、双击进入目录、空状态。
- `RemoteExplorer.test.tsx`：组合交互、Toolbar 与 FileList 联动。
- 更新 `App.remote.test.tsx`：通过 launcher 连接后能看到新的 Explorer 布局元素。

## 非目标（后续优化）

以下内容不在本次设计范围内：

- 本地文件面板与双窗格对传
- 视图模式切换（超大图标、大图标、中图标、小图标、列表、平铺、内容）
- 详情窗格 / 预览窗格
- 上传功能接入
- 右键上下文菜单的完整属性面板
- 队列窗口合并到主窗口
- 键盘快捷键（Backspace 返回、Delete 删除等）

## 验收标准

- [ ] 登录后 RemoteExplorer 显示工具栏、地址栏、左侧树、右侧 Details 文件列表、底部状态栏。
- [ ] 工具栏按钮根据导航历史和选择状态正确启用/禁用。
- [ ] 地址栏面包屑可点击跳转，路径输入框可编辑提交。
- [ ] 文件列表显示名称、修改日期、类型、大小四列；名称列可排序。
- [ ] 行首复选框 + Ctrl/Cmd 加选 + Shift 范围选 + 表头全选。
- [ ] 切换目录后选择状态保留（或仅移除当前目录不存在的幽灵选择）。
- [ ] 空目录、加载中、错误状态有明确反馈。
- [ ] 所有新增/更新组件测试通过，桌面端完整测试套件通过。
