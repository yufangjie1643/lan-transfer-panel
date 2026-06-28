import { buildLocalAria2Download } from './aria2-download.js';

export function buildSshTunnelArgs({ host, localPort, remotePort }) {
  const targetHost = assertHost(host);
  const local = assertPort(localPort);
  const remote = assertPort(remotePort);
  return [
    '-o',
    'BatchMode=yes',
    '-N',
    '-L',
    `127.0.0.1:${local}:127.0.0.1:${remote}`,
    targetHost,
  ];
}

export function buildRcloneServeArgs({ directory, port }) {
  const serveDirectory = String(directory || '').trim();
  if (!serveDirectory) throw new Error('directory is required');
  return [
    'serve',
    'http',
    serveDirectory,
    '--addr',
    `127.0.0.1:${assertPort(port)}`,
    '--read-only',
    '--dir-cache-time',
    '30s',
    '--server-read-timeout',
    '24h',
    '--server-write-timeout',
    '24h',
  ];
}

export function buildPythonRangeServeScript({ helperPath, directory, port, logPath }) {
  const targetHelperPath = String(helperPath || '').trim();
  const serveDirectory = String(directory || '').trim();
  const targetLogPath = String(logPath || '').trim();
  if (!targetHelperPath) throw new Error('helperPath is required');
  if (!serveDirectory) throw new Error('directory is required');
  if (!targetLogPath) throw new Error('logPath is required');

  return [
    `cat > ${shellQuote(targetHelperPath)} <<'PY'`,
    pythonRangeHttpScript(),
    'PY',
    [
      'nohup',
      'python3',
      shellQuote(targetHelperPath),
      shellQuote(serveDirectory),
      String(assertPort(port)),
      '>',
      shellQuote(targetLogPath),
      '2>&1',
      '<',
      '/dev/null',
      '&',
    ].join(' '),
    'echo python:$!',
  ].join('\n');
}

export function buildSshServedFileDownload({ stat, localPort, dir }) {
  if (!stat || stat.IsDir) throw new Error('file stat is required');
  const serveDirectory = String(stat.ParentPath || '').trim();
  if (!serveDirectory) throw new Error('stat.ParentPath is required');
  const request = buildLocalAria2Download({
    servedOrigin: `http://127.0.0.1:${assertPort(localPort)}`,
    remotePath: stat.Name,
    item: stat,
    dir,
  });
  return {
    ...request,
    serveDirectory,
  };
}

function assertHost(value) {
  const host = String(value || '').trim();
  if (!host || /[\r\n]/.test(host)) throw new Error('host is required');
  return host;
}

function assertPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('port is invalid');
  }
  return port;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function pythonRangeHttpScript() {
  return String.raw`import mimetypes
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(sys.argv[1]).expanduser().resolve()
PORT = int(sys.argv[2])

class Handler(BaseHTTPRequestHandler):
    server_version = "LanTransferRangeHTTP/0.1"

    def log_message(self, format, *args):
        return

    def do_HEAD(self):
        self.serve_file(False)

    def do_GET(self):
        self.serve_file(True)

    def resolve_path(self):
        rel = unquote(self.path.split("?", 1)[0]).lstrip("/")
        target = (ROOT / rel).resolve()
        try:
            common = os.path.commonpath([str(ROOT), str(target)])
        except ValueError:
            return None
        if common != str(ROOT):
            return None
        return target

    def serve_file(self, send_body):
        target = self.resolve_path()
        if target is None or not target.is_file():
            self.send_error(404)
            return

        size = target.stat().st_size
        start = 0
        end = max(size - 1, 0)
        status = 200
        range_header = self.headers.get("Range")
        if range_header:
            try:
                if not range_header.startswith("bytes="):
                    raise ValueError()
                spec = range_header[6:].split(",", 1)[0].strip()
                left, right = spec.split("-", 1)
                if left == "":
                    suffix_length = int(right)
                    if suffix_length <= 0:
                        raise ValueError()
                    start = max(size - suffix_length, 0)
                else:
                    start = int(left)
                    if right:
                        end = min(int(right), size - 1)
                if size == 0 or start < 0 or start >= size or end < start:
                    raise ValueError()
                status = 206
            except ValueError:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Accept-Ranges", "bytes")
                self.end_headers()
                return

        length = 0 if size == 0 else end - start + 1
        self.send_response(status)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Type", mimetypes.guess_type(target.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(length))
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()

        if not send_body or length == 0:
            return
        with target.open("rb") as source:
            source.seek(start)
            remaining = length
            while remaining > 0:
                chunk = source.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except BrokenPipeError:
                    break
                remaining -= len(chunk)

ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
`;
}
