# 桌面端登录与服务器配置启动器优化设计

## 目标

解决 Tauri 桌面客户端打开后“每次都要重新填登录信息”的问题，将首屏从密集登录表单改为已保存服务器卡片列表，让拥有 2–3 台常用服务器的用户能够快速切换、连接。

## 背景

当前桌面端 `desktop/src/features/auth/LoginScreen.tsx` 在 `App.tsx` 中作为首屏直接渲染，表单包含：

- 配置档案选择器
- 主机、端口、用户名
- 密码 / SSH 私钥路径 / passphrase
- 保存/删除配置按钮
- 折叠的高级设置（aria2 RPC、远程临时目录、下载服务）

问题：

1. 用户每次打开应用都要面对完整表单，即使只是想连接一台已保存的服务器。
2. “保存配置”“连接”“删除”三个按钮并列，主次不清。
3. 高级设置默认折叠，但部分字段会影响连接行为。
4. 代码中本地浏览和上传入口未接入，但这是后续优化项；本次设计仅聚焦登录与服务器配置。

## 用户确认的设计决策

| 问题 | 用户选择 |
|---|---|
| 优化范围 | Tauri 桌面客户端 |
| 最优先痛点 | 每次打开都要重新填 |
| 服务器数量 | 2–3 台，经常切换 |
| 方案 | 方案 A：服务器启动器 |
| 数据流 | 启动器加载本地档案，连接成功后进入浏览器 |
| 错误提示 | 卡片内联错误 + 全局 Toast |
| 测试范围 | Launcher 组件测试 + Form 组件测试 |

## 设计概要

将首屏从“登录表单”改为“服务器启动器”：

- 打开 App 首先看到已保存的服务器卡片列表，每张卡片展示名称、主机、端口、用户名，并提供“连接”按钮。
- 未保存任何服务器时显示空状态，引导用户添加第一台服务器。
- 每张卡片提供“编辑”和“删除”入口。
- 固定位置的“添加服务器”按钮进入添加/编辑表单。
- 添加/编辑页只负责保存配置；保存后可选择“保存并连接”或“仅保存”。

## 用户流程

```text
启动 App
  │
  ▼
读取 Tauri store 中的已保存 SSH 配置档案
  │
  ▼
LauncherScreen（服务器启动器）
  ├─ 点击「连接」→ 测试 SSH → 成功 → 设置全局状态 → 进入 RemoteExplorer
  ├─ 点击「编辑」→ 进入 ServerFormScreen（编辑模式，回填字段）
  ├─ 点击「删除」→ 非阻塞确认 → 从 store 移除 → 刷新列表
  └─ 点击「添加服务器」→ 进入 ServerFormScreen（新增模式）
```

## 页面/组件结构

### LauncherScreen

职责：展示已保存服务器、发起连接、导航到添加/编辑。

包含：

- 页面标题："选择服务器" / "LAN Transfer"
- 服务器卡片网格（响应式，1–3 列）
  - 卡片内容：配置名称、host:port、用户名
  - 操作：「连接」主按钮、「编辑」文字链接、「删除」文字链接（带二次确认）
- 空状态：提示未保存服务器，显示显眼的「添加服务器」按钮
- 固定/悬浮的「添加服务器」按钮

状态：

- `profiles`: `SshProfile[]` — 从 store 加载
- `connectingId`: `string | null` — 当前正在连接的配置 id，用于显示 loading
- `errorById`: `Map<string, string>` — 每个卡片各自的连接错误

### ServerFormScreen

职责：新增或编辑服务器配置，保存到 Tauri store。

包含：

- 表单字段
  - 配置名称（label，必填）
  - 主机 + 端口（并排）
  - 用户名
  - 认证方式：密码 / SSH 私钥（单选或下拉）
  - 对应密码或私钥路径（可带 passphrase）
  - 高级设置折叠区：aria2 RPC、远程临时目录、下载服务方式
- 操作按钮：「取消」、「保存并连接」、「仅保存」

状态：

- `mode`: `'add' | 'edit'`
- `form`: 表单字段对象
- `errors`: 字段级校验错误
- `isSaving`: 保存中
- `isConnecting`: 连接中（仅“保存并连接”）

### 导航切换

- 使用现有 React Router（如已在桌面端引入）或通过 `App.tsx` 的条件渲染切换 `LauncherScreen` / `ServerFormScreen` / `RemoteExplorer`。
- 当前桌面端未使用路由，本次设计推荐条件渲染，改动最小：
  - `appView: 'launcher' | 'server-form' | 'remote'`
  - `editingProfileId?: string` — 编辑模式时指向对应 profile id，新增时为 `undefined`。

## 数据流

1. **启动时**
   - `App.tsx` 启动即调用 `loadProfiles()`（复用 `connectionProfiles.ts` 中的 invoke）。
   - 加载完成后 `appView = 'launcher'`。
2. **连接**
   - `LauncherScreen` 调用 `connect(profile)`。
   - 先设置 `connectingId`。
   - 复用现有 `testSshConnection` / `loadRemoteDir` 逻辑验证 SSH 并拉取根目录。
   - 成功：设置 Zustand store 的 `sessionUsername`、`remotes`、`remotePath`、`remoteItems`，`appView = 'remote'`。
   - 失败：将错误写入 `errorById[profile.id]`，并显示全局 Toast。
3. **保存/新增**
   - `ServerFormScreen` 校验字段。
   - 调用 `saveProfile(form)` 写入 Tauri store。
   - 若用户点击「保存并连接」：保存成功后直接触发连接流程。
   - 完成后返回 `LauncherScreen`。
4. **删除**
   - `LauncherScreen` 显示非阻塞确认（小弹窗或二次确认按钮）。
   - 调用 `deleteProfile(profile.id)` 后刷新 `profiles`。

## 错误处理

| 场景 | 处理方式 |
|---|---|
| 加载档案失败 | 全局 Toast + 允许用户手动添加 |
| 某服务器连接失败 | 在该卡片下方显示内联错误文案 |
| 表单字段校验失败 | 字段级红色提示，聚焦首个错误项 |
| 保存失败 | 表单底部/顶部错误横幅 |
| 删除确认 | 卡片内的二次确认按钮（如「删除」变为「确认删除？」），避免弹窗阻塞 |
| 无网络/SSH 不可达 | 保留现有 Rust 侧错误透传，显示中文提示 |

## 状态管理调整

Zustand store (`desktop/src/state/appStore.ts`) 现有字段足够，新增/调整：

- `appView: 'launcher' | 'server-form' | 'remote'` — 控制顶层视图。
- `editingProfileId?: string` — 编辑模式回填用，新增时为 `undefined`。
- 保留现有 `sessionUsername`、`remotePath`、`remoteItems` 等连接后状态。

## 关键文件变更

| 文件 | 变更 |
|---|---|
| `desktop/src/App.tsx` | 引入 `LauncherScreen`，根据 `appView` 渲染；启动时加载 profiles。 |
| `desktop/src/features/auth/LauncherScreen.tsx` | 新增启动器页面。 |
| `desktop/src/features/auth/ServerFormScreen.tsx` | 新增添加/编辑表单页面。 |
| `desktop/src/features/auth/LoginScreen.tsx` | 用新增的 `ServerFormScreen` 替代；原文件可删除或重命名为 ServerFormScreen。 |
| `desktop/src/features/auth/connectionProfiles.ts` | 保持现有 Tauri store 读写 API；必要时新增 `deleteProfile`。 |
| `desktop/src/state/appStore.ts` | 新增 `appView`、`editingProfileId`。 |
| `desktop/src/i18n/*.ts` | 新增启动器与表单相关文案。 |

## 测试计划

使用桌面端现有 Vitest + jsdom + Testing Library 栈。

1. **LauncherScreen 组件测试**
   - 渲染多个 profile 卡片，验证名称、主机、用户名显示正确。
   - 空状态时显示“添加服务器”引导。
   - 点击「连接」触发连接回调并显示 loading。
   - 点击「编辑」触发编辑回调。
   - 删除需要二次确认。
2. **ServerFormScreen 组件测试**
   - 新增模式渲染空表单。
   - 编辑模式正确回填字段。
   - 必填字段为空时显示校验错误。
   - 提交有效表单触发保存回调。
   - 点击「保存并连接」触发保存 + 连接回调。

## 非目标（后续再优化）

以下内容不在本次设计范围内，避免范围蔓延：

- 本地文件浏览与上传入口的接入
- 队列窗口合并到主窗口
- 浏览器 Web 面板的弹窗改造
- 多语言切换
- 自动连接最后一次使用的服务器（可作为后续增强）

## 验收标准

- [ ] 打开桌面端首屏为服务器启动器，已保存配置以卡片形式展示。
- [ ] 点击「连接」后成功进入远程文件浏览器；失败时在同张卡片内显示错误。
- [ ] 可添加新服务器并保存；编辑现有服务器；删除时二次确认。
- [ ] 未保存任何服务器时显示空状态并引导添加。
- [ ] 现有连接后的 RemoteExplorer 行为保持不变。
- [ ] Launcher 与 ServerForm 组件测试通过。
