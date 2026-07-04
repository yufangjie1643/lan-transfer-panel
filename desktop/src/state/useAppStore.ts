import { create } from 'zustand';
import type { RemoteItem } from '../api/types';

export type AppView = 'launcher' | 'server-form' | 'remote';

interface AppState {
  backendUrl: string;
  sessionUsername: string | null;
  remotes: string[];
  remote: string;
  remotePath: string;
  remoteItems: RemoteItem[];
  selectedRemoteKeys: Set<string>;
  error: string | null;
  appView: AppView;
  editingProfileId?: string;
  setBackendUrl: (backendUrl: string) => void;
  setSessionUsername: (sessionUsername: string | null) => void;
  setRemotes: (remotes: string[]) => void;
  setRemoteItems: (remote: string, remotePath: string, remoteItems: RemoteItem[]) => void;
  setSelectedRemoteKeys: (selectedRemoteKeys: Set<string>) => void;
  setError: (error: string | null) => void;
  setAppView: (appView: AppView) => void;
  setEditingProfileId: (editingProfileId?: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  backendUrl: 'http://10.42.0.1:5590',
  sessionUsername: null,
  remotes: [],
  remote: '',
  remotePath: '',
  remoteItems: [],
  selectedRemoteKeys: new Set(),
  error: null,
  appView: 'launcher',
  editingProfileId: undefined,
  setBackendUrl: (backendUrl) => set({ backendUrl }),
  setSessionUsername: (sessionUsername) => set({ sessionUsername }),
  setRemotes: (remotes) => set({ remotes }),
  setRemoteItems: (remote, remotePath, remoteItems) =>
    set({ remote, remotePath, remoteItems }),
  setSelectedRemoteKeys: (selectedRemoteKeys) => set({ selectedRemoteKeys }),
  setError: (error) => set({ error }),
  setAppView: (appView) => set({ appView }),
  setEditingProfileId: (editingProfileId) => set({ editingProfileId })
}));
