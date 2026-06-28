import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { PanelApiClient } from './api/client';
import type { RemoteItem } from './api/types';
import {
  defaultConnectionProfiles,
  listConnectionProfiles,
  type ConnectionProfile
} from './features/auth/connectionProfiles';
import { LoginScreen } from './features/auth/LoginScreen';
import { selectDownloadDirectory, startVirtualDownloadDrag } from './features/local/localFs';
import type { FolderTreeNode } from './features/local/FolderTree';
import { RemoteExplorer } from './features/remote/RemoteExplorer';
import { defaultLocale, messages, type Locale } from './i18n/messages';
import { useAppStore } from './state/useAppStore';

interface AppProps {
  initialBackendUrl?: string;
}

type RemoteTreeChildren = Record<string, RemoteItem[]>;
type PreparedNativeDrag = {
  name: string;
  remotePath: string;
  size?: number;
  promise: Promise<{ url: string }>;
  download?: { url: string };
};
const nativeDragMaxBytes = 128 * 1024 * 1024;

function buildRemoteTreeNodes(
  remoteName: string,
  childrenByPath: RemoteTreeChildren,
  expandedPaths: Set<string>,
  selectedPath: string
): FolderTreeNode[] {
  if (!remoteName) return [];

  const nodes: FolderTreeNode[] = [];
  const seen = new Set<string>();

  function pushNode(path: string, name: string, depth: number) {
    if (seen.has(path)) return;
    seen.add(path);

    nodes.push({
      id: path,
      name,
      path,
      depth,
      isExpanded: expandedPaths.has(path),
      isSelected: path === selectedPath
    });

    if (!expandedPaths.has(path)) return;

    for (const child of childrenByPath[path] ?? []) {
      if (child.IsDir) pushNode(child.Path || child.Name, child.Name, depth + 1);
    }
  }

  pushNode('', `${remoteName}:`, 0);

  return nodes;
}

export default function App({ initialBackendUrl = 'http://localhost:5590' }: AppProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [connectionProfiles, setConnectionProfiles] = useState<ConnectionProfile[]>(
    defaultConnectionProfiles
  );
  const [remoteTreeChildren, setRemoteTreeChildren] = useState<RemoteTreeChildren>({});
  const [expandedRemotePaths, setExpandedRemotePaths] = useState<Set<string>>(new Set(['']));
  const [sshRoot, setSshRoot] = useState('/home/yufan');
  const preparedNativeDrags = useRef(new Map<string, PreparedNativeDrag>());
  const [remotePathInput, setRemotePathInput] = useState('/home/yufan');
  const text = messages[locale];
  const backendUrl = useAppStore((state) => state.backendUrl);
  const sessionUsername = useAppStore((state) => state.sessionUsername);
  const remote = useAppStore((state) => state.remote);
  const remotePath = useAppStore((state) => state.remotePath);
  const remoteItems = useAppStore((state) => state.remoteItems);
  const selectedRemoteKeys = useAppStore((state) => state.selectedRemoteKeys);
  const error = useAppStore((state) => state.error);
  const setBackendUrl = useAppStore((state) => state.setBackendUrl);
  const setSessionUsername = useAppStore((state) => state.setSessionUsername);
  const setRemotes = useAppStore((state) => state.setRemotes);
  const setRemoteItems = useAppStore((state) => state.setRemoteItems);
  const setSelectedRemoteKeys = useAppStore((state) => state.setSelectedRemoteKeys);
  const setError = useAppStore((state) => state.setError);
  const client = useMemo(() => new PanelApiClient(backendUrl), [backendUrl]);

  useEffect(() => {
    setBackendUrl(initialBackendUrl);
  }, [initialBackendUrl, setBackendUrl]);

  useEffect(() => {
    setRemotePathInput(formatServerPath(remotePath, sshRoot));
  }, [remotePath, sshRoot]);

  useEffect(() => {
    let canceled = false;
    listConnectionProfiles()
      .then((profiles) => {
        if (!canceled && profiles.length) setConnectionProfiles(profiles);
      })
      .catch(() => {
        if (!canceled) setConnectionProfiles(defaultConnectionProfiles);
      });
    return () => {
      canceled = true;
    };
  }, []);

  const loadRemoteDirectory = useCallback(
    async (api: PanelApiClient, selectedRemote: string, path: string) => {
      const listing = await api.list(selectedRemote, path);
      setRemoteItems(selectedRemote, listing.path, listing.list);
      setRemoteTreeChildren((current) => ({ ...current, [listing.path]: listing.list }));
    },
    [setRemoteItems]
  );

  const loadRemoteRoot = useCallback(
    async (api: PanelApiClient) => {
      const response = await api.getRemotes();
      const remotes = Array.isArray(response.remotes) ? response.remotes : [];
      setRemotes(remotes);
      if (!remotes.length) {
        setRemoteItems('', '', []);
        setRemoteTreeChildren({});
        setExpandedRemotePaths(new Set(['']));
        return;
      }
      setRemoteTreeChildren({});
      setExpandedRemotePaths(new Set(['']));
      await loadRemoteDirectory(api, remotes[0], '');
    },
    [loadRemoteDirectory, setRemoteItems, setRemotes]
  );

  const remoteTreeNodes = useMemo(
    () => buildRemoteTreeNodes(remote, remoteTreeChildren, expandedRemotePaths, remotePath),
    [expandedRemotePaths, remote, remotePath, remoteTreeChildren]
  );

  const handleRemoteTreeToggle = useCallback(
    (path: string) => {
      const shouldLoad = remote && !remoteTreeChildren[path];
      setExpandedRemotePaths((current) => {
        const next = new Set(current);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });

      if (!shouldLoad) return;

      loadRemoteDirectory(client, remote, path)
        .catch((toggleError) => {
          setError(
            toggleError instanceof Error ? toggleError.message : text.errors.openDirectoryFailed
          );
        });
    },
    [client, loadRemoteDirectory, remote, remoteTreeChildren, setError, text.errors.openDirectoryFailed]
  );

  const handleRemoteTreeSelect = useCallback(
    (path: string) => {
      if (!remote) return;
      loadRemoteDirectory(client, remote, path).catch((openError) => {
        setError(openError instanceof Error ? openError.message : text.errors.openDirectoryFailed);
      });
    },
    [client, loadRemoteDirectory, remote, setError, text.errors.openDirectoryFailed]
  );

  async function handleLogin(credentials: {
    backendUrl: string;
    username: string;
    password: string;
  }) {
    setIsConnecting(true);
    setError(null);
    const loginClient = new PanelApiClient(credentials.backendUrl);
    try {
      const session = await loginClient.login(credentials.username, credentials.password);
      setBackendUrl(credentials.backendUrl);
      setSessionUsername(session.username);
      const sessionInfo = await loginClient.getSession().catch(() => null);
      if (sessionInfo?.sshRoot) setSshRoot(sessionInfo.sshRoot);
      await loadRemoteRoot(loginClient);
    } catch (loginError) {
      setSessionUsername(null);
      setError(loginError instanceof Error ? loginError.message : text.connection.loginFailed);
    } finally {
      setIsConnecting(false);
    }
  }

  const handleRemoteDownload = useCallback(
    async (key: string) => {
      if (!remote) return;
      const item = remoteItems.find((candidate) => (candidate.Path || candidate.Name) === key);
      if (!item) return;

      try {
        setError(null);
        const directory = await selectDownloadDirectory();
        if (!directory) return;
        const result = await client.addRemoteDownload(remote, item.Path || item.Name, directory);
        if (result.requiresConfirmation) {
          if (!isUsableFolderDownloadPlan(result.plan)) {
            setError('下载计划格式过旧，请刷新页面并确认后端已重启。');
            return;
          }
          const summary = result.summary;
          const confirmed = window.confirm(
            [
              `文件夹：${summary?.name || item.Name}`,
              `文件数：${summary?.fileCount ?? 0}`,
              `总大小：${formatSize(summary?.totalSize)}`,
              `小文件归档：${result.plan?.archive?.fileCount ?? 0} 个，${formatSize(result.plan?.archive?.totalSize)}`,
              `大文件直下：${result.plan?.direct?.fileCount ?? 0} 个，${formatSize(result.plan?.direct?.totalSize)}`,
              `小文件阈值：${formatSize(result.plan?.smallFileBytes)}`,
              `小文件打包门槛：超过 ${result.plan?.minSmallFilesToArchive ?? 10} 个`,
              '达到门槛的小文件打包下载后自动解压，其余文件直接加入 aria2。',
              '继续？'
            ].join('\n')
          );
          if (!confirmed) return;
          await client.addRemoteDownload(remote, item.Path || item.Name, directory, {
            confirmed: true,
            planToken: result.planToken
          });
        }
      } catch (downloadError) {
        setError(downloadError instanceof Error ? downloadError.message : text.errors.downloadFailed);
      }
    },
    [client, remote, remoteItems, setError, text.errors.downloadFailed]
  );

  const prepareNativeDrag = useCallback(
    (key: string) => {
      const item = remoteItems.find((candidate) => (candidate.Path || candidate.Name) === key);
      if (
        !remote ||
        !item ||
        item.IsDir ||
        Number(item.Size || 0) > nativeDragMaxBytes ||
        preparedNativeDrags.current.has(key)
      ) return;
      const remotePath = item.Path || item.Name;
      const prepared: PreparedNativeDrag = {
        name: item.Name,
        remotePath,
        size: item.Size,
        promise: client.createVirtualDragDownload(remote, remotePath).then((download) => {
          prepared.download = { url: download.url };
          return prepared.download;
        })
      };
      preparedNativeDrags.current.set(key, prepared);
    },
    [client, remote, remoteItems]
  );

  const handleNativeDragStart = useCallback(
    (key: string) => {
      const item = remoteItems.find((candidate) => (candidate.Path || candidate.Name) === key);
      if (!remote || !item || item.IsDir) return false;
      if (Number(item.Size || 0) > nativeDragMaxBytes) return false;
      const remotePath = item.Path || item.Name;
      const prepared = preparedNativeDrags.current.get(key);
      preparedNativeDrags.current.delete(key);
      const launch = (download: { url: string }) =>
        startVirtualDownloadDrag(item.Name, remotePath, download.url, item.Size);
      const launchPromise = prepared?.download
        ? launch(prepared.download)
        : (prepared?.promise || client.createVirtualDragDownload(remote, remotePath)).then(launch);
      launchPromise.catch((dragError) => {
        setError(dragError instanceof Error ? dragError.message : '原生拖拽启动失败');
      });
      return true;
    },
    [client, remote, remoteItems, setError]
  );

  const handleRemotePathSubmit = useCallback(async () => {
    if (!remote) return;
    const submittedPath = parseRemotePathInput(remotePathInput, remote);
    try {
      setError(null);
      await loadRemoteDirectory(client, remote, submittedPath);
    } catch (openError) {
      const message = openError instanceof Error ? openError.message : text.errors.openDirectoryFailed;
      if (!isNotDirectoryError(message)) {
        setError(message);
        return;
      }

      try {
        const directory = await selectDownloadDirectory();
        if (!directory) return;
        await client.addRemoteDownload(remote, submittedPath, directory);
      } catch (downloadError) {
        setError(downloadError instanceof Error ? downloadError.message : text.errors.downloadFailed);
      }
    }
  }, [
    client,
    loadRemoteDirectory,
    remote,
    remotePathInput,
    setError,
    text.errors.downloadFailed,
    text.errors.openDirectoryFailed
  ]);

  function handleSwitchConnection() {
    client.logout().catch(() => undefined);
    setSessionUsername(null);
    setRemoteItems('', '', []);
    setRemoteTreeChildren({});
    setExpandedRemotePaths(new Set(['']));
  }

  function handleOpenQueueWindow() {
    try {
      new WebviewWindow('transfer-queue', {
        url: '/queue',
        title: text.queue.title,
        width: 720,
        height: 520,
        minWidth: 560,
        minHeight: 360
      });
    } catch {
      window.open('/queue', 'transfer-queue', 'width=720,height=520');
    }
  }

  const connectionText = sessionUsername
    ? text.connection.connectedAs(sessionUsername)
    : isConnecting
      ? text.connection.connecting
      : text.connection.disconnected;

  if (!sessionUsername) {
    return (
      <main className="login-shell">
        <header className="login-top-bar">
          <strong>{text.appTitle}</strong>
          <label className="language-switch">
            {text.language.label}
            <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
              <option value="zh-CN">{text.language.zhCN}</option>
              <option value="en-US">{text.language.enUS}</option>
            </select>
          </label>
        </header>
        <LoginScreen
          labels={text.login}
          profiles={connectionProfiles}
          isConnecting={isConnecting}
          error={error}
          onSubmit={handleLogin}
        />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <strong>{text.appTitle}</strong>
        <div className="top-bar-actions">
          <span>{connectionText}</span>
          <button type="button" className="link-button" onClick={handleOpenQueueWindow}>
            {text.queue.title}
          </button>
          <button type="button" className="link-button" onClick={handleSwitchConnection}>
            {text.connection.switchConnection}
          </button>
          <label className="language-switch">
            {text.language.label}
            <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
              <option value="zh-CN">{text.language.zhCN}</option>
              <option value="en-US">{text.language.enUS}</option>
            </select>
          </label>
        </div>
      </header>
      {error ? (
        <p className="connection-error app-error" role="alert">
          {error}
        </p>
      ) : null}
      <section className="pane-grid">
        <RemoteExplorer
          labels={{
            title: text.panes.remote,
            tree: text.panes.remoteTree,
            details: text.panes.remoteDetails,
            refresh: text.panes.refresh(text.panes.remote),
            path: text.panes.remotePath,
            openPath: text.panes.openPath,
            expandFolder: text.panes.expandFolder,
            collapseFolder: text.panes.collapseFolder
          }}
          treeNodes={remoteTreeNodes}
          currentPath={remote ? `${remote}:${formatServerPath(remotePath, sshRoot)}` : '/'}
          items={remoteItems.map((item) => ({
            key: item.Path || item.Name,
            name: item.Name,
            isDir: item.IsDir,
            size: item.Size,
            modified: item.ModTime,
          }))}
          selectedKeys={selectedRemoteKeys}
          pathValue={remotePathInput}
          onPathValueChange={setRemotePathInput}
          onPathSubmit={handleRemotePathSubmit}
          onTreeSelect={handleRemoteTreeSelect}
          onTreeToggle={handleRemoteTreeToggle}
          onSelectItem={(key, additive) => {
            const next = additive ? new Set(selectedRemoteKeys) : new Set<string>();
            if (next.has(key)) next.delete(key);
            else next.add(key);
            setSelectedRemoteKeys(next);
          }}
          onOpenDirectory={(key) => {
            if (remote) loadRemoteDirectory(client, remote, key).catch((openError) => {
              setError(openError instanceof Error ? openError.message : text.errors.openDirectoryFailed);
            });
          }}
          onRefresh={() => {
            if (remote) loadRemoteDirectory(client, remote, remotePath).catch((refreshError) => {
              setError(refreshError instanceof Error ? refreshError.message : text.errors.refreshFailed);
            });
          }}
          downloadLabel={text.panes.downloadTo}
          onDownloadFile={handleRemoteDownload}
          onDragDownloadFile={handleRemoteDownload}
          onPrepareNativeDrag={prepareNativeDrag}
          onNativeDragStart={handleNativeDragStart}
        />
      </section>
    </main>
  );
}

function formatSize(size?: number) {
  if (size == null) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function isUsableFolderDownloadPlan(plan: unknown) {
  if (!plan || typeof plan !== 'object') return false;
  const candidate = plan as {
    smallFileBytes?: unknown;
    archive?: { fileCount?: unknown; totalSize?: unknown };
    direct?: { fileCount?: unknown; totalSize?: unknown };
  };
  return (
    typeof candidate.smallFileBytes === 'number' &&
    typeof candidate.archive?.fileCount === 'number' &&
    typeof candidate.archive?.totalSize === 'number' &&
    typeof candidate.direct?.fileCount === 'number' &&
    typeof candidate.direct?.totalSize === 'number'
  );
}

function formatServerPath(path: string, sshRoot: string) {
  if (path.startsWith('/')) return path;
  const root = sshRoot.replace(/\/+$/, '') || '/';
  if (!path) return root;
  return `${root}/${path.replace(/^\/+/, '')}`;
}

function parseRemotePathInput(value: string, remote: string) {
  let input = value.trim().replace(/\\/g, '/');
  const remotePrefix = `${remote}:`;
  if (input.startsWith(remotePrefix)) input = input.slice(remotePrefix.length);
  if (input === '/') return '/';
  return input.replace(/\/+$/, '');
}

function isNotDirectoryError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes('not a directory') || message.includes('不是目录');
}
