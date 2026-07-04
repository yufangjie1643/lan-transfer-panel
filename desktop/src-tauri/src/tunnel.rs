use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use russh::client::Handle;
use tokio::net::TcpListener;

use crate::sftp::{ClientHandler, ConnectionProfile};
use crate::ssh_exec::open_tunnel_connection;

const TUNNEL_TTL: Duration = Duration::from_secs(2 * 60 * 60); // 2 hours

struct TunnelEntry {
    local_port: u16,
    shutdown_tx: tokio::sync::watch::Sender<bool>,
    expires_at: Instant,
}

static TUNNELS: OnceLock<Mutex<HashMap<String, TunnelEntry>>> = OnceLock::new();

fn tunnels() -> &'static Mutex<HashMap<String, TunnelEntry>> {
    TUNNELS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Ensure an SSH tunnel from a local ephemeral port to `remote_port` on the
/// remote machine. Returns the local port.
///
/// A dedicated SSH connection is created for the tunnel (separate from the
/// SFTP pool) so that the tunnel lifetime does not block SFTP operations.
pub async fn ensure_tunnel(
    profile: &ConnectionProfile,
    remote_port: u16,
) -> Result<u16, String> {
    let key = format!("{}|{}", profile.host, remote_port);

    // Check cache
    {
        let mut map = tunnels().lock().unwrap();
        if let Some(entry) = map.get_mut(&key) {
            if entry.expires_at > Instant::now() {
                entry.expires_at = Instant::now() + TUNNEL_TTL;
                return Ok(entry.local_port);
            }
            // Expired — shut it down
            let _ = entry.shutdown_tx.send(true);
            map.remove(&key);
        }
    }

    // Open dedicated SSH connection for tunneling
    let handle: Arc<Handle<ClientHandler>> = open_tunnel_connection(profile).await?;

    // Bind local listener
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("绑定本地端口失败: {}", e))?;
    let local_port = listener
        .local_addr()
        .map_err(|e| format!("获取本地端口失败: {}", e))?
        .port();

    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);

    // Spawn accept loop
    let remote_port_u32 = remote_port as u32;
    tokio::spawn(async move {
        let mut rx = shutdown_rx;
        loop {
            tokio::select! {
                accept_result = listener.accept() => {
                    match accept_result {
                        Ok((stream, _)) => {
                            let h = handle.clone();
                            tokio::spawn(async move {
                                if let Err(_e) = relay_connection(h, stream, remote_port_u32).await {
                                    // Connection relay failed — silently drop
                                }
                            });
                        }
                        Err(_) => break,
                    }
                }
                _ = rx.changed() => {
                    // Shutdown signal received
                    break;
                }
            }
        }
    });

    // Wait for tunnel readiness — try connecting to the local port
    wait_for_tcp(local_port, 5000).await?;

    // Store in cache
    {
        let mut map = tunnels().lock().unwrap();
        map.insert(
            key,
            TunnelEntry {
                local_port,
                shutdown_tx,
                expires_at: Instant::now() + TUNNEL_TTL,
            },
        );
    }

    Ok(local_port)
}

async fn relay_connection(
    handle: Arc<Handle<ClientHandler>>,
    mut tcp_stream: tokio::net::TcpStream,
    remote_port: u32,
) -> Result<(), String> {
    let channel = handle
        .channel_open_direct_tcpip("127.0.0.1", remote_port, "127.0.0.1", 0)
        .await
        .map_err(|e| format!("打开 direct-tcpip 通道失败: {}", e))?;

    let mut ssh_stream = channel.into_stream();

    tokio::io::copy_bidirectional(&mut tcp_stream, &mut ssh_stream)
        .await
        .map_err(|e| format!("中继数据失败: {}", e))?;

    Ok(())
}

async fn wait_for_tcp(port: u16, timeout_ms: u64) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    while Instant::now() < deadline {
        if tokio::net::TcpStream::connect(format!("127.0.0.1:{}", port))
            .await
            .is_ok()
        {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    Err(format!("本地端口 {} 在 {}ms 内未就绪", port, timeout_ms))
}

/// Shut down all active tunnels (called on app exit).
pub fn shutdown_all() {
    let mut map = tunnels().lock().unwrap();
    for (_, entry) in map.drain() {
        let _ = entry.shutdown_tx.send(true);
    }
}
