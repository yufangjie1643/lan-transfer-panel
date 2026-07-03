import { invoke } from '@tauri-apps/api/core';

export interface LocalItem {
  path: string;
  name: string;
  isDir: boolean;
  size?: number;
  modified?: number;
}

export interface LocalRoot {
  path: string;
  name: string;
}

export interface UploadEntry {
  sourcePath: string;
  relativePath: string;
  isDir: boolean;
}

export function listLocalRoots() {
  return invoke<LocalRoot[]>('list_local_roots');
}

export function listLocalDirectory(path: string) {
  return invoke<LocalItem[]>('list_local_directory', { path });
}

export function collectUploadEntries(paths: string[]) {
  return invoke<UploadEntry[]>('collect_upload_entries', { paths });
}

export function selectDownloadDirectory() {
  return invoke<string | null>('select_download_directory');
}
