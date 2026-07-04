import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { PanelApiClient } from './api/client';
import type { RemoteItem } from './api/types';
import {
  defaultConnectionProfiles,
  deleteConnectionProfile,
  listConnectionProfiles,
  saveConnectionProfile,
  type ConnectionProfile
} from './features/auth/connectionProfiles';
import { LauncherScreen } from './features/auth/LauncherScreen';
import { ServerFormScreen } from './features/auth/ServerFormScreen';
import { selectDownloadDirectory } from './features/local/localFs';
import type { FolderTreeNode } from './features/local/FolderTree';
import { DirectoryCache } from './features/remote/directoryCache';
import { ExplorerSettingsPanel } from './features/remote/ExplorerSettingsPanel';
import { loadExplorerSettings, saveExplorerSettings, type ExplorerSettings } from './features/remote/explorerSettings';
import { RemoteExplorer } from './features/remote/RemoteExplorer';
import {
  listSshDirectory,
  prepareSshVirtualFile,
  startSshDownloadTask,
  startVirtualFileDrag,
  testSshConnection,
  type SshDirectoryListing
} from './features/remote/sshRemote';
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
  promise: Promise<{ localPath: string }>;
  localPath?: string;
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
  const syntheticChildren = new Map<string, Set<string>>();

  function addSyntheticPath(path: string) {
    if (!path.startsWith('/')) return;
    const ancestors = pathAncestors(path);
    for (let index = 1; index < ancestors.length; index += 1) {
      const parent = ancestors[index - 1];
      const child = ancestors[index];
      if (!syntheticChildren.has(parent)) syntheticChildren.set(parent, new Set());
      syntheticChildren.get(parent)!.add(child);
    }
  }

  addSyntheticPath(selectedPath);
  for (const [path, items] of Object.entries(childrenByPath)) {
    addSyntheticPath(path);
    for (const child of items) {
      if (child.IsDir) addSyntheticPath(child.Path || child.Name);
    }
  }

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

    for (const childPath of [...(syntheticChildren.get(path) ?? [])].sort()) {
      pushNode(childPath, pathBasename(childPath), depth + 1);
    }

    for (const child of childrenByPath[path] ?? []) {
      if (child.IsDir) pushNode(child.Path || child.Name, child.Name, depth + 1);
    }
  }

  pushNode('/', '/', 0);

  return nodes;
}

export default function App({ initialBackendUrl = 'http://localhost:5590' }: AppProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [connectionProfiles, setConnectionProfiles] = useState<ConnectionProfile[]>(
    defaultConnectionProfiles
  );
  const [remoteTreeChildren, setRemoteTreeChildren] = useState<RemoteTreeChildren>({});
  const [expandedRemotePaths, setExpandedRemotePaths] = useState<Set<string>>(new Set(['/']));
  const [sshRoot, setSshRoot] = useState('/home/yufan');
  const [sshProfile, setSshProfile] = useState<ConnectionProfile | null>(null);
  const preparedNativeDrags = useRef(new Map<string, PreparedNativeDrag>());
  const [remoteHistory, setRemoteHistory] = useState<string[]>([]);
  const [remoteHistoryIndex, setRemoteHistoryIndex] = useState(-1);
  const [isRemoteLoading, setIsRemoteLoading] = useState(false);
  const [explorerSettings, setExplorerSettings] = useState<ExplorerSettings>(loadExplorerSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const directoryCache = useRef(new DirectoryCache());
  const text = messages[locale];
  const appView = useAppStore((state) => state.appView);
  const editingProfileId = useAppStore((state) => state.editingProfileId);
  const setAppView = useAppStore((state) => state.setAppView);
  const setEditingProfileId = useAppStore((state) => state.setEditingProfileId);
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
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'F12') {
        event.preventDefault();
        invoke('open_devtools').catch(() => undefined);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  useEffect(() => {
    if (!explorerSettings.autoRefreshEnabled || !sshProfile) return undefined;
    const interval = setInterval(() => {
      const ttl = explorerSettings.cacheTtlSeconds * 1000;
      for (const path of directoryCache.current.paths()) {
        const cached = directoryCache.current.get(path, ttl);
        if (!cached) continue;
        listSshDirectory(sshProfile, path)
          .then((listing) => {
            directoryCache.current.set(path, listing);
            setRemoteTreeChildren((current) => ({ ...current, [listing.path]: listing.list }));
            if (path === normalizeAbsolutePath(remotePath)) {
              setRemoteItems('server', listing.path, listing.list);
            }
          })
          .catch(() => undefined);
      }
    }, explorerSettings.autoRefreshIntervalSeconds * 1000);
    return () => clearInterval(interval);
  }, [
    explorerSettings.autoRefreshEnabled,
    explorerSettings.autoRefreshIntervalSeconds,
    explorerSettings.cacheTtlSeconds,
    remotePath,
    setRemoteItems,
    sshProfile
  ]);

  const loadSshDirectory = useCallback(
    async (profile: ConnectionProfile, path: string) => {
      const normalized = normalizeAbsolutePath(path);
      if (explorerSettings.cacheEnabled) {
        const cached = directoryCache.current.get(normalized, explorerSettings.cacheTtlSeconds * 1000);
        if (cached) {
          setRemoteItems('server', cached.path, cached.list);
          setRemoteTreeChildren((current) => ({ ...current, [cached.path]: cached.list }));
          return cached;
        }
      }
      const listing = await listSshDirectory(profile, normalized);
      if (explorerSettings.cacheEnabled) {
        directoryCache.current.set(normalized, listing);
      }
      setRemoteItems('server', listing.path, listing.list);
      setRemoteTreeChildren((current) => ({ ...current, [listing.path]: listing.list }));
      return listing;
    },
    [explorerSettings.cacheEnabled, explorerSettings.cacheTtlSeconds, setRemoteItems]
  );

  const preloadChildren = useCallback(
    (profile: ConnectionProfile, listing: SshDirectoryListing, depth: number) => {
      if (depth <= 0 || !explorerSettings.cacheEnabled || !explorerSettings.preloadEnabled) return;
      for (const item of listing.list) {
        if (!item.IsDir) continue;
        const childPath = item.Path || item.Name;
        if (directoryCache.current.has(childPath)) continue;
        listSshDirectory(profile, childPath)
          .then((childListing) => {
            directoryCache.current.set(childPath, childListing);
            setRemoteTreeChildren((current) => ({
              ...current,
              [childListing.path]: childListing.list
            }));
          })
          .catch(() => undefined);
      }
    },
    [explorerSettings.cacheEnabled, explorerSettings.preloadEnabled]
  );

  const remoteTreeNodes = useMemo(
    () => buildRemoteTreeNodes(remote, remoteTreeChildren, expandedRemotePaths, remotePath),
    [expandedRemotePaths, remote, remotePath, remoteTreeChildren]
  );

  const canGoBack = remoteHistoryIndex > 0;
  const canGoForward = remoteHistoryIndex >= 0 && remoteHistoryIndex < remoteHistory.length - 1;

  const navigateSshDirectory = useCallback(
    async (path: string, mode: 'push' | 'replace' | 'history' = 'push') => {
      if (!sshProfile) {
        reportSshFilesPending();
        return;
      }
      setIsRemoteLoading(true);
      try {
        const listing = await loadSshDirectory(sshProfile, normalizeAbsolutePath(path));
        preloadChildren(sshProfile, listing, explorerSettings.preloadDepth);
        const nextPath = listing.path;
        if (mode === 'history') return;
        setRemoteHistory((current) => {
          if (mode === 'replace') {
            const next = current.length ? [...current] : [nextPath];
            const index = remoteHistoryIndex >= 0 ? remoteHistoryIndex : 0;
            next[index] = nextPath;
            setRemoteHistoryIndex(index);
            return next;
          }
          if (current[remoteHistoryIndex] === nextPath) return current;
          const prefix = remoteHistoryIndex >= 0 ? current.slice(0, remoteHistoryIndex + 1) : [];
          const next = [...prefix, nextPath];
          setRemoteHistoryIndex(next.length - 1);
          return next;
        });
      } finally {
        setIsRemoteLoading(false);
      }
    },
    [loadSshDirectory, preloadChildren, remoteHistoryIndex, sshProfile, explorerSettings.preloadDepth]
  );

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [launcherErrors, setLauncherErrors] = useState<Record<string, string>>({});

  const handleAddProfile = useCallback(() => {
    setError(null);
    setEditingProfileId(undefined);
    setAppView('server-form');
  }, [setAppView, setEditingProfileId, setError]);

  const handleEditProfile = useCallback(
    (profile: ConnectionProfile) => {
      setError(null);
      setEditingProfileId(profile.id);
      setAppView('server-form');
    },
    [setAppView, setEditingProfileId, setError]
  );

  const handleFormCancel = useCallback(() => {
    setError(null);
    setEditingProfileId(undefined);
    setAppView('launcher');
  }, [setAppView, setEditingProfileId, setError]);

  async function handleSaveProfile(profile: ConnectionProfile) {
    setIsSavingProfile(true);
    setError(null);
    try {
      const profiles = await saveConnectionProfile(profile);
      setConnectionProfiles(profiles);
      setEditingProfileId(undefined);
      setAppView('launcher');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存配置失败');
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleSaveAndConnect(profile: ConnectionProfile) {
    setIsSavingProfile(true);
    setError(null);
    try {
      const profiles = await saveConnectionProfile(profile);
      setConnectionProfiles(profiles);
      await handleConnect(profile);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存配置失败');
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleConnect(credentials: ConnectionProfile) {
    setIsConnecting(true);
    setConnectingId(credentials.id);
    setSshProfile(credentials);
    setError(null);
    setLauncherErrors((current) => {
      const next = { ...current };
      delete next[credentials.id];
      return next;
    });
    try {
      await testSshConnection(credentials);
      const root = `/home/${credentials.username}`;
      setSshRoot(root);
      setSessionUsername(`${credentials.username}@${credentials.host}:${credentials.port}`);
      setRemotes(['server']);
      setRemoteTreeChildren({});
      setExpandedRemotePaths(new Set(pathAncestors(root)));
      setSelectedRemoteKeys(new Set());
      setIsRemoteLoading(true);
      try {
        const rootListing = await loadSshDirectory(credentials, root);
        preloadChildren(credentials, rootListing, explorerSettings.preloadDepth);
      } finally {
        setIsRemoteLoading(false);
      }
      setRemoteHistory([root]);
      setRemoteHistoryIndex(0);
      setAppView('remote');
    } catch (connectError) {
      setSshProfile(null);
      setSessionUsername(null);
      const message = connectError instanceof Error ? connectError.message : text.connection.loginFailed;
      setLauncherErrors((current) => ({ ...current, [credentials.id]: message }));
      setError(message);
    } finally {
      setIsConnecting(false);
      setConnectingId(null);
    }
  }

  async function handleDeleteProfile(id: string) {
    setError(null);
    try {
      const profiles = await deleteConnectionProfile(id);
      setConnectionProfiles(profiles);
      setLauncherErrors((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除配置失败');
    }
  }

  const handleRemoteDownload = useCallback(
    async (key: string) => {
      if (!sshProfile) {
        reportSshFilesPending();
        return;
      }
      const item = remoteItems.find((candidate) => (candidate.Path || candidate.Name) === key);
      if (!item) return;

      try {
        setError(null);
        const directory = await selectDownloadDirectory();
        if (!directory) return;
        await startSshDownloadTask(
          sshProfile,
          item.Path || item.Name,
          directory,
          item.IsDir,
          item.Name,
          item.Size
        );
      } catch (downloadError) {
        setError(downloadError instanceof Error ? downloadError.message : text.errors.downloadFailed);
      }
    },
    [remoteItems, setError, sshProfile, text.errors.downloadFailed]
  );

  const prepareNativeDrag = useCallback(
    (key: string) => {
      if (!sshProfile) return;
      const item = remoteItems.find((candidate) => (candidate.Path || candidate.Name) === key);
      if (
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
        promise: prepareSshVirtualFile(sshProfile, remotePath, item.Name).then((localPath) => {
          prepared.localPath = localPath;
          return { localPath };
        })
      };
      preparedNativeDrags.current.set(key, prepared);
    },
    [remoteItems, sshProfile]
  );

  const handleNativeDragStart = useCallback(
    (key: string) => {
      if (!sshProfile) return false;
      const item = remoteItems.find((candidate) => (candidate.Path || candidate.Name) === key);
      if (!item || item.IsDir) return false;
      if (Number(item.Size || 0) > nativeDragMaxBytes) return false;
      const remotePath = item.Path || item.Name;
      const prepared = preparedNativeDrags.current.get(key);
      preparedNativeDrags.current.delete(key);
      const launch = (localPath: string) =>
        startVirtualFileDrag(item.Name, remotePath, localPath, item.Size);
      const launchPromise = prepared?.localPath
        ? launch(prepared.localPath)
        : (prepared?.promise || prepareSshVirtualFile(sshProfile, remotePath, item.Name))
          .then((result) => launch(typeof result === 'string' ? result : result.localPath));
      launchPromise.catch((dragError) => {
        setError(dragError instanceof Error ? dragError.message : '原生拖拽启动失败');
      });
      return true;
    },
    [remoteItems, setError, sshProfile]
  );

  function handleSwitchConnection() {
    client.logout().catch(() => undefined);
    setConnectingId(null);
    setSshProfile(null);
    setSessionUsername(null);
    setRemoteItems('', '', []);
    setSelectedRemoteKeys(new Set());
    setRemoteTreeChildren({});
    setExpandedRemotePaths(new Set(['/']));
    setRemoteHistory([]);
    setRemoteHistoryIndex(-1);
    directoryCache.current.clear();
    setAppView('launcher');
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

  function reportSshFilesPending() {
    setError('请选择服务器并连接后再浏览文件。');
  }

  async function handleSshDirectoryOpen(path: string) {
    try {
      setError(null);
      await navigateSshDirectory(path);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : text.errors.openDirectoryFailed);
    }
  }

  async function handleTreeToggle(path: string) {
    setExpandedRemotePaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    if (remoteTreeChildren[path] || !sshProfile) return;
    try {
      const listing = await listSshDirectory(sshProfile, path);
      setRemoteTreeChildren((current) => ({ ...current, [listing.path]: listing.list }));
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : text.errors.openDirectoryFailed);
    }
  }

  async function handleGoBack() {
    if (!canGoBack) return;
    const nextIndex = remoteHistoryIndex - 1;
    const path = remoteHistory[nextIndex];
    if (!path) return;
    try {
      setError(null);
      setRemoteHistoryIndex(nextIndex);
      await navigateSshDirectory(path, 'history');
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : text.errors.openDirectoryFailed);
    }
  }

  async function handleGoForward() {
    if (!canGoForward) return;
    const nextIndex = remoteHistoryIndex + 1;
    const path = remoteHistory[nextIndex];
    if (!path) return;
    try {
      setError(null);
      setRemoteHistoryIndex(nextIndex);
      await navigateSshDirectory(path, 'history');
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : text.errors.openDirectoryFailed);
    }
  }

  async function handleGoParent() {
    const parent = parentPath(remotePath);
    if (!parent) return;
    await handleSshDirectoryOpen(parent);
  }

  function handleRangeSelect(startKey: string, endKey: string) {
    const keys = remoteItems.map((item) => item.Path || item.Name);
    const startIndex = keys.indexOf(startKey);
    const endIndex = keys.indexOf(endKey);
    if (startIndex === -1 || endIndex === -1) return;
    const [low, high] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    const next = new Set(selectedRemoteKeys);
    for (let index = low; index <= high; index += 1) {
      next.add(keys[index]);
    }
    setSelectedRemoteKeys(next);
  }

  function handleToggleSelectAll() {
    const keys = remoteItems.map((item) => item.Path || item.Name);
    const allSelected = keys.length > 0 && keys.every((key) => selectedRemoteKeys.has(key));
    if (allSelected) {
      const next = new Set(selectedRemoteKeys);
      for (const key of keys) next.delete(key);
      setSelectedRemoteKeys(next);
    } else {
      const next = new Set(selectedRemoteKeys);
      for (const key of keys) next.add(key);
      setSelectedRemoteKeys(next);
    }
  }

  async function handleDownloadSelected() {
    if (!sshProfile) {
      reportSshFilesPending();
      return;
    }
    if (selectedRemoteKeys.size === 0) return;
    try {
      setError(null);
      const directory = await selectDownloadDirectory();
      if (!directory) return;
      const selectedItems = remoteItems.filter((item) =>
        selectedRemoteKeys.has(item.Path || item.Name)
      );
      for (const item of selectedItems) {
        await startSshDownloadTask(
          sshProfile,
          item.Path || item.Name,
          directory,
          item.IsDir,
          item.Name,
          item.Size
        );
      }
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : text.errors.downloadFailed);
    }
  }

  function handleNewFolder() {
    setError('新建文件夹功能暂不可用');
  }

  function handleDeleteSelected() {
    setError('删除功能暂不可用');
  }

  const connectionText = sessionUsername
    ? text.connection.connectedAs(sessionUsername)
    : isConnecting
      ? text.connection.connecting
      : text.connection.disconnected;

  if (appView !== 'remote') {
    return (
      <main className="launcher-shell">
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
        {appView === 'launcher' ? (
          <LauncherScreen
            labels={text.launcher}
            profiles={connectionProfiles}
            connectingId={connectingId}
            errors={launcherErrors}
            onConnect={handleConnect}
            onEdit={handleEditProfile}
            onDelete={handleDeleteProfile}
            onAdd={handleAddProfile}
          />
        ) : (
          <ServerFormScreen
            labels={text.serverForm}
            profile={connectionProfiles.find((p) => p.id === editingProfileId)}
            error={error}
            isSaving={isSavingProfile}
            onCancel={handleFormCancel}
            onSave={handleSaveProfile}
            onSaveAndConnect={handleSaveAndConnect}
          />
        )}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <strong>{text.appTitle}</strong>
        <div className="top-bar-actions">
          <span>{connectionText}</span>
          <button type="button" className="link-button" onClick={handleSwitchConnection}>
            {text.connection.switchConnection}
          </button>
          <button type="button" className="link-button" onClick={() => setSettingsOpen(true)}>
            {text.explorer.settings.title}
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
            tree: text.panes.remoteTree,
            expandFolder: text.panes.expandFolder,
            collapseFolder: text.panes.collapseFolder,
            toolbar: text.explorer.toolbar,
            addressBar: text.explorer.addressBar,
            fileList: text.explorer.fileList,
            statusBar: text.explorer.statusBar
          }}
          remoteName={remote || 'server'}
          treeNodes={remoteTreeNodes}
          currentPath={formatServerPath(remotePath, sshRoot)}
          items={remoteItems.map((item) => ({
            key: item.Path || item.Name,
            name: item.Name,
            isDir: item.IsDir,
            modified: item.ModTime,
            size: item.Size,
            mimeType: item.MimeType
          }))}
          selectedKeys={selectedRemoteKeys}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          canGoUp={Boolean(parentPath(remotePath))}
          isLoading={isRemoteLoading}
          error={error}
          onTreeSelect={handleSshDirectoryOpen}
          onTreeToggle={handleTreeToggle}
          onNavigate={handleSshDirectoryOpen}
          onGoBack={handleGoBack}
          onGoForward={handleGoForward}
          onGoUp={handleGoParent}
          onRefresh={() => handleSshDirectoryOpen(remotePath)}
          onNewFolder={handleNewFolder}
          onDownloadSelected={handleDownloadSelected}
          onDeleteSelected={handleDeleteSelected}
          onOpenQueue={handleOpenQueueWindow}
          onSelect={(key, additive) => {
            const next = additive ? new Set(selectedRemoteKeys) : new Set<string>();
            if (next.has(key)) next.delete(key);
            else next.add(key);
            setSelectedRemoteKeys(next);
          }}
          onRangeSelect={handleRangeSelect}
          onToggleSelectAll={handleToggleSelectAll}
          onDoubleClickItem={(item) => {
            if (item.isDir) handleSshDirectoryOpen(item.key);
            else handleRemoteDownload(item.key);
          }}
          onPrepareNativeDrag={prepareNativeDrag}
          onNativeDragStart={handleNativeDragStart}
        />
      </section>
      {settingsOpen ? (
        <ExplorerSettingsPanel
          labels={text.explorer.settings}
          settings={explorerSettings}
          onChange={(next) => {
            setExplorerSettings(next);
            saveExplorerSettings(next);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </main>
  );
}

function formatServerPath(path: string, sshRoot: string) {
  if (path.startsWith('/')) return path;
  const root = sshRoot.replace(/\/+$/, '') || '/';
  if (!path) return root;
  return `${root}/${path.replace(/^\/+/, '')}`;
}

function normalizeAbsolutePath(path: string) {
  const normalized = path.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized) return '/';
  if (normalized === '/') return '/';
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function pathAncestors(path: string) {
  if (!path.startsWith('/')) return [];
  const normalized = path.replace(/\/+$/, '') || '/';
  if (normalized === '/') return ['/'];
  const segments = normalized.split('/').filter(Boolean);
  const ancestors = ['/'];
  let current = '';
  for (const segment of segments) {
    current = `${current}/${segment}`;
    ancestors.push(current);
  }
  return ancestors;
}

function pathBasename(path: string) {
  if (path === '/') return '/';
  const normalized = path.replace(/\/+$/, '');
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

function parentPath(path: string) {
  const normalized = normalizeAbsolutePath(path);
  if (normalized === '/') return null;
  const parent = normalized.slice(0, normalized.lastIndexOf('/')) || '/';
  return parent;
}
