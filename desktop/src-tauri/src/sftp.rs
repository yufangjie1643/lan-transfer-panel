use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use once_cell::sync::Lazy;
use russh::client::{self, Handle};
use russh::keys::{check_known_hosts_path, load_secret_key, PrivateKeyWithHashAlg};
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
    /// 保持底层 SSH 会话存活；SFTP 子系统依赖此连接。
    #[allow(dead_code)]
    pub handle: Handle<ClientHandler>,
    pub sftp: SftpSession,
}

#[derive(Debug)]
pub enum ClientHandlerError {
    Russh(russh::Error),
    Verification(String),
}

impl From<russh::Error> for ClientHandlerError {
    fn from(error: russh::Error) -> Self {
        ClientHandlerError::Russh(error)
    }
}

impl std::fmt::Display for ClientHandlerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ClientHandlerError::Russh(e) => write!(f, "{}", e),
            ClientHandlerError::Verification(msg) => write!(f, "{}", msg),
        }
    }
}

impl std::error::Error for ClientHandlerError {}

pub struct ClientHandler {
    host: String,
    port: u16,
}

impl client::Handler for ClientHandler {
    type Error = ClientHandlerError;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh::keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        let known_hosts = known_hosts_path().map_err(|e| {
            ClientHandlerError::Verification(format!(
                "SSH 主机密钥验证失败: 无法定位 known_hosts 文件 ({e})"
            ))
        })?;
        match check_known_hosts_path(
            &self.host,
            self.port,
            server_public_key,
            &known_hosts,
        ) {
            Ok(true) => Ok(true),
            Ok(false) => Err(ClientHandlerError::Verification(format!(
                "SSH 主机密钥验证失败: {}:{} 的主机密钥未在 {} 中记录",
                self.host,
                self.port,
                known_hosts.display()
            ))),
            Err(e) => Err(ClientHandlerError::Verification(format!(
                "SSH 主机密钥验证失败: {} ({}:{})",
                e, self.host, self.port
            ))),
        }
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

fn known_hosts_path() -> Result<PathBuf, ClientHandlerError> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .ok_or_else(|| {
            ClientHandlerError::Verification("无法定位用户主目录".to_string())
        })?;
    Ok(PathBuf::from(home).join(".ssh").join("known_hosts"))
}

static POOL: Lazy<tokio::sync::Mutex<HashMap<String, Arc<tokio::sync::Mutex<SftpConnection>>>>> =
    Lazy::new(|| tokio::sync::Mutex::new(HashMap::new()));

fn trimmed_profile_parts(profile: &ConnectionProfile) -> (String, String) {
    (profile.username.trim().to_string(), profile.host.trim().to_string())
}

pub fn connection_key(profile: &ConnectionProfile) -> String {
    let (username, host) = trimmed_profile_parts(profile);
    format!("{}#{}@{}:{}", profile.id, username, host, profile.port)
}

pub async fn connect(profile: &ConnectionProfile) -> Result<Arc<tokio::sync::Mutex<SftpConnection>>, String> {
    let key = connection_key(profile);

    loop {
        let entry = {
            let pool = POOL.lock().await;
            pool.get(&key).cloned()
        };

        if let Some(entry) = entry {
            let guard = entry.lock().await;
            if guard.sftp.canonicalize(".").await.is_ok() {
                return Ok(entry.clone());
            }
            drop(guard);
            {
                let mut pool = POOL.lock().await;
                pool.remove(&key);
            }
            continue;
        }

        let connection = do_connect(profile).await?;
        let new_entry = Arc::new(tokio::sync::Mutex::new(connection));
        {
            let mut pool = POOL.lock().await;
            if let Some(existing) = pool.get(&key) {
                return Ok(existing.clone());
            }
            pool.insert(key, new_entry.clone());
        }
        return Ok(new_entry);
    }
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
    let handler = ClientHandler {
        host: host.clone(),
        port: profile.port,
    };
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
