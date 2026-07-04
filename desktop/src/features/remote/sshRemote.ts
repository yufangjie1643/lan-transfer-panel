import { invoke } from '@tauri-apps/api/core';
import type { RemoteItem } from '../../api/types';
import type { DownloadTasksResponse } from '../../api/types';
import type { ConnectionProfile } from '../auth/connectionProfiles';
import type { UploadEntry } from '../local/localFs';

export interface SshDirectoryListing {
  path: string;
  list: RemoteItem[];
}

export function testSshConnection(profile: ConnectionProfile) {
  return invoke<string>('test_ssh_connection', { profile });
}

export function listSshDirectory(profile: ConnectionProfile, path: string) {
  return invoke<SshDirectoryListing>('list_ssh_directory', { profile, path });
}

export function downloadSshFile(profile: ConnectionProfile, remotePath: string, localDir: string) {
  return invoke<string>('download_ssh_file', { profile, remotePath, localDir });
}

export function downloadSshFolder(profile: ConnectionProfile, remotePath: string, localDir: string) {
  return invoke<string>('download_ssh_folder', { profile, remotePath, localDir });
}

export function startSshDownloadTask(
  profile: ConnectionProfile,
  remotePath: string,
  localDir: string,
  recursive: boolean,
  name: string,
  size?: number
) {
  return invoke<string>('start_ssh_download_task', {
    profile,
    remotePath,
    localDir,
    recursive,
    name,
    size
  });
}

export function startSshAria2Download(
  profile: ConnectionProfile,
  remotePath: string,
  localDir: string,
  name: string,
  isDir: boolean
) {
  return invoke<string[]>('start_ssh_aria2_download', {
    profile,
    remotePath,
    localDir,
    name,
    isDir
  });
}

export interface Aria2Config {
  rpcUrl: string;
  rpcSecret: string;
  defaultDir: string;
}

export function getAria2Config() {
  return invoke<Aria2Config>('get_aria2_config');
}

export function saveAria2Config(config: Aria2Config) {
  return invoke<void>('save_aria2_config', { config });
}

export function listTransferTasks() {
  return invoke<DownloadTasksResponse>('list_transfer_tasks');
}

export function controlTransferTask(gid: string, action: string) {
  return invoke<void>('control_transfer_task', { gid, action });
}

export function prepareSshVirtualFile(
  profile: ConnectionProfile,
  remotePath: string,
  name: string
) {
  return invoke<string>('prepare_ssh_virtual_file', { profile, remotePath, name });
}

export function startVirtualFileDrag(
  name: string,
  remotePath: string,
  localPath: string,
  size?: number
) {
  return invoke<void>('start_virtual_file_drag', { name, remotePath, localPath, size });
}

export function selectUploadFiles() {
  return invoke<string[] | null>('select_upload_files');
}

export function uploadSshEntries(
  profile: ConnectionProfile,
  remoteDir: string,
  entries: UploadEntry[]
) {
  return invoke<string[]>('upload_ssh_entries', { profile, remoteDir, entries });
}
