use std::sync::Arc;
use russh::client::Handle;
use crate::sftp::{self, ClientHandler, ConnectionProfile};

pub struct ExecOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<u32>,
}

/// Run a shell command on the remote machine through the SFTP pool's SSH handle.
/// Borrows the connection mutex for the duration of the command.
pub async fn ssh_exec(
    profile: &ConnectionProfile,
    command: &str,
) -> Result<ExecOutput, String> {
    let conn = sftp::connect(profile).await?;
    let guard = conn.lock().await;
    exec_on_handle(&guard.handle, command).await
}

/// Run a shell command using an already-locked SSH handle.
pub async fn exec_on_handle(
    handle: &Handle<ClientHandler>,
    command: &str,
) -> Result<ExecOutput, String> {
    let mut channel = handle
        .channel_open_session()
        .await
        .map_err(|e| format!("打开 exec 通道失败: {}", e))?;

    channel
        .exec(true, command)
        .await
        .map_err(|e| format!("执行远程命令失败: {}", e))?;

    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let mut exit_code: Option<u32> = None;

    while let Some(msg) = channel.wait().await {
        match msg {
            russh::ChannelMsg::Data { data } => {
                stdout.extend_from_slice(&data);
            }
            russh::ChannelMsg::ExtendedData { data, ext } if ext == 1 => {
                stderr.extend_from_slice(&data);
            }
            russh::ChannelMsg::ExitStatus { exit_status } => {
                exit_code = Some(exit_status);
            }
            russh::ChannelMsg::Close | russh::ChannelMsg::Eof => {
                break;
            }
            _ => {}
        }
    }

    Ok(ExecOutput {
        stdout: String::from_utf8_lossy(&stdout).to_string(),
        stderr: String::from_utf8_lossy(&stderr).to_string(),
        exit_code,
    })
}

/// Open a dedicated SSH connection (no SFTP subsystem) for tunneling.
pub async fn open_tunnel_connection(
    profile: &ConnectionProfile,
) -> Result<Arc<Handle<ClientHandler>>, String> {
    use russh::client;
    use russh::keys::{load_secret_key, PrivateKeyWithHashAlg};
    use std::path::Path;

    let host = profile.host.trim();
    let username = profile.username.trim();
    if host.is_empty() {
        return Err("缺少 SSH 主机".to_string());
    }
    if username.is_empty() {
        return Err("缺少 SSH 用户名".to_string());
    }

    let config = Arc::new(client::Config::default());
    let handler = ClientHandler::new(host, profile.port);
    let mut handle = client::connect(config, (host, profile.port), handler)
        .await
        .map_err(|e| format!("连接 SSH 失败: {}", e))?;

    // Authenticate
    if profile.auth_method == "password" {
        let password = profile
            .password
            .as_deref()
            .filter(|p| !p.trim().is_empty())
            .ok_or_else(|| "缺少 SSH 密码".to_string())?;
        let result = handle
            .authenticate_password(username, password)
            .await
            .map_err(|e| format!("密码认证失败: {}", e))?;
        if !result.success() {
            return Err("SSH 密码认证失败".to_string());
        }
    } else {
        let key_path = profile
            .private_key_path
            .as_deref()
            .filter(|p| !p.trim().is_empty())
            .ok_or_else(|| "缺少私钥路径".to_string())?;
        let passphrase = profile.passphrase.as_deref().filter(|p| !p.is_empty());
        let key = load_secret_key(Path::new(key_path), passphrase)
            .map_err(|e| format!("加载私钥失败: {}", e))?;
        let result = handle
            .authenticate_publickey(username, PrivateKeyWithHashAlg::new(Arc::new(key), None))
            .await
            .map_err(|e| format!("密钥认证失败: {}", e))?;
        if !result.success() {
            return Err("SSH 密钥认证失败".to_string());
        }
    }

    Ok(Arc::new(handle))
}
