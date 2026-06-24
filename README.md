# 局域网文件面板

中文 Node.js 控制层，后端代理本机 rclone RC 和 aria2 RPC。

## 运行

```bash
npm start
```

默认监听：

- `http://127.0.0.1:5590/`
- `http://10.42.0.1:5590/`

默认登录凭据复用 `~/.config/file-transfer/rclone-rc.credentials`。

## 环境变量

- `PANEL_BIND`：监听地址，逗号分隔，默认 `127.0.0.1,10.42.0.1`
- `PANEL_PORT`：监听端口，默认 `5590`
- `PANEL_USER` / `PANEL_PASS`：面板登录凭据，默认复用 rclone 凭据
- `RCLONE_CREDENTIALS`：rclone 凭据文件
- `ARIA2_CONF`：aria2 配置文件

## 功能

- 中文登录和文件浏览
- rclone remotes 切换
- 新建文件夹、删除文件、删除空目录
- 单文件/多文件上传
- 文件下载
- aria2 URL 下载、任务查看、暂停/继续/移除
- 发送策略：大文件走对端 aria2 拉取，小文件可选 rclone copy 或 rsync

## 分流发送

文件行里的“发送”按钮会读取侧栏“发送策略”：

- 文件大小 >= 阈值：本机启动临时 `rclone serve http`，对端 `aria2c` 通过 RPC 拉取。
- 文件大小 < 阈值：按配置走 `rclone copy` 目标 remote，或走 `rsync` 目标。

对端 aria2 需要允许本机访问它的 `6800/jsonrpc`，并配置 `rpc-secret`。
