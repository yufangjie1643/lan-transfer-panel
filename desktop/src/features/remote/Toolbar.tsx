import { ArrowLeft, ArrowRight, ArrowUp, FolderPlus, RefreshCcw, Trash2, Upload, Download, List } from 'lucide-react';

export interface ExplorerToolbarLabels {
  back: string;
  forward: string;
  up: string;
  refresh: string;
  newFolder: string;
  upload: string;
  download: string;
  delete: string;
  queue: string;
}

interface ToolbarProps {
  labels: ExplorerToolbarLabels;
  canGoBack: boolean;
  canGoForward: boolean;
  canGoUp: boolean;
  hasSelection: boolean;
  isLoading?: boolean;
  onBack: () => void;
  onForward: () => void;
  onUp: () => void;
  onRefresh: () => void;
  onNewFolder: () => void;
  onUpload: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onOpenQueue: () => void;
}

export function Toolbar({
  labels,
  canGoBack,
  canGoForward,
  canGoUp,
  hasSelection,
  isLoading,
  onBack,
  onForward,
  onUp,
  onRefresh,
  onNewFolder,
  onUpload,
  onDownload,
  onDelete,
  onOpenQueue
}: ToolbarProps) {
  return (
    <div className="explorer-toolbar" role="toolbar" aria-label={labels.back}>
      <div className="toolbar-group">
        <button type="button" aria-label={labels.back} title={labels.back} disabled={!canGoBack} onClick={onBack}>
          <ArrowLeft size={16} />
        </button>
        <button type="button" aria-label={labels.forward} title={labels.forward} disabled={!canGoForward} onClick={onForward}>
          <ArrowRight size={16} />
        </button>
        <button type="button" aria-label={labels.up} title={labels.up} disabled={!canGoUp} onClick={onUp}>
          <ArrowUp size={16} />
        </button>
        <button type="button" aria-label={labels.refresh} title={labels.refresh} disabled={isLoading} onClick={onRefresh}>
          <RefreshCcw size={16} />
        </button>
      </div>
      <div className="toolbar-group">
        <button type="button" aria-label={labels.newFolder} title={labels.newFolder} onClick={onNewFolder}>
          <FolderPlus size={16} />
          <span>{labels.newFolder}</span>
        </button>
        <button type="button" aria-label={labels.upload} title={labels.upload} onClick={onUpload}>
          <Upload size={16} />
          <span>{labels.upload}</span>
        </button>
        <button type="button" aria-label={labels.download} title={labels.download} disabled={!hasSelection} onClick={onDownload}>
          <Download size={16} />
          <span>{labels.download}</span>
        </button>
        <button type="button" aria-label={labels.delete} title={labels.delete} disabled={!hasSelection} onClick={onDelete}>
          <Trash2 size={16} />
          <span>{labels.delete}</span>
        </button>
      </div>
      <div className="toolbar-group">
        <button type="button" aria-label={labels.queue} title={labels.queue} onClick={onOpenQueue}>
          <List size={16} />
          <span>{labels.queue}</span>
        </button>
      </div>
    </div>
  );
}
