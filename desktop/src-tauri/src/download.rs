use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};

use crate::aria2_rpc;
use crate::remote_serve;
use crate::sftp::ConnectionProfile;
use crate::tunnel;

/// Download a single remote file via the aria2 pipeline:
/// 1. Start HTTP server on the remote machine for the file's parent directory
/// 2. Create SSH tunnel to that HTTP server
/// 3. Submit the URL to local aria2 via JSON-RPC
///
/// Returns the aria2 gid.
pub async fn download_file_via_aria2(
    profile: &ConnectionProfile,
    remote_path: &str,
    local_dir: &str,
) -> Result<String, String> {
    // Ensure aria2 is running
    aria2_rpc::ensure_running().await?;

    // Get file info via SFTP
    let (parent_dir, file_name, _file_size) = stat_remote_file(profile, remote_path).await?;

    // Start remote HTTP server for the parent directory
    let served = remote_serve::ensure_served_directory(profile, &parent_dir).await?;

    // Create SSH tunnel to the remote HTTP server
    let local_port = tunnel::ensure_tunnel(profile, served.port).await?;

    // Build URL
    let encoded_name = utf8_percent_encode(&file_name, NON_ALPHANUMERIC).to_string();
    let url = format!("http://127.0.0.1:{}/{}", local_port, encoded_name);

    // Wait for HTTP source readiness
    wait_for_http_source(&url, 8000).await?;

    // Submit to aria2
    let options = aria2_rpc::build_options(local_dir, &file_name);
    let gid = aria2_rpc::add_uri(&[&url], &options)?;

    Ok(gid)
}

/// Download an entire remote folder via the aria2 pipeline:
/// 1. Start HTTP server on the remote machine for the folder
/// 2. Create SSH tunnel
/// 3. Walk the folder recursively via SFTP
/// 4. Submit each file to aria2 with proper relative output paths
///
/// Returns a list of aria2 gids.
pub async fn download_folder_via_aria2(
    profile: &ConnectionProfile,
    remote_path: &str,
    local_dir: &str,
) -> Result<Vec<String>, String> {
    // Ensure aria2 is running
    aria2_rpc::ensure_running().await?;

    // Get the folder name for output paths
    let folder_name = std::path::Path::new(remote_path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "download".to_string());

    // Create the local target directory
    let target_dir = std::path::Path::new(local_dir).join(&folder_name);
    tokio::fs::create_dir_all(&target_dir)
        .await
        .map_err(|e| format!("创建本地目录失败: {}", e))?;
    let target_dir_str = target_dir.to_string_lossy().to_string();

    // Start remote HTTP server for the folder itself
    let served = remote_serve::ensure_served_directory(profile, remote_path).await?;

    // Create SSH tunnel
    let local_port = tunnel::ensure_tunnel(profile, served.port).await?;
    let base_url = format!("http://127.0.0.1:{}", local_port);

    // Walk the folder recursively via SFTP to collect all files
    let files = list_remote_files_recursive(profile, remote_path, "").await?;

    if files.is_empty() {
        return Err("远程文件夹为空".to_string());
    }

    // Wait for the first file to be accessible
    if let Some(first) = files.first() {
        let encoded = utf8_percent_encode(&first.0, NON_ALPHANUMERIC).to_string();
        let test_url = format!("{}/{}", base_url, encoded);
        wait_for_http_source(&test_url, 8000).await?;
    }

    // Submit each file to aria2
    let mut gids = Vec::new();
    for (relative_path, _size) in &files {
        let encoded_path = encode_url_path(relative_path);
        let url = format!("{}/{}", base_url, encoded_path);

        // Output path preserves folder structure
        let out = relative_path.replace('/', std::path::MAIN_SEPARATOR_STR);

        let options = aria2_rpc::build_options(&target_dir_str, &out);
        match aria2_rpc::add_uri(&[&url], &options) {
            Ok(gid) => gids.push(gid),
            Err(e) => eprintln!("aria2 添加 {} 失败: {}", relative_path, e),
        }
    }

    if gids.is_empty() {
        return Err("没有文件成功提交到 aria2".to_string());
    }

    Ok(gids)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Stat a remote file via SFTP, returning (parent_dir, name, size).
async fn stat_remote_file(
    profile: &ConnectionProfile,
    remote_path: &str,
) -> Result<(String, String, u64), String> {
    let conn = crate::sftp::connect(profile).await?;
    let guard = conn.lock().await;

    let path = std::path::Path::new(remote_path);
    let file_name = path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .ok_or_else(|| "无法提取文件名".to_string())?;

    let parent_dir = path
        .parent()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "/".to_string());

    let metadata = guard
        .sftp
        .metadata(remote_path)
        .await
        .map_err(|e| format!("获取文件元数据失败: {}", e))?;

    let size = metadata.len();

    Ok((parent_dir, file_name, size))
}

/// Recursively list all files under a remote directory via SFTP.
/// Returns Vec<(relative_path, size)> where relative_path uses '/' separators.
async fn list_remote_files_recursive(
    profile: &ConnectionProfile,
    remote_dir: &str,
    prefix: &str,
) -> Result<Vec<(String, u64)>, String> {
    let conn = crate::sftp::connect(profile).await?;
    let mut results = Vec::new();
    list_recursive_inner(&conn, remote_dir, prefix, &mut results).await?;
    Ok(results)
}

async fn list_recursive_inner(
    conn: &std::sync::Arc<tokio::sync::Mutex<crate::sftp::SftpConnection>>,
    remote_dir: &str,
    prefix: &str,
    results: &mut Vec<(String, u64)>,
) -> Result<(), String> {
    let entries = {
        let guard = conn.lock().await;
        guard
            .sftp
            .read_dir(remote_dir)
            .await
            .map_err(|e| format!("读取远程目录 {} 失败: {}", remote_dir, e))?
    };

    for entry in entries {
        let name = entry.file_name();
        if name == "." || name == ".." {
            continue;
        }

        let remote_child = format!("{}/{}", remote_dir, name);
        let relative = if prefix.is_empty() {
            name.to_string()
        } else {
            format!("{}/{}", prefix, name)
        };

        if entry.metadata().is_dir() {
            Box::pin(list_recursive_inner(conn, &remote_child, &relative, results)).await?;
        } else {
            let size = entry.metadata().len();
            results.push((relative, size));
        }
    }

    Ok(())
}

/// Encode a file path for use in a URL (percent-encode each segment).
fn encode_url_path(path: &str) -> String {
    path.split('/')
        .map(|seg| utf8_percent_encode(seg, NON_ALPHANUMERIC).to_string())
        .collect::<Vec<_>>()
        .join("/")
}

/// Poll a URL with HEAD requests until it responds with 2xx, up to timeout_ms.
async fn wait_for_http_source(url: &str, timeout_ms: u64) -> Result<(), String> {
    let deadline =
        std::time::Instant::now() + std::time::Duration::from_millis(timeout_ms);

    while std::time::Instant::now() < deadline {
        let url_owned = url.to_string();
        let ok = tokio::task::spawn_blocking(move || -> bool {
            ureq::head(&url_owned).call().is_ok()
        })
        .await
        .unwrap_or(false);

        if ok {
            return Ok(());
        }

        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    Err(format!("HTTP 下载源在 {}ms 内未就绪: {}", timeout_ms, url))
}
