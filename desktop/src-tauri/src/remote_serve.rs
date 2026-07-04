use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::sftp::ConnectionProfile;
use crate::ssh_exec::ssh_exec;

const SERVE_TTL: Duration = Duration::from_secs(2 * 60 * 60); // 2 hours

pub struct ServedInfo {
    pub port: u16,
    pub pid: u32,
    pub backend: String,
}

#[derive(Clone)]
struct ServedEntry {
    port: u16,
    pid: u32,
    backend: String,
    directory: String,
    expires_at: Instant,
}

static SERVED: OnceLock<Mutex<HashMap<String, ServedEntry>>> = OnceLock::new();

fn served_map() -> &'static Mutex<HashMap<String, ServedEntry>> {
    SERVED.get_or_init(|| Mutex::new(HashMap::new()))
}

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\"'\"'"))
}

fn pick_remote_port() -> u16 {
    use rand::Rng;
    18000 + rand::thread_rng().gen_range(0..20000)
}

/// Ensure a remote HTTP file server is running for the given directory.
/// Tries rclone first, falls back to a Python Range HTTP server.
pub async fn ensure_served_directory(
    profile: &ConnectionProfile,
    directory: &str,
) -> Result<ServedInfo, String> {
    let key = format!("{}|{}", profile.host, directory);

    // Check cache
    {
        let mut map = served_map().lock().unwrap();
        if let Some(entry) = map.get_mut(&key) {
            if entry.expires_at > Instant::now() {
                entry.expires_at = Instant::now() + SERVE_TTL;
                return Ok(ServedInfo {
                    port: entry.port,
                    pid: entry.pid,
                    backend: entry.backend.clone(),
                });
            }
            map.remove(&key);
        }
    }

    let port = pick_remote_port();
    let log_path = format!("/tmp/lan-transfer-serve-{}.log", port);
    let helper_path = format!("/tmp/lan-transfer-range-server-{}.py", port);

    let script = build_serve_script(directory, port, &log_path, &helper_path);

    let output = ssh_exec(profile, &script).await?;
    let stdout = output.stdout.trim();

    let (backend, pid) = parse_serve_output(stdout)?;

    let entry = ServedEntry {
        port,
        pid,
        backend: backend.clone(),
        directory: directory.to_string(),
        expires_at: Instant::now() + SERVE_TTL,
    };

    {
        let mut map = served_map().lock().unwrap();
        map.insert(key, entry);
    }

    Ok(ServedInfo { port, pid, backend })
}

fn build_serve_script(
    directory: &str,
    port: u16,
    log_path: &str,
    helper_path: &str,
) -> String {
    let quoted_dir = shell_quote(directory);
    let quoted_log = shell_quote(log_path);
    let quoted_helper = shell_quote(helper_path);

    format!(
        r#"set -eu
if command -v rclone >/dev/null 2>&1; then
  nohup rclone serve http {dir} --addr '127.0.0.1:{port}' --read-only --dir-cache-time 30s --server-read-timeout 24h --server-write-timeout 24h > {log} 2>&1 < /dev/null &
  echo rclone:$!
else
{python_script}
  nohup python3 {helper} {dir} {port} > {log} 2>&1 < /dev/null &
  echo python:$!
fi"#,
        dir = quoted_dir,
        port = port,
        log = quoted_log,
        helper = quoted_helper,
        python_script = build_python_deploy_script(helper_path),
    )
}

fn build_python_deploy_script(helper_path: &str) -> String {
    let quoted_helper = shell_quote(helper_path);
    format!(
        r#"cat > {helper} <<'PY'
{python_code}
PY"#,
        helper = quoted_helper,
        python_code = PYTHON_RANGE_HTTP_SERVER,
    )
}

fn parse_serve_output(stdout: &str) -> Result<(String, u32), String> {
    for line in stdout.lines() {
        let line = line.trim();
        if line.starts_with("rclone:") || line.starts_with("python:") {
            let parts: Vec<&str> = line.splitn(2, ':').collect();
            if parts.len() == 2 {
                let backend = parts[0].to_string();
                let pid: u32 = parts[1]
                    .trim()
                    .parse()
                    .map_err(|_| format!("无法解析 PID: {}", line))?;
                return Ok((backend, pid));
            }
        }
    }
    Err(format!(
        "无法从远程服务输出中解析 backend:pid: {}",
        stdout
    ))
}

/// Stop a remote serve process by directory key.
pub async fn stop_served_directory(
    profile: &ConnectionProfile,
    directory: &str,
) {
    let key = format!("{}|{}", profile.host, directory);
    let entry = {
        let mut map = served_map().lock().unwrap();
        map.remove(&key)
    };

    if let Some(entry) = entry {
        let _ = ssh_exec(profile, &format!("kill {}", entry.pid)).await;
    }
}

/// Garbage-collect expired serve entries.
pub fn sweep_expired(profile_hint: Option<&ConnectionProfile>) {
    let expired: Vec<(String, ServedEntry)> = {
        let mut map = served_map().lock().unwrap();
        let now = Instant::now();
        let expired_keys: Vec<String> = map
            .iter()
            .filter(|(_, e)| e.expires_at <= now)
            .map(|(k, _)| k.clone())
            .collect();

        expired_keys
            .into_iter()
            .filter_map(|k| map.remove(&k).map(|e| (k, e)))
            .collect()
    };

    // Best-effort kill of remote processes
    if let Some(profile) = profile_hint {
        for (_, entry) in expired {
            let _ = std::process::Command::new("ssh")
                .arg("-o")
                .arg("BatchMode=yes")
                .arg(&profile.host)
                .arg("kill")
                .arg(entry.pid.to_string())
                .output();
        }
    }
}

/// Shut down all served directories (called on app exit).
pub fn shutdown_all() {
    let mut map = served_map().lock().unwrap();
    map.clear();
}

// ---------------------------------------------------------------------------
// Python Range HTTP Server (embedded)
// ---------------------------------------------------------------------------

const PYTHON_RANGE_HTTP_SERVER: &str = r#"import mimetypes
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
"#;
