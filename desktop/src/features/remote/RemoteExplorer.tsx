import { useMemo, useState, type MouseEvent, type ChangeEvent } from 'react';
import { FolderTree, type FolderTreeNode } from '../local/FolderTree';
import { Toolbar, type ExplorerToolbarLabels } from './Toolbar';
import { AddressBar, type ExplorerAddressBarLabels } from './AddressBar';
import {
  FileList,
  type ExplorerFileListLabels,
  type FileListItem,
  type FileListSortKey,
  type FileListSortDirection
} from './FileList';
import { StatusBar, type ExplorerStatusBarLabels } from './StatusBar';

interface RemoteExplorerLabels {
  tree: string;
  expandFolder: (name: string) => string;
  collapseFolder: (name: string) => string;
  toolbar: ExplorerToolbarLabels;
  addressBar: ExplorerAddressBarLabels;
  fileList: ExplorerFileListLabels;
  statusBar: ExplorerStatusBarLabels;
}

interface RemoteExplorerProps {
  labels: RemoteExplorerLabels;
  remoteName: string;
  treeNodes: FolderTreeNode[];
  currentPath: string;
  items: FileListItem[];
  selectedKeys: Set<string>;
  canGoBack: boolean;
  canGoForward: boolean;
  canGoUp: boolean;
  isLoading?: boolean;
  error?: string | null;
  onTreeSelect: (path: string) => void;
  onTreeToggle: (path: string) => void;
  onNavigate: (path: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoUp: () => void;
  onRefresh: () => void;
  onNewFolder: () => void;
  onDownloadSelected: () => void;
  onDeleteSelected: () => void;
  onOpenQueue: () => void;
  onSelect: (key: string, additive: boolean) => void;
  onRangeSelect: (startKey: string, endKey: string) => void;
  onToggleSelectAll: () => void;
  onDoubleClickItem: (item: FileListItem) => void;
}

export function RemoteExplorer({
  labels,
  remoteName,
  treeNodes,
  currentPath,
  items,
  selectedKeys,
  canGoBack,
  canGoForward,
  canGoUp,
  isLoading,
  error,
  onTreeSelect,
  onTreeToggle,
  onNavigate,
  onGoBack,
  onGoForward,
  onGoUp,
  onRefresh,
  onNewFolder,
  onDownloadSelected,
  onDeleteSelected,
  onOpenQueue,
  onSelect,
  onRangeSelect,
  onToggleSelectAll,
  onDoubleClickItem
}: RemoteExplorerProps) {
  const [sortKey, setSortKey] = useState<FileListSortKey>('name');
  const [sortDirection, setSortDirection] = useState<FileListSortDirection>('asc');

  const sortedItems = useMemo(() => {
    const sorted = [...items];
    sorted.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      let comparison = 0;
      if (sortKey === 'name') comparison = a.name.localeCompare(b.name);
      else if (sortKey === 'modified') comparison = (a.modified ?? '').localeCompare(b.modified ?? '');
      else if (sortKey === 'size') comparison = (a.size ?? 0) - (b.size ?? 0);
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [items, sortKey, sortDirection]);

  function handleSort(key: FileListSortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  }

  function handleSelect(key: string, event: MouseEvent | ChangeEvent) {
    const additive = 'ctrlKey' in event ? event.ctrlKey || event.metaKey : true;
    onSelect(key, additive);
  }

  return (
    <section className="remote-explorer" aria-label={labels.fileList.name}>
      <Toolbar
        labels={labels.toolbar}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        canGoUp={canGoUp}
        hasSelection={selectedKeys.size > 0}
        isLoading={isLoading}
        onBack={onGoBack}
        onForward={onGoForward}
        onUp={onGoUp}
        onRefresh={onRefresh}
        onNewFolder={onNewFolder}
        onDownload={onDownloadSelected}
        onDelete={onDeleteSelected}
        onOpenQueue={onOpenQueue}
      />
      <AddressBar labels={labels.addressBar} remoteName={remoteName} path={currentPath} onNavigate={onNavigate} />
      <div className="explorer-main">
        <FolderTree
          ariaLabel={labels.tree}
          nodes={treeNodes}
          onSelect={onTreeSelect}
          onToggle={onTreeToggle}
          expandLabel={labels.expandFolder}
          collapseLabel={labels.collapseFolder}
        />
        <FileList
          labels={labels.fileList}
          items={sortedItems}
          selectedKeys={selectedKeys}
          sortKey={sortKey}
          sortDirection={sortDirection}
          isLoading={isLoading}
          onSort={handleSort}
          onSelect={handleSelect}
          onRangeSelect={onRangeSelect}
          onDoubleClick={onDoubleClickItem}
          onToggleSelectAll={onToggleSelectAll}
        />
      </div>
      <StatusBar labels={labels.statusBar} itemCount={items.length} selectedCount={selectedKeys.size} error={error} isLoading={isLoading} />
    </section>
  );
}
