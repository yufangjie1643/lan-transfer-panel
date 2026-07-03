import { FolderTree, type FolderTreeNode } from '../local/FolderTree';
import { FilePane, type PaneItem } from '../panes/FilePane';
import { ArrowLeft, ArrowRight, ArrowUp, RefreshCcw } from 'lucide-react';

interface RemoteExplorerLabels {
  title: string;
  tree: string;
  details: string;
  refresh: string;
  path: string;
  openPath: string;
  back?: string;
  forward?: string;
  parent?: string;
  expandFolder: (name: string) => string;
  collapseFolder: (name: string) => string;
}

interface RemoteExplorerProps {
  labels: RemoteExplorerLabels;
  treeNodes: FolderTreeNode[];
  currentPath: string;
  items: PaneItem[];
  selectedKeys: Set<string>;
  pathValue: string;
  onPathValueChange: (path: string) => void;
  onPathSubmit: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  canGoParent?: boolean;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onGoParent?: () => void;
  onTreeSelect: (path: string) => void;
  onTreeToggle: (path: string) => void;
  onSelectItem: (key: string, additive: boolean) => void;
  onOpenDirectory: (key: string) => void;
  onRefresh: () => void;
  downloadLabel?: string;
  onDownloadFile?: (key: string) => void;
  onDragDownloadFile?: (key: string) => void;
  onPrepareNativeDrag?: (key: string) => void;
  onNativeDragStart?: (key: string) => boolean;
}

export function RemoteExplorer({
  labels,
  treeNodes,
  currentPath,
  items,
  selectedKeys,
  pathValue,
  onPathValueChange,
  onPathSubmit,
  canGoBack = false,
  canGoForward = false,
  canGoParent = false,
  onGoBack,
  onGoForward,
  onGoParent,
  onTreeSelect,
  onTreeToggle,
  onSelectItem,
  onOpenDirectory,
  onRefresh,
  downloadLabel,
  onDownloadFile,
  onDragDownloadFile,
  onPrepareNativeDrag,
  onNativeDragStart
}: RemoteExplorerProps) {
  return (
    <section className="remote-explorer" aria-label={labels.title}>
      <FolderTree
        ariaLabel={labels.tree}
        nodes={treeNodes}
        onSelect={onTreeSelect}
        onToggle={onTreeToggle}
        expandLabel={labels.expandFolder}
        collapseLabel={labels.collapseFolder}
      />
      <div className="remote-detail">
        <form
          className="remote-path-bar"
          onSubmit={(event) => {
            event.preventDefault();
            onPathSubmit();
          }}
        >
          <div className="remote-nav-buttons" aria-label="目录导航">
            <button
              type="button"
              aria-label={labels.back ?? '后退'}
              title={labels.back ?? '后退'}
              disabled={!canGoBack}
              onClick={onGoBack}
            >
              <ArrowLeft size={16} />
            </button>
            <button
              type="button"
              aria-label={labels.forward ?? '前进'}
              title={labels.forward ?? '前进'}
              disabled={!canGoForward}
              onClick={onGoForward}
            >
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              aria-label={labels.parent ?? '上一级'}
              title={labels.parent ?? '上一级'}
              disabled={!canGoParent}
              onClick={onGoParent}
            >
              <ArrowUp size={16} />
            </button>
            <button type="button" aria-label={labels.refresh} title={labels.refresh} onClick={onRefresh}>
              <RefreshCcw size={16} />
            </button>
          </div>
          <label>
            <span>{labels.path}</span>
            <input
              aria-label={labels.path}
              value={pathValue}
              onChange={(event) => onPathValueChange(event.currentTarget.value)}
            />
          </label>
          <button type="submit">{labels.openPath}</button>
        </form>
        <FilePane
          title={labels.title}
          ariaLabel={labels.details}
          refreshLabel={labels.refresh}
          path={currentPath}
          items={items}
          selectedKeys={selectedKeys}
          onSelect={onSelectItem}
          onOpenDirectory={onOpenDirectory}
          onRefresh={onRefresh}
          downloadLabel={downloadLabel}
          onDownload={onDownloadFile}
          onDragDownload={onDragDownloadFile}
          onPrepareNativeDrag={onPrepareNativeDrag}
          onNativeDragStart={onNativeDragStart}
        />
      </div>
    </section>
  );
}
