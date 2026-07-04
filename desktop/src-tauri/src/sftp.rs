use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use once_cell::sync::Lazy;
use russh::client::{self, Handle};
use russh::keys::{load_secret_key, PrivateKeyWithHashAlg};
use russh::ChannelId;
use russh_sftp::client::SftpSession;
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProfile {
    pub id: String,
    pub label: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
    pub save_credential: bool,
}

pub struct SftpConnection {
    pub handle: Handle<ClientHandler>,
    pub sftp: SftpSession,
}

pub struct ClientHandler;

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }

    async fn data(
        &mut self,
        _channel: ChannelId,
        _data: &[u8],
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        Ok(())
    }
}

static POOL: Lazy<tokio::sync::Mutex<HashMap<String, Arc<tokio::sync::Mutex<SftpConnection>>>>> =
    Lazy::new(|| tokio::sync::Mutex::new(HashMap::new()));

fn trimmed_profile_parts(profile: &ConnectionProfile) -> (String, String) {
    (profile.username.trim().to_string(), profile.host.trim().to_string())
}

pub fn connection_key(profile: &ConnectionProfile) -> String {
    let (username, host) = trimmed_profile_parts(profile);
    format!("{}@{}:{}", username, host, profile.port)
}

pub async fn connect(profile: &ConnectionProfile) -> Result<Arc<tokio::sync::Mutex<SftpConnection>>, String> {
    let key = connection_key(profile);
    let mut pool = POOL.lock().await;
    if let Some(entry) = pool.get(&key) {
        return Ok(entry.clone());
    }

    let connection = do_connect(profile).await?;
    let entry = Arc::new(tokio::sync::Mutex::new(connection));
    pool.insert(key, entry.clone());
    Ok(entry)
}

async fn do_connect(profile: &ConnectionProfile) -> Result<SftpConnection, String> {
    let (username, host) = trimmed_profile_parts(profile);
    if host.is_empty() {
        return Err("缺少 SSH 主机".to_string());
    }
    if username.is_empty() {
        return Err("缺少 SSH 用户名".to_string());
    }

    let config = Arc::new(client::Config::default());
    let handler = ClientHandler;
    let mut handle = client::connect(config, (host, profile.port), handler)
        .await
        .map_err(|e| format!("连接 SSH 失败: {}", e))?;

    authenticate(&mut handle, profile).await?;

    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| format!("打开 SSH 会话通道失败: {}", e))?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|e| format!("启动 SFTP 子系统失败: {}", e))?;

    let sftp = SftpSession::new(channel.into_stream())
        .await
        .map_err(|e| format!("初始化 SFTP 会话失败: {}", e))?;

    Ok(SftpConnection { handle, sftp })
}

async fn authenticate(handle: &mut Handle<ClientHandler>, profile: &ConnectionProfile) -> Result<(), String> {
    let username = profile.username.trim();
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
        return Ok(());
    }

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
    Ok(())
}
