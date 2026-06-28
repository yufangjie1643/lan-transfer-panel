import { FolderTree, type FolderTreeNode } from '../local/FolderTree';
import { FilePane, type PaneItem } from '../panes/FilePane';

interface RemoteExplorerLabels {
  title: string;
  tree: string;
  details: string;
  refresh: string;
  path: string;
  openPath: string;
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
