import { create } from 'zustand';
import type { RemoteItem } from '../api/types';

interface AppState {
  backendUrl: string;
  sessionUsername: string | null;
  remotes: string[];
  remote: string;
  remotePath: string;
  remoteItems: RemoteItem[];
  selectedRemoteKeys: Set<string>;
  error: string | null;
  setBackendUrl: (backendUrl: string) => void;
  setSessionUsername: (sessionUsername: string | null) => void;
  setRemotes: (remotes: string[]) => void;
  setRemoteItems: (remote: string, remotePath: string, remoteItems: RemoteItem[]) => void;
  setSelectedRemoteKeys: (selectedRemoteKeys: Set<string>) => void;
  setError: (error: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  backendUrl: 'http://localhost:5590',
  sessionUsername: null,
  remotes: [],
  remote: '',
  remotePath: '',
  remoteItems: [],
  selectedRemoteKeys: new Set(),
  error: null,
  setBackendUrl: (backendUrl) => set({ backendUrl }),
  setSessionUsername: (sessionUsername) => set({ sessionUsername }),
  setRemotes: (remotes) => set({ remotes }),
  setRemoteItems: (remote, remotePath, remoteItems) =>
    set({ remote, remotePath, remoteItems, selectedRemoteKeys: new Set() }),
  setSelectedRemoteKeys: (selectedRemoteKeys) => set({ selectedRemoteKeys }),
  setError: (error) => set({ error })
}));
