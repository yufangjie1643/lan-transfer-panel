use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};
use std::sync::atomic::{AtomicU64, Ordering};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Aria2Config {
    #[serde(default = "default_rpc_url")]
    pub rpc_url: String,
    #[serde(default)]
    pub rpc_secret: String,
    #[serde(default)]
    pub default_dir: String,
}

fn default_rpc_url() -> String {
    "http://127.0.0.1:6800/jsonrpc".to_string()
}

impl Default for Aria2Config {
    fn default() -> Self {
        Self {
            rpc_url: default_rpc_url(),
            rpc_secret: String::new(),
            default_dir: String::new(),
        }
    }
}

fn config_path() -> Result<PathBuf, String> {
    let dir = if cfg!(windows) {
        PathBuf::from(
            std::env::var("APPDATA").map_err(|_| "无法定位 APPDATA".to_string())?,
        )
    } else {
        dirs_home().join(".config")
    };
    Ok(dir.join("LAN Transfer").join("aria2-config.json"))
}

fn dirs_home() -> PathBuf {
    PathBuf::from(
        std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| ".".to_string()),
    )
}

fn session_path() -> PathBuf {
    let dir = if cfg!(windows) {
        PathBuf::from(
            std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string()),
        )
    } else {
        dirs_home().join(".config")
    };
    dir.join("LAN Transfer").join("aria2-session.txt")
}

pub fn load_config() -> Aria2Config {
    let path = match config_path() {
        Ok(p) => p,
        Err(_) => return Aria2Config::default(),
    };
    let text = match std::fs::read_to_string(&path) {
        Ok(t) => t,
        Err(_) => return Aria2Config::default(),
    };
    serde_json::from_str(&text).unwrap_or_default()
}

pub fn save_config(config: &Aria2Config) -> Result<(), String> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?;
    }
    let text = serde_json::to_string_pretty(config).map_err(|e| format!("序列化配置失败: {}", e))?;
    std::fs::write(&path, text).map_err(|e| format!("写入配置文件失败: {}", e))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

static RPC_ID: AtomicU64 = AtomicU64::new(1);

fn rpc_request(method: &str, params: Vec<Value>) -> Result<Value, String> {
    let config = load_config();
    let id = RPC_ID.fetch_add(1, Ordering::Relaxed);

    let mut all_params = Vec::with_capacity(params.len() + 1);
    if !config.rpc_secret.is_empty() {
        all_params.push(json!(format!("token:{}", config.rpc_secret)));
    }
    all_params.extend(params);

    let body = json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": all_params,
    });

    let response: Value = ureq::post(&config.rpc_url)
        .send_json(&body)
        .map_err(|e| format!("aria2 RPC 请求失败: {}", e))?
        .into_json()
        .map_err(|e| format!("解析 aria2 响应失败: {}", e))?;

    if let Some(error) = response.get("error") {
        let msg = error
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("未知错误");
        return Err(format!("aria2 错误: {}", msg));
    }

    Ok(response
        .get("result")
        .cloned()
        .unwrap_or(Value::Null))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

pub fn is_available() -> bool {
    rpc_request("aria2.getGlobalStat", vec![]).is_ok()
}

pub fn add_uri(urls: &[&str], options: &Value) -> Result<String, String> {
    let urls_json: Vec<Value> = urls.iter().map(|u| json!(u)).collect();
    let result = rpc_request("aria2.addUri", vec![json!(urls_json), options.clone()])?;
    result
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "aria2 返回的 gid 格式无效".to_string())
}

pub fn tell_status(gid: &str, keys: &[&str]) -> Result<Value, String> {
    let keys_json: Vec<Value> = keys.iter().map(|k| json!(k)).collect();
    rpc_request("aria2.tellStatus", vec![json!(gid), json!(keys_json)])
}

pub fn get_global_stat() -> Result<Value, String> {
    rpc_request("aria2.getGlobalStat", vec![])
}

pub fn tell_active(keys: &[&str]) -> Result<Vec<Value>, String> {
    let keys_json: Vec<Value> = keys.iter().map(|k| json!(k)).collect();
    let result = rpc_request("aria2.tellActive", vec![json!(keys_json)])?;
    result.as_array().cloned().ok_or_else(|| "tellActive 返回格式无效".to_string())
}

pub fn tell_waiting(offset: i32, num: i32, keys: &[&str]) -> Result<Vec<Value>, String> {
    let keys_json: Vec<Value> = keys.iter().map(|k| json!(k)).collect();
    let result = rpc_request("aria2.tellWaiting", vec![json!(offset), json!(num), json!(keys_json)])?;
    result.as_array().cloned().ok_or_else(|| "tellWaiting 返回格式无效".to_string())
}

pub fn tell_stopped(offset: i32, num: i32, keys: &[&str]) -> Result<Vec<Value>, String> {
    let keys_json: Vec<Value> = keys.iter().map(|k| json!(k)).collect();
    let result = rpc_request("aria2.tellStopped", vec![json!(offset), json!(num), json!(keys_json)])?;
    result.as_array().cloned().ok_or_else(|| "tellStopped 返回格式无效".to_string())
}

pub fn pause(gid: &str) -> Result<(), String> {
    rpc_request("aria2.pause", vec![json!(gid)])?;
    Ok(())
}

pub fn unpause(gid: &str) -> Result<(), String> {
    rpc_request("aria2.unpause", vec![json!(gid)])?;
    Ok(())
}

pub fn remove(gid: &str) -> Result<(), String> {
    rpc_request("aria2.remove", vec![json!(gid)])?;
    Ok(())
}

pub fn remove_download_result(gid: &str) -> Result<(), String> {
    rpc_request("aria2.removeDownloadResult", vec![json!(gid)])?;
    Ok(())
}

/// Default aria2 options matching the web UI's lib/aria2-download.js
pub fn default_options() -> Value {
    json!({
        "continue": "true",
        "split": "16",
        "max-connection-per-server": "16",
        "min-split-size": "20M",
        "auto-file-renaming": "false",
        "allow-overwrite": "false",
    })
}

/// Build full download options with dir and output filename.
pub fn build_options(dir: &str, out: &str) -> Value {
    let mut opts = default_options();
    if let Some(obj) = opts.as_object_mut() {
        obj.insert("dir".to_string(), json!(dir));
        obj.insert("out".to_string(), json!(out));
    }
    opts
}

// ---------------------------------------------------------------------------
// Auto-start aria2c
// ---------------------------------------------------------------------------

static ARIA2_PROCESS: OnceLock<Mutex<Option<tokio::process::Child>>> = OnceLock::new();

fn aria2_process_lock() -> &'static Mutex<Option<tokio::process::Child>> {
    ARIA2_PROCESS.get_or_init(|| Mutex::new(None))
}

/// Ensure aria2 is running. If not, try to find and start aria2c from PATH.
pub async fn ensure_running() -> Result<(), String> {
    // Already running?
    if is_available() {
        return Ok(());
    }

    // Find aria2c in PATH
    let binary = which::which("aria2c")
        .or_else(|_| which::which("aria2c.exe"))
        .map_err(|_| "未找到 aria2c，请安装 aria2 或将其添加到 PATH".to_string())?;

    // Ensure config exists with a secret
    let mut config = load_config();
    if config.rpc_secret.is_empty() {
        use rand::Rng;
        let secret: String = (0..16)
            .map(|_| {
                let idx = rand::thread_rng().gen_range(0..36);
                if idx < 10 {
                    (b'0' + idx) as char
                } else {
                    (b'a' + idx - 10) as char
                }
            })
            .collect();
        config.rpc_secret = secret;
        save_config(&config)?;
    }

    // Ensure session file directory exists
    let session = session_path();
    if let Some(parent) = session.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    // Build aria2c command
    let mut cmd = tokio::process::Command::new(&binary);
    cmd.arg("--enable-rpc")
        .arg("--rpc-listen-all=false")
        .arg(format!("--rpc-secret={}", config.rpc_secret))
        .arg("--continue")
        .arg("--max-concurrent-downloads=16")
        .arg("--max-connection-per-server=16")
        .arg("--split=16")
        .arg("--min-split-size=20M")
        .arg(format!("--input-file={}", session.display()))
        .arg(format!("--save-session={}", session.display()))
        .arg("--save-session-interval=60")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let child = cmd
        .spawn()
        .map_err(|e| format!("启动 aria2c 失败: {}", e))?;

    {
        let mut lock = aria2_process_lock().lock().unwrap();
        *lock = Some(child);
    }

    // Wait for RPC readiness (up to 8 seconds)
    for _ in 0..40 {
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        if is_available() {
            return Ok(());
        }
    }

    Err("aria2c 启动后 RPC 连接超时".to_string())
}

/// Kill the managed aria2 process (called on app exit).
pub fn shutdown() {
    let mut lock = match aria2_process_lock().lock() {
        Ok(l) => l,
        Err(_) => return,
    };
    if let Some(mut child) = lock.take() {
        let _ = child.start_kill();
    }
}
