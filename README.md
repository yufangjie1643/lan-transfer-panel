# 局域网文件面板

中文 Node.js 控制层。Windows 本机运行前端和 aria2 RPC；服务器侧通过 SSH 运行 rclone/文件读取命令。

## 运行

```bash
npm start
```

默认监听：

- `http://localhost:5590/`
- `http://10.42.0.1:5590/`

默认文件源是 SSH 主机 `yufanssh` 的 `/home/yufan`。如果没有本机 rclone 凭据，需要设置 `PANEL_PASS` 作为面板登录密码。

## 客户端开发

Windows 桌面客户端可直接调用本服务的 HTTP API。接口、认证 Cookie、文件上传下载、目录打包下载和任务队列说明见：

- [`docs/client-api.md`](docs/client-api.md)

## 桌面客户端

桌面客户端位于 `desktop/`，技术栈为 Tauri v2、React、TypeScript 和 Rust。登录页现在以 SSH 为入口：填写服务器地址、SSH 端口、用户名，以及密码或私钥路径。默认服务器配置是 `10.42.0.1:22` / `yufan`。

可以保存多组服务器配置；配置文件位于 `%APPDATA%\LAN Transfer\ssh-profiles.json`。默认不保存密码或密钥密码，只有勾选“保存此服务器配置”时才会写入本地配置文件。

```powershell
npm install
npm install --prefix desktop
npm start
npm run desktop:dev
```

验证桌面端：

```powershell
npm run desktop:test
cargo check --manifest-path desktop/src-tauri/Cargo.toml
```

### 桌面端下载

当前桌面端优先走 SSH 文件浏览和单文件下载：

- 远程普通文件：点击“下载到...”或拖拽文件行后选择本地目录，桌面端调用系统 `scp` 下载到该目录。
- 远程文件夹：文件夹拖拽已禁用，后续再接入目录下载策略。
- 旧的 Windows OLE 虚拟文件拖拽 demo 已移除，避免和当前 SSH 下载路径混用。

启动 demo：

```powershell
cd E:\Code\lan-transfer-panel
npm run desktop:dev
```

## 环境变量

- `PANEL_BIND`：监听地址，逗号分隔，默认 `127.0.0.1,10.42.0.1`
- `PANEL_PORT`：监听端口，默认 `5590`
- `PANEL_USER` / `PANEL_PASS`：面板登录凭据，默认复用 rclone 凭据
- `RCLONE_CREDENTIALS`：rclone 凭据文件
- `ARIA2_CONF`：aria2 配置文件
- `SSH_HOST`：服务器 SSH Host，默认 `yufanssh`
- `SSH_ROOT`：服务器文件浏览根目录，默认 `/home/yufan`
- `SSH_REMOTE_NAME`：前端显示的服务器位置名，默认 `server`

## 功能

- 中文登录和服务器文件浏览
- 可选 rclone remotes 切换
- 新建文件夹、删除文件、删除空目录
- 单文件/多文件上传
- 文件下载
- aria2 URL 下载、服务器文件加入本机 aria2、任务查看、暂停/继续/移除
- 发送策略：大文件走对端 aria2 拉取，小文件可选 rclone copy 或 rsync

## 服务器文件下载

文件行里的“aria2”按钮会优先在服务器上启动临时 `rclone serve http`，只绑定服务器 `127.0.0.1`；如果服务器 PATH 里没有 rclone，会退回内置 Python Range HTTP helper。Windows 通过 `ssh -L` 建本地隧道，把 `http://127.0.0.1:<localPort>/<file>` 提交给本机 aria2。Windows 不需要安装 rclone。aria2 负责并发下载和断点续传。

文件夹下载会先统计目录：

- 单文件 `< 1 MB`：归入小文件集合；小文件数量 `> 10` 时统一打成未压缩 `tar`，下载完成后自动解压映射目录。
- 小文件数量 `<= 10`：不打包，和大文件一样直接加入 aria2。
- 单文件 `>= 1 MB`：不打包，递归展开为普通 aria2 文件任务，保留相对目录结构和断点续传。
- 下载前会弹出确认，展示文件总数、总大小、小文件归档数量/大小、大文件直下数量/大小。

小文件打包下载完成后，Windows 后端会自动解压到 aria2 下载目录，并删除本地归档；服务器 `/tmp` 中的临时归档也会在后处理完成后删除。

## 分流发送

文件行里的“发送”按钮会读取侧栏“发送策略”：

- 文件大小 >= 阈值：启动临时 HTTP 源，对端 `aria2c` 通过 RPC 拉取。
- 文件大小 < 阈值：按配置走 `rclone copy` 目标 remote，或走 `rsync` 目标。

对端 aria2 需要允许本机访问它的 `6800/jsonrpc`，并配置 `rpc-secret`。
