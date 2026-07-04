#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, UNIX_EPOCH};
use chrono::{DateTime, Utc};

#[cfg(windows)]
mod windows_virtual_drag;

mod sftp;
mod ssh_exec;
mod tunnel;
mod remote_serve;
mod aria2_rpc;
mod download;

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

#[tauri::command]
async fn start_ssh_download_task(
    profile: ConnectionProfile,
    remote_path: String,
    local_dir: String,
    recursive: bool,
    name: String,
    size: Option<u64>,
) -> Result<String, String> {
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
    tokio::spawn(async move {
        let result = if recursive {
            sftp_download_folder_recursive(&profile, &remote_path, Path::new(&local_dir)).await
        } else {
            let file_name = Path::new(&remote_path)
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "download".to_string());
            let local_path = Path::new(&local_dir).join(safe_local_file_name(&file_name));
            sftp_copy_to_local(&profile, &remote_path, &local_path).await
        };
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
    // Try aria2 RPC first
    let task_keys = ["gid", "status", "totalLength", "completedLength", "downloadSpeed", "errorMessage"];
    if aria2_rpc::is_available() {
        let active = aria2_rpc::tell_active(&task_keys).unwrap_or_default();
        let waiting = aria2_rpc::tell_waiting(0, 50, &task_keys).unwrap_or_default();
        let stopped = aria2_rpc::tell_stopped(0, 50, &task_keys).unwrap_or_default();

        let to_task = |v: &serde_json::Value| TransferTask {
            gid: v["gid"].as_str().unwrap_or("").to_string(),
            status: v["status"].as_str().unwrap_or("unknown").to_string(),
            total_length: v["totalLength"].as_str().map(|s| s.to_string()),
            completed_length: v["completedLength"].as_str().map(|s| s.to_string()),
            download_speed: v["downloadSpeed"].as_str().map(|s| s.to_string()),
            error_message: v["errorMessage"].as_str().filter(|s| !s.is_empty()).map(|s| s.to_string()),
        };

        let mut global_stat = std::collections::HashMap::new();
        if let Ok(stat) = aria2_rpc::get_global_stat() {
            if let Some(obj) = stat.as_object() {
                for (k, v) in obj {
                    if let Some(s) = v.as_str() {
                        global_stat.insert(k.clone(), s.to_string());
                    }
                }
            }
        }

        // Merge with in-memory SFTP tasks
        let sftp_tasks = queue().lock().map_err(|err| err.to_string())?.clone();

        let mut all_active: Vec<TransferTask> = active.iter().map(to_task).collect();
        all_active.extend(sftp_tasks.iter().filter(|t| t.status == "active").cloned());

        let all_waiting: Vec<TransferTask> = waiting.iter().map(to_task).collect();

        let mut all_stopped: Vec<TransferTask> = stopped.iter().map(to_task).collect();
        all_stopped.extend(sftp_tasks.into_iter().filter(|t| t.status != "active"));

        return Ok(TransferQueueResponse {
            global_stat,
            active: all_active,
            waiting: all_waiting,
            stopped: all_stopped,
        });
    }

    // Fallback: in-memory queue only
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
    // aria2 gids are hex strings (typically 16 chars)
    let is_aria2_gid = gid.chars().all(|c| c.is_ascii_hexdigit()) && gid.len() >= 8;

    if is_aria2_gid && aria2_rpc::is_available() {
        match action.as_str() {
            "pause" => aria2_rpc::pause(&gid),
            "unpause" => aria2_rpc::unpause(&gid),
            "remove" | "purge" => {
                let _ = aria2_rpc::remove(&gid);
                aria2_rpc::remove_download_result(&gid)
            }
            _ => Err("不支持的队列操作".to_string()),
        }
    } else {
        let mut tasks = queue().lock().map_err(|err| err.to_string())?;
        match action.as_str() {
            "remove" | "purge" => tasks.retain(|task| task.gid != gid),
            "pause" | "unpause" => {}
            _ => return Err("不支持的队列操作".to_string()),
        }
        Ok(())
    }
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

async fn sftp_download_folder_recursive(
    profile: &ConnectionProfile,
    remote_path: &str,
    local_dir: &Path,
) -> Result<(), String> {
    let conn = sftp::connect(profile).await?;

    let folder_name = Path::new(remote_path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "download".to_string());
    let safe_name = safe_local_file_name(&folder_name);
    let target_dir = local_dir.join(&safe_name);
    tokio::fs::create_dir_all(&target_dir)
        .await
        .map_err(|e| format!("创建本地目录失败: {}", e))?;

    sftp_download_recursive_inner(&conn, remote_path, &target_dir).await
}

async fn sftp_download_recursive_inner(
    conn: &std::sync::Arc<tokio::sync::Mutex<sftp::SftpConnection>>,
    remote_dir: &str,
    local_dir: &Path,
) -> Result<(), String> {
    let guard = conn.lock().await;
    let entries = guard
        .sftp
        .read_dir(remote_dir)
        .await
        .map_err(|e| format!("读取远程目录 {} 失败: {}", remote_dir, e))?;
    drop(guard);

    for entry in entries {
        let name = entry.file_name();
        if name == "." || name == ".." {
            continue;
        }
        let remote_child = format!("{}/{}", remote_dir, name);
        let safe_name = safe_local_file_name(&name);
        let local_child = local_dir.join(&safe_name);

        if entry.metadata().is_dir() {
            tokio::fs::create_dir_all(&local_child)
                .await
                .map_err(|e| format!("创建本地目录失败: {}", e))?;
            Box::pin(sftp_download_recursive_inner(conn, &remote_child, &local_child)).await?;
        } else {
            let guard = conn.lock().await;
            let mut remote_file = guard
                .sftp
                .open(&remote_child)
                .await
                .map_err(|e| format!("打开远程文件 {} 失败: {}", remote_child, e))?;
            let mut local_file = tokio::fs::File::create(&local_child)
                .await
                .map_err(|e| format!("创建本地文件 {} 失败: {}", local_child.display(), e))?;
            tokio::io::copy(&mut remote_file, &mut local_file)
                .await
                .map_err(|e| format!("下载文件 {} 失败: {}", remote_child, e))?;
        }
    }
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
async fn download_ssh_folder(profile: ConnectionProfile, remote_path: String, local_dir: String) -> Result<String, String> {
    sftp_download_folder_recursive(&profile, &remote_path, Path::new(&local_dir)).await?;
    let folder_name = Path::new(&remote_path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "download".to_string());
    Ok(Path::new(&local_dir).join(safe_local_file_name(&folder_name)).to_string_lossy().to_string())
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

// ---------------------------------------------------------------------------
// aria2 download commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn start_ssh_aria2_download(
    profile: ConnectionProfile,
    remote_path: String,
    local_dir: String,
    name: String,
    is_dir: bool,
) -> Result<Vec<String>, String> {
    if is_dir {
        let gids = download::download_folder_via_aria2(&profile, &remote_path, &local_dir).await;
        match gids {
            Ok(gids) => Ok(gids),
            Err(aria_err) => {
                // Fallback to SFTP
                let id = TRANSFER_COUNTER.fetch_add(1, Ordering::Relaxed);
                let gid = format!("ssh-{}-{}", id, safe_task_name(&name));
                let task = TransferTask {
                    gid: gid.clone(),
                    status: "active".to_string(),
                    total_length: None,
                    completed_length: Some("0".to_string()),
                    download_speed: Some("0".to_string()),
                    error_message: Some(format!("aria2 不可用，使用 SFTP 降级: {}", aria_err)),
                };
                queue().lock().map_err(|err| err.to_string())?.push(task);
                let task_gid = gid.clone();
                tokio::spawn(async move {
                    let result = sftp_download_folder_recursive(
                        &profile,
                        &remote_path,
                        Path::new(&local_dir),
                    )
                    .await;
                    if let Ok(mut tasks) = queue().lock() {
                        if let Some(task) = tasks.iter_mut().find(|t| t.gid == task_gid) {
                            match result {
                                Ok(_) => {
                                    task.status = "complete".to_string();
                                    task.completed_length = Some("1".to_string());
                                }
                                Err(error) => {
                                    task.status = "error".to_string();
                                    task.error_message = Some(error);
                                }
                            }
                        }
                    }
                });
                Ok(vec![gid])
            }
        }
    } else {
        let gid = download::download_file_via_aria2(&profile, &remote_path, &local_dir).await;
        match gid {
            Ok(gid) => Ok(vec![gid]),
            Err(aria_err) => {
                // Fallback to SFTP single file
                let id = TRANSFER_COUNTER.fetch_add(1, Ordering::Relaxed);
                let task_gid = format!("ssh-{}-{}", id, safe_task_name(&name));
                let task = TransferTask {
                    gid: task_gid.clone(),
                    status: "active".to_string(),
                    total_length: None,
                    completed_length: Some("0".to_string()),
                    download_speed: Some("0".to_string()),
                    error_message: Some(format!("aria2 不可用，使用 SFTP 降级: {}", aria_err)),
                };
                queue().lock().map_err(|err| err.to_string())?.push(task);
                let clone_gid = task_gid.clone();
                tokio::spawn(async move {
                    let file_name = Path::new(&remote_path)
                        .file_name()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_else(|| "download".to_string());
                    let local_path = Path::new(&local_dir).join(safe_local_file_name(&file_name));
                    let result = sftp_copy_to_local(&profile, &remote_path, &local_path).await;
                    if let Ok(mut tasks) = queue().lock() {
                        if let Some(task) = tasks.iter_mut().find(|t| t.gid == clone_gid) {
                            match result {
                                Ok(_) => {
                                    task.status = "complete".to_string();
                                    task.completed_length = Some("1".to_string());
                                }
                                Err(error) => {
                                    task.status = "error".to_string();
                                    task.error_message = Some(error);
                                }
                            }
                        }
                    }
                });
                Ok(vec![task_gid])
            }
        }
    }
}

#[tauri::command]
fn get_aria2_config() -> aria2_rpc::Aria2Config {
    aria2_rpc::load_config()
}

#[tauri::command]
fn save_aria2_config(config: aria2_rpc::Aria2Config) -> Result<(), String> {
    aria2_rpc::save_config(&config)
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
            start_ssh_aria2_download,
            get_aria2_config,
            save_aria2_config,
            list_transfer_tasks,
            control_transfer_task,
            prepare_ssh_virtual_file,
            start_virtual_file_drag
        ])
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                aria2_rpc::shutdown();
                tunnel::shutdown_all();
                remote_serve::shutdown_all();
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run LAN Transfer desktop app");
}
