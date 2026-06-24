# Windows Client API

This document describes the HTTP API exposed by the LAN transfer panel backend for a native Windows client.

## Base URL

Default server addresses:

- `http://127.0.0.1:5590`
- `http://10.42.0.1:5590`

The LAN address depends on `PANEL_BIND` and `PANEL_PORT`.

## Authentication

Login is cookie based.

`POST /api/login`

Request:

```json
{ "username": "user", "password": "pass" }
```

Success response:

```json
{ "ok": true, "username": "user" }
```

The server sets an `HttpOnly` cookie named `ltp_session`. Desktop clients must store and send this cookie on later requests.

`POST /api/logout`

Clears the session cookie.

All other `/api/*` endpoints require authentication and return:

```json
{ "error": "未登录" }
```

with HTTP `401` when unauthenticated.

## Common Error Shape

Most JSON errors use:

```json
{ "error": "message", "detail": "optional details" }
```

Useful status codes:

- `400`: invalid request
- `401`: not logged in
- `404`: unknown endpoint
- `502`: backend tool or transfer service failed

## Session

`GET /api/session`

Returns current session and server metadata.

```json
{
  "ok": true,
  "username": "user",
  "rcloneUrl": "http://127.0.0.1:5572",
  "aria2Dir": "/mnt/data/downloads/aria2",
  "bindAddresses": ["127.0.0.1", "10.42.0.1"],
  "port": 5590
}
```

## Storage Browsing

`GET /api/remotes`

Returns storage locations.

```json
{ "remotes": ["data", "home"] }
```

`GET /api/list?remote=data&path=folder/subfolder`

Returns directory contents.

```json
{
  "remote": "data",
  "path": "folder",
  "list": [
    {
      "Path": "folder/report.pdf",
      "Name": "report.pdf",
      "Size": 12345,
      "MimeType": "application/pdf",
      "ModTime": "2026-06-24T12:00:00Z",
      "IsDir": false
    }
  ]
}
```

Notes:

- `remote` accepts letters, numbers, `_`, `.`, and `-`.
- `path` uses `/` separators. Backslashes are normalized.
- Directories are marked with `IsDir: true`.

## File Operations

`POST /api/mkdir`

Create a folder under a parent path.

```json
{ "remote": "data", "path": "parent", "name": "New Folder" }
```

Response:

```json
{ "ok": true, "path": "parent/New Folder" }
```

`POST /api/delete`

Delete a file or empty directory. Root deletion is blocked.

```json
{ "remote": "data", "path": "parent/file.txt", "isDir": false }
```

Response:

```json
{ "ok": true }
```

`PUT /api/upload?remote=data&path=parent&name=file.txt`

Body is raw file bytes. Response:

```json
{ "ok": true, "path": "parent/file.txt" }
```

`GET /api/download?remote=data&path=parent/file.txt`

Streams a single file. Uses `Content-Disposition: attachment`.

`GET /api/download-folder?remote=data&path=parent/folder`

Downloads a directory as `folder.tar.gz`. Server behavior:

1. Copies the remote folder to a temporary local directory.
2. Creates a `.tar.gz` archive using `gzip -1` for light compression.
3. Streams the archive with `Content-Type: application/gzip`.
4. Cleans up temporary files after the response closes.

## Download Queue

`POST /api/downloads/add`

Add a URL task.

```json
{ "url": "https://example.com/file.iso", "dir": "/optional/save/dir" }
```

Supported URL schemes: `http`, `https`, `ftp`, and `magnet`.

Response:

```json
{ "ok": true, "gid": "abc123" }
```

`GET /api/downloads/tasks`

Returns active, waiting, stopped tasks and global stats.

```json
{
  "globalStat": { "downloadSpeed": "0", "numActive": "0", "numWaiting": "0" },
  "active": [],
  "waiting": [],
  "stopped": []
}
```

`POST /api/downloads/control`

Control one task.

```json
{ "gid": "abc123", "action": "pause" }
```

Actions:

- `pause`
- `unpause`
- `remove`
- `purge`

Response:

```json
{ "ok": true, "result": "abc123" }
```

## Transfer Stats

`GET /api/transfers/stats`

Returns compact stats for UI status bars.

```json
{
  "transferSpeed": 0,
  "downloadSpeed": 0,
  "activeCount": 0
}
```

Values are bytes per second except `activeCount`.

## Send To Peer

`POST /api/send`

Dispatch one existing file to another machine according to size threshold and method settings.

Request:

```json
{
  "remote": "data",
  "path": "folder/file.bin",
  "thresholdBytes": 1073741824,
  "publicHost": "10.42.0.1",
  "peerReceiverUrl": "http://10.42.0.2:6800/jsonrpc",
  "peerReceiverToken": "token",
  "peerDir": "/target/downloads",
  "smallMethod": "none",
  "copyTarget": "peer:/target/dir",
  "syncTarget": "user@10.42.0.2:/target/dir/"
}
```

Routes:

- If file size is greater than or equal to `thresholdBytes`, server starts a temporary HTTP file source and asks the peer receiver to pull it.
- If file is smaller, `smallMethod` chooses behavior:
  - `none`: fail with a message asking for a copy/sync target.
  - `copy`: copy to `copyTarget`.
  - `sync`: sync to `syncTarget`.

Response examples:

```json
{
  "ok": true,
  "route": "receiver",
  "gid": "abc123",
  "sourceUrl": "http://user:***@10.42.0.1:49152/folder/file.bin",
  "servePort": 49152,
  "expiresAt": "2026-06-24T14:00:00.000Z"
}
```

```json
{ "ok": true, "route": "copy", "destination": "peer:/target/dir/file.bin" }
```

```json
{ "ok": true, "route": "sync", "destination": "user@10.42.0.2:/target/dir/" }
```

## Native Client Recommendations

For a Windows desktop client:

- Use one shared HTTP client with a cookie container.
- Treat `Path` from `/api/list` as the canonical item path.
- Implement Explorer-like navigation client side: double click directory, Backspace parent, F5 refresh.
- For upload, send raw bytes with `PUT /api/upload`.
- For folder download, use `/api/download-folder`; the returned archive is `.tar.gz`.
- For long operations, show progress if `Content-Length` is present; otherwise show indeterminate progress.
- Do not call legacy compatibility endpoints `/api/aria2/*` or `/api/rclone/stats`; use `/api/downloads/*` and `/api/transfers/stats`.

## Minimal Login Flow

1. `POST /api/login`.
2. Save `ltp_session` cookie.
3. `GET /api/remotes`.
4. `GET /api/list?remote=<remote>&path=`.
5. Use the other endpoints with the same cookie.
