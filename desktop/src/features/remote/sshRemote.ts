import { invoke } from '@tauri-apps/api/core';
import type { ConnectionProfile } from '../auth/connectionProfiles';
import type { RemoteItem } from '../../api/types';

export interface SshListResponse {
  path: string;
  list: RemoteItem[];
}

export function testSshConnection(profile: ConnectionProfile) {
  return invoke<void>('test_ssh_connection', { profile });
}

export function listSshDirectory(profile: ConnectionProfile, path: string) {
  return invoke<SshListResponse>('list_ssh_directory', { profile, path });
}

export function prepareSshVirtualFile(
  profile: ConnectionProfile,
  remotePath: string
) {
  return invoke<{ url: string }>('prepare_ssh_virtual_file', {
    profile,
    remotePath
  });
}

export function startSshDownloadTask(
  profile: ConnectionProfile,
  remotePath: string,
  localDirectory: string
) {
  return invoke<void>('start_ssh_download_task', {
    profile,
    remotePath,
    localDirectory
  });
}

export function startVirtualFileDrag(
  name: string,
  remotePath: string,
  downloadUrl: string,
  size?: number
) {
  return invoke<void>('start_virtual_file_drag', {
    name,
    remotePath,
    downloadUrl,
    size
  });
}
