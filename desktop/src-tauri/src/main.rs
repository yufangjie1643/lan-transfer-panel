#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, UNIX_EPOCH};
use chrono::{DateTime, Utc};

#[cfg(windows)]
mod windows_virtual_drag;

mod sftp;

use sftp::ConnectionProfile;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalItem {
    path: String,
    name: String,
    is_dir: bool,
    size: Option<u64>,
    modified: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalRoot {
    path: String,
    name: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "PascalCase")]
struct RemoteItem {
    path: String,
    name: String,
    size: Option<u64>,
    is_dir: bool,
    mod_time: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SshDirectoryListing {
    path: String,
    list: Vec<RemoteItem>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TransferQueueResponse {
    global_stat: std::collections::HashMap<String, String>,
    active: Vec<TransferTask>,
    waiting: Vec<TransferTask>,
    stopped: Vec<TransferTask>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TransferTask {
    gid: String,
    status: String,
    total_length: Option<String>,
    completed_length: Option<String>,
    download_speed: Option<String>,
    error_message: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct UploadEntry {
    source_path: String,
    relative_path: String,
    is_dir: bool,
}

static TRANSFER_QUEUE: OnceLock<Mutex<Vec<TransferTask>>> = OnceLock::new();
static TRANSFER_COUNTER: AtomicU64 = AtomicU64::new(1);

#[tauri::command]
fn list_connection_profiles() -> Vec<ConnectionProfile> {
    read_connection_profiles()
}

#[tauri::command]
fn save_connection_profile(profile: ConnectionProfile) -> Result<Vec<ConnectionProfile>, String> {
    let mut profiles = read_connection_profiles();
    let clean = profile.for_storage();
    if let Some(existing) = profiles.iter_mut().find(|item| item.id == clean.id) {
        *existing = clean;
    } else {
        profiles.push(clean);
    }
    write_connection_profiles(&profiles)?;
    Ok(profiles)
}

#[tauri::command]
fn delete_connection_profile(id: String) -> Result<Vec<ConnectionProfile>, String> {
    let mut profiles = read_connection_profiles();
    profiles.retain(|profile| profile.id != id || profile.id == "server-10-42-0-1");
    write_connection_profiles(&profiles)?;
    Ok(profiles)
}

#[tauri::command]
async fn test_ssh_connection(profile: ConnectionProfile) -> Result<String, String> {
    let conn = sftp::connect(&profile).await?;
    let guard = conn.lock().await;
    let cwd = guard
        .sftp
        .canonicalize(".")
        .await
        .map_err(|e| format!("获取远程目录失败: {}", e))?;
    Ok(cwd)
}

#[tauri::command]
async fn list_ssh_directory(
    profile: ConnectionProfile,
    path: String,
) -> Result<SshDirectoryListing, String> {
    let target = if path.trim().is_empty() {
        format!("/home/{}", profile.username)
    } else {
        path.trim().to_string()
    };

    let conn = sftp::connect(&profile).await?;
    let guard = conn.lock().await;
    let entries = guard
        .sftp
        .read_dir(&target)
        .await
        .map_err(|e| format!("读取目录失败: {}", e))?;

    let mut list = Vec::new();
    for entry in entries {
        let meta = entry.metadata();
        let name = entry.file_name();
        if name == "." || name == ".." {
            continue;
        }
        let full_path = entry.path();
        let mod_time = meta.mtime.map(|t| {
            let system_time = UNIX_EPOCH + Duration::from_secs(t as u64);
            DateTime::<Utc>::from(system_time).to_rfc3339()
        });
        list.push(RemoteItem {
            path: full_path,
            name,
            size: if meta.is_dir() { None } else { Some(meta.len()) },
            is_dir: meta.is_dir(),
            mod_time,
        });
    }

    list.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(SshDirectoryListing { path: target, list })
}

#[tauri::command]
fn list_local_roots() -> Vec<LocalRoot> {
    let mut roots = Vec::new();

    if let Some(home) = user_home_dir() {
        push_root(&mut roots, home.clone(), "Home");
        push_root(&mut roots, home.join("Desktop"), "Desktop");
        push_root(&mut roots, home.join("Downloads"), "Downloads");
    }

    #[cfg(target_os = "windows")]
    {
        for letter in b'A'..=b'Z' {
            let name = format!("{}:", letter as char);
            push_root(&mut roots, PathBuf::from(format!("{}\\", name)), &name);
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        push_root(&mut roots, PathBuf::from("/"), "/");
    }

    roots
}

#[tauri::command]
fn list_local_directory(path: String) -> Result<Vec<LocalItem>, String> {
    let dir = PathBuf::from(path);
    let entries = fs::read_dir(&dir).map_err(|err| err.to_string())?;
    let mut items = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|err| err.to_string())?;
        let metadata = entry.metadata().map_err(|err| err.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        items.push(LocalItem {
            path: entry.path().to_string_lossy().to_string(),
            name,
            is_dir: metadata.is_dir(),
            size: if metadata.is_file() {
                Some(metadata.len())
            } else {
                None
            },
            modified: metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|duration| duration.as_secs()),
        });
    }

    items.sort_by(|left, right| {
        right
            .is_dir
            .cmp(&left.is_dir)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(items)
}

fn user_home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

fn read_connection_profiles() -> Vec<ConnectionProfile> {
    let mut profiles = default_connection_profiles();
    let Some(path) = profile_store_path() else {
        return profiles;
    };
    let Ok(text) = fs::read_to_string(path) else {
        return profiles;
    };
    let Ok(saved) = serde_json::from_str::<Vec<ConnectionProfile>>(&text) else {
        return profiles;
    };

    for profile in saved {
        if let Some(existing) = profiles.iter_mut().find(|item| item.id == profile.id) {
            *existing = profile;
        } else {
            profiles.push(profile);
        }
    }
    profiles
}

fn write_connection_profiles(profiles: &[ConnectionProfile]) -> Result<(), String> {
    let path = profile_store_path().ok_or_else(|| "无法定位用户配置目录".to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let text = serde_json::to_string_pretty(profiles).map_err(|err| err.to_string())?;
    fs::write(path, text).map_err(|err| err.to_string())
}

fn profile_store_path() -> Option<PathBuf> {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| user_home_dir().map(|home| home.join(".config")))
        .map(|base| base.join("LAN Transfer").join("ssh-profiles.json"))
}

fn default_connection_profiles() -> Vec<ConnectionProfile> {
    vec![
        ConnectionProfile {
            id: "server-10-42-0-1".to_string(),
            label: "yufanssh".to_string(),
            host: "10.42.0.1".to_string(),
            port: 2687,
            username: "yufan".to_string(),
            auth_method: "key".to_string(),
            password: None,
            private_key_path: Some(r"C:\Users\admin\.ssh\id_ed25519_local".to_string()),
            passphrase: None,
            save_credential: false,
        },
        ConnectionProfile {
            id: "custom".to_string(),
            label: "自定义连接".to_string(),
            host: String::new(),
            port: 22,
            username: String::new(),
            auth_method: "password".to_string(),
            password: None,
            private_key_path: None,
            passphrase: None,
            save_credential: false,
        },
    ]
}

impl ConnectionProfile {
    fn for_storage(mut self) -> Self {
        self.id = sanitize_profile_id(&self.id, &self.host);
        self.label = if self.label.trim().is_empty() {
            self.host.clone()
        } else {
            self.label.trim().to_string()
        };
        self.host = self.host.trim().to_string();
        self.username = self.username.trim().to_string();
        self.auth_method = if self.auth_method == "key" {
            "key".to_string()
        } else {
            "password".to_string()
        };
        if !self.save_credential {
            self.password = None;
            self.passphrase = None;
        }
        self
    }
}

fn sanitize_profile_id(id: &str, host: &str) -> String {
    let raw = if id.trim().is_empty() || id == "custom" {
        format!("ssh-{}", host)
    } else {
        id.to_string()
    };
    raw.chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn push_root(roots: &mut Vec<LocalRoot>, path: PathBuf, name: &str) {
    if !path.exists() {
        return;
    }

    let path_string = path.to_string_lossy().to_string();
    let already_added = roots
        .iter()
        .any(|root| root.path.eq_ignore_ascii_case(&path_string));
    if already_added {
        return;
    }

    roots.push(LocalRoot {
        path: path_string,
        name: name.to_string(),
    });
}

#[tauri::command]
fn collect_upload_entries(paths: Vec<String>) -> Result<Vec<UploadEntry>, String> {
    let mut entries = Vec::new();
    for path in paths {
        let root = PathBuf::from(&path);
        let base = root.parent().unwrap_or_else(|| Path::new(""));
        collect_upload_entry(&root, base, &mut entries)?;
    }
    Ok(entries)
}

fn collect_upload_entry(
    path: &Path,
    base: &Path,
    entries: &mut Vec<UploadEntry>,
) -> Result<(), String> {
    let metadata = fs::metadata(path).map_err(|err| err.to_string())?;
    let relative_path = path
        .strip_prefix(base)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/");

    entries.push(UploadEntry {
        source_path: path.to_string_lossy().to_string(),
        relative_path,
        is_dir: metadata.is_dir(),
    });

    if metadata.is_dir() {
        for child in fs::read_dir(path).map_err(|err| err.to_string())? {
            let child = child.map_err(|err| err.to_string())?;
            collect_upload_entry(&child.path(), base, entries)?;
        }
    }

    Ok(())
}

#[tauri::command]
async fn select_upload_files() -> Result<Option<Vec<String>>, String> {
    match rfd::AsyncFileDialog::new().pick_files().await {
        Some(files) => Ok(Some(
            files
                .into_iter()
                .map(|file| file.path().to_string_lossy().to_string())
                .collect(),
        )),
        None => Ok(None),
    }
}

async fn sftp_copy_from_local(
    connection: &sftp::SftpConnection,
    local_path: &std::path::Path,
    remote_path: &str,
) -> Result<(), String> {
    let mut local = tokio::fs::File::open(local_path)
        .await
        .map_err(|e| format!("打开本地文件失败: {}", e))?;
    let mut remote = connection
        .sftp
        .create(remote_path)
        .await
        .map_err(|e| format!("创建远程文件失败: {}", e))?;
    tokio::io::copy(&mut local, &mut remote)
        .await
        .map_err(|e| format!("上传文件失败: {}", e))?;
    Ok(())
}

async fn sftp_ensure_dir(connection: &sftp::SftpConnection, remote_path: &str) -> Result<(), String> {
    use russh_sftp::protocol::StatusCode;
    let meta_err = match connection.sftp.metadata(remote_path).await {
        Ok(meta) if meta.is_dir() => return Ok(()),
        Ok(_) => return Err(format!("路径已存在但不是目录: {}", remote_path)),
        Err(e) => e,
    };

    if let russh_sftp::client::error::Error::Status(status) = &meta_err {
        if status.status_code != StatusCode::NoSuchFile {
            // 元数据错误不是明确的“不存在”；仍尝试创建目录，
            // 若创建失败则在错误中保留原始错误信息。
        }
    }

    connection
        .sftp
        .create_dir(remote_path)
        .await
        .map_err(|e| format!("创建远程目录失败: {} (原始错误: {})", e, meta_err))
}

fn validate_upload_relative_path(path: &str) -> Result<(), String> {
    if path.is_empty() {
        return Err("上传条目相对路径不能为空".to_string());
    }
    if path.starts_with('/') || path.contains('\\') || path.contains(':') {
        return Err(format!("上传条目相对路径不能为绝对路径: {}", path));
    }
    for segment in path.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return Err(format!("上传条目相对路径包含非法段: {}", path));
        }
    }
    Ok(())
}

#[tauri::command]
async fn upload_ssh_entries(
    profile: ConnectionProfile,
    remote_dir: String,
    entries: Vec<UploadEntry>,
) -> Result<Vec<String>, String> {
    for entry in &entries {
        validate_upload_relative_path(&entry.relative_path)?;
    }

    let conn = sftp::connect(&profile).await?;
    let guard = conn.lock().await;
    let mut uploaded = Vec::new();
    for entry in entries {
        let remote_path = if remote_dir.ends_with('/') {
            format!("{}{}", remote_dir, entry.relative_path)
        } else {
            format!("{}/{}", remote_dir, entry.relative_path)
        };
        if entry.is_dir {
            sftp_ensure_dir(&*guard, &remote_path).await?;
        } else {
            sftp_copy_from_local(&*guard, std::path::Path::new(&entry.source_path), &remote_path).await?;
        }
        uploaded.push(remote_path);
    }
    Ok(uploaded)
}

#[tauri::command]
fn select_download_directory() -> Option<String> {
    rfd::FileDialog::new()
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string())
}

fn run_scp_download(
    profile: ConnectionProfile,
    remote_path: String,
    local_dir: String,
    recursive: bool,
) -> Result<String, String> {
    run_scp_download_to_target(profile, remote_path, local_dir, recursive)
}

fn run_scp_download_to_target(
    profile: ConnectionProfile,
    remote_path: String,
    local_target: String,
    recursive: bool,
) -> Result<String, String> {
    if profile.auth_method != "key" {
        return Err("当前桌面端文件夹下载先支持 SSH 密钥认证。".to_string());
    }
    let host = profile.host.trim();
    let username = profile.username.trim();
    if host.is_empty() || username.is_empty() || remote_path.trim().is_empty() {
        return Err("缺少 SSH 主机、用户名或远程文件路径".to_string());
    }

    let control_dir = std::env::temp_dir().join("lan-transfer-ssh-control");
    let _ = fs::create_dir_all(&control_dir);
    let control_path = control_dir.join("%r@%h:%p");

    let mut command = Command::new("scp");
    if recursive {
        command.arg("-r");
    }
    command
        .arg("-P")
        .arg(profile.port.to_string())
        .arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg("ConnectTimeout=8")
        .arg("-o")
        .arg("ControlMaster=auto")
        .arg("-o")
        .arg(format!("ControlPath={}", control_path.to_string_lossy()))
        .arg("-o")
        .arg("ControlPersist=60");

    if let Some(identity) = profile.private_key_path.as_ref().filter(|value| !value.trim().is_empty()) {
        command.arg("-i").arg(identity);
    }

    command
        .arg(format!("{}@{}:{}", username, host, remote_path))
        .arg(&local_target);

    #[cfg(windows)]
    command.creation_flags(0x08000000);

    let output = command.output().map_err(|err| format!("启动 scp 失败: {}", err))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if detail.is_empty() {
            format!("SCP 下载失败，退出码 {:?}", output.status.code())
        } else {
            detail
        });
    }
    Ok(local_target)
}

#[tauri::command]
fn start_ssh_download_task(
    profile: ConnectionProfile,
    remote_path: String,
    local_dir: String,
    recursive: bool,
    name: String,
    size: Option<u64>,
) -> Result<String, String> {
    if profile.auth_method != "key" {
        return Err("当前桌面端文件夹下载先支持 SSH 密钥认证。".to_string());
    }
    let id = TRANSFER_COUNTER.fetch_add(1, Ordering::Relaxed);
    let gid = format!("ssh-{}-{}", id, safe_task_name(&name));
    let task = TransferTask {
        gid: gid.clone(),
        status: "active".to_string(),
        total_length: size.map(|value| value.to_string()),
        completed_length: Some("0".to_string()),
        download_speed: Some("0".to_string()),
        error_message: None,
    };
    queue().lock().map_err(|err| err.to_string())?.push(task);
    let task_gid = gid.clone();
    std::thread::spawn(move || {
        let result = run_scp_download(profile, remote_path, local_dir, recursive);
        if let Ok(mut tasks) = queue().lock() {
            if let Some(task) = tasks.iter_mut().find(|task| task.gid == task_gid) {
                match result {
                    Ok(_) => {
                        task.status = "complete".to_string();
                        task.completed_length = task.total_length.clone().or_else(|| Some("1".to_string()));
                    }
                    Err(error) => {
                        task.status = "error".to_string();
                        task.error_message = Some(error);
                    }
                }
            }
        }
    });
    Ok(gid)
}

#[tauri::command]
fn list_transfer_tasks() -> Result<TransferQueueResponse, String> {
    let tasks = queue().lock().map_err(|err| err.to_string())?.clone();
    Ok(TransferQueueResponse {
        global_stat: std::collections::HashMap::new(),
        active: tasks.iter().filter(|task| task.status == "active").cloned().collect(),
        waiting: Vec::new(),
        stopped: tasks
            .into_iter()
            .filter(|task| task.status != "active")
            .collect(),
    })
}

#[tauri::command]
fn control_transfer_task(gid: String, action: String) -> Result<(), String> {
    let mut tasks = queue().lock().map_err(|err| err.to_string())?;
    match action.as_str() {
        "remove" | "purge" => tasks.retain(|task| task.gid != gid),
        "pause" | "unpause" => {}
        _ => return Err("不支持的队列操作".to_string()),
    }
    Ok(())
}

fn queue() -> &'static Mutex<Vec<TransferTask>> {
    TRANSFER_QUEUE.get_or_init(|| Mutex::new(Vec::new()))
}

fn safe_task_name(value: &str) -> String {
    let cleaned = safe_local_file_name(value)
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' { ch } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    if cleaned.is_empty() {
        "download".to_string()
    } else {
        cleaned
    }
}

async fn sftp_copy_to_local(
    profile: &ConnectionProfile,
    remote_path: &str,
    local_path: &std::path::Path,
) -> Result<(), String> {
    let conn = sftp::connect(profile).await?;
    let guard = conn.lock().await;
    let meta = guard
        .sftp
        .metadata(remote_path)
        .await
        .map_err(|e| format!("获取远程文件信息失败: {}", e))?;
    if meta.is_dir() {
        return Err("远程路径是目录，请使用文件夹下载".to_string());
    }
    let mut remote = guard
        .sftp
        .open(remote_path)
        .await
        .map_err(|e| format!("打开远程文件失败: {}", e))?;
    let mut local = tokio::fs::File::create(local_path)
        .await
        .map_err(|e| format!("创建本地文件失败: {}", e))?;
    tokio::io::copy(&mut remote, &mut local)
        .await
        .map_err(|e| format!("下载文件失败: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn download_ssh_file(
    profile: ConnectionProfile,
    remote_path: String,
    local_dir: String,
) -> Result<String, String> {
    let name = std::path::Path::new(&remote_path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "download".to_string());
    let local_path = std::path::Path::new(&local_dir).join(safe_local_file_name(&name));
    sftp_copy_to_local(&profile, &remote_path, &local_path).await?;
    Ok(local_path.to_string_lossy().to_string())
}

#[tauri::command]
fn download_ssh_folder(profile: ConnectionProfile, remote_path: String, local_dir: String) -> Result<String, String> {
    run_scp_download(profile, remote_path, local_dir, true)
}

#[tauri::command]
async fn prepare_ssh_virtual_file(
    profile: ConnectionProfile,
    remote_path: String,
    name: String,
) -> Result<String, String> {
    let staging_dir = std::env::temp_dir()
        .join("lan-transfer-virtual-drag")
        .join(format!("{}", std::process::id()));
    tokio::fs::create_dir_all(&staging_dir)
        .await
        .map_err(|err| format!("创建虚拟拖拽临时目录失败: {}", err))?;
    let local_path = staging_dir.join(safe_local_file_name(&name));
    sftp_copy_to_local(&profile, &remote_path, &local_path).await?;
    Ok(local_path.to_string_lossy().to_string())
}

#[cfg(windows)]
#[tauri::command]
fn start_virtual_file_drag(name: String, remote_path: String, local_path: String, size: Option<u64>) -> Result<(), String> {
    windows_virtual_drag::start_virtual_file_drag(name, remote_path, local_path, size)
}

#[cfg(not(windows))]
#[tauri::command]
fn start_virtual_file_drag(
    _name: String,
    _remote_path: String,
    _local_path: String,
    _size: Option<u64>,
) -> Result<(), String> {
    Err("virtual drag is only available on Windows".to_string())
}

fn safe_local_file_name(value: &str) -> String {
    let cleaned = value
        .chars()
        .map(|ch| match ch {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            ch if ch.is_control() => '_',
            ch => ch,
        })
        .collect::<String>()
        .trim()
        .to_string();
    if cleaned.is_empty() {
        "download.bin".to_string()
    } else {
        cleaned
    }
}

#[tauri::command]
fn open_devtools(window: tauri::WebviewWindow) {
    #[cfg(debug_assertions)]
    window.open_devtools();
    #[cfg(not(debug_assertions))]
    window.open_devtools();
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_devtools,
            list_connection_profiles,
            save_connection_profile,
            delete_connection_profile,
            test_ssh_connection,
            list_ssh_directory,
            list_local_roots,
            list_local_directory,
            collect_upload_entries,
            select_upload_files,
            upload_ssh_entries,
            select_download_directory,
            download_ssh_file,
            download_ssh_folder,
            start_ssh_download_task,
            list_transfer_tasks,
            control_transfer_task,
            prepare_ssh_virtual_file,
            start_virtual_file_drag
        ])
        .run(tauri::generate_context!())
        .expect("failed to run LAN Transfer desktop app");
}
