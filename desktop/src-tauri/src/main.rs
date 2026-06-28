use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[cfg(windows)]
mod windows_virtual_drag;

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionProfile {
    id: String,
    label: String,
    backend_url: String,
    username: String,
    password: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UploadEntry {
    source_path: String,
    relative_path: String,
    is_dir: bool,
}

#[tauri::command]
fn list_connection_profiles() -> Vec<ConnectionProfile> {
    let (username, password) = read_saved_rclone_credentials();
    vec![
        ConnectionProfile {
            id: "server-10-42-0-1".to_string(),
            label: "本机面板 + 服务器 10.42.0.1".to_string(),
            backend_url: "http://localhost:5590".to_string(),
            username: username.clone(),
            password: password.clone(),
        },
        ConnectionProfile {
            id: "local-dev".to_string(),
            label: "本机开发 127.0.0.1".to_string(),
            backend_url: "http://localhost:5590".to_string(),
            username,
            password,
        },
        ConnectionProfile {
            id: "custom".to_string(),
            label: "自定义连接".to_string(),
            backend_url: String::new(),
            username: String::new(),
            password: String::new(),
        },
    ]
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

fn read_saved_rclone_credentials() -> (String, String) {
    let Some(home) = user_home_dir() else {
        return (String::new(), String::new());
    };
    let path = home
        .join(".config")
        .join("file-transfer")
        .join("rclone-rc.credentials");
    let Ok(text) = fs::read_to_string(path) else {
        return (String::new(), String::new());
    };
    (
        read_key_value(&text, "username"),
        read_key_value(&text, "password"),
    )
}

fn read_key_value(text: &str, key: &str) -> String {
    for raw_line in text.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((left, right)) = line.split_once('=') else {
            continue;
        };
        if left.trim() == key {
            return right.trim().to_string();
        }
    }
    String::new()
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
fn select_download_directory() -> Option<String> {
    rfd::FileDialog::new()
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string())
}

#[cfg(windows)]
#[tauri::command]
fn start_virtual_download_drag(name: String, remote_path: String, download_url: String, size: Option<u64>) -> Result<(), String> {
    windows_virtual_drag::start_virtual_download_drag(name, remote_path, download_url, size)
}

#[cfg(not(windows))]
#[tauri::command]
fn start_virtual_download_drag(
    _name: String,
    _remote_path: String,
    _download_url: String,
    _size: Option<u64>,
) -> Result<(), String> {
    Err("virtual drag is only available on Windows".to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_connection_profiles,
            list_local_roots,
            list_local_directory,
            collect_upload_entries,
            select_download_directory,
            start_virtual_download_drag
        ])
        .run(tauri::generate_context!())
        .expect("failed to run LAN Transfer desktop app");
}
