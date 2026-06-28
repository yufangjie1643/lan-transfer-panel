export interface SessionInfo {
  ok: true;
  username: string;
  rcloneUrl?: string | null;
  aria2Dir?: string;
  sshHost?: string;
  sshRoot?: string;
  sshRemoteName?: string;
  bindAddresses?: string[];
  port?: number;
}

export interface RemoteItem {
  Path: string;
  Name: string;
  Size?: number;
  MimeType?: string;
  ModTime?: string;
  IsDir: boolean;
}

export interface ListResponse {
  remote: string;
  path: string;
  list: RemoteItem[];
}

export interface Aria2Task {
  gid: string;
  status?: string;
  totalLength?: string;
  completedLength?: string;
  downloadSpeed?: string;
  uploadSpeed?: string;
  files?: unknown[];
  errorMessage?: string;
}

export interface DownloadTasksResponse {
  globalStat: Record<string, string>;
  active: Aria2Task[];
  waiting: Aria2Task[];
  stopped: Aria2Task[];
}

export interface FolderDownloadPlan {
  strategy: 'files' | 'archive-small-files' | 'mixed' | 'unavailable';
  requiresConfirmation: boolean;
  smallFileBytes?: number;
  requiresFullListing?: boolean;
  archive?: {
    fileCount: number;
    totalSize: number;
  };
  direct?: {
    fileCount: number;
    totalSize: number;
  };
  minSmallFilesToArchive?: number;
  compressionSelectable: boolean;
}

export interface FolderDownloadSummary {
  name: string;
  path: string;
  fileCount: number;
  dirCount: number;
  totalSize: number;
  filesTruncated?: boolean;
}

export interface AddRemoteDownloadResponse {
  ok: true;
  gid?: string;
  gids?: string[];
  route?: string;
  strategy?: 'files' | 'archive-small-files' | 'mixed' | 'unavailable';
  requiresConfirmation?: boolean;
  planToken?: string;
  plan?: FolderDownloadPlan;
  summary?: FolderDownloadSummary;
  count?: number;
}
