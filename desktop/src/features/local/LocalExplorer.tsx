import { FilePane, type PaneItem } from '../panes/FilePane';
import { FolderTree, type FolderTreeNode } from './FolderTree';

interface LocalExplorerLabels {
  title: string;
  tree: string;
  details: string;
  refresh: string;
  expandFolder?: (name: string) => string;
  collapseFolder?: (name: string) => string;
}

interface LocalExplorerProps {
  labels: LocalExplorerLabels;
  treeNodes: FolderTreeNode[];
  currentPath: string;
  items: PaneItem[];
  selectedKeys: Set<string>;
  onTreeSelect: (path: string) => void;
  onTreeToggle: (path: string) => void;
  onSelectItem: (key: string, additive: boolean) => void;
  onOpenDirectory: (key: string) => void;
  onRefresh: () => void;
}

export function LocalExplorer({
  labels,
  treeNodes,
  currentPath,
  items,
  selectedKeys,
  onTreeSelect,
  onTreeToggle,
  onSelectItem,
  onOpenDirectory,
  onRefresh
}: LocalExplorerProps) {
  return (
    <section className="local-explorer" aria-label={labels.title}>
      <FolderTree
        ariaLabel={labels.tree}
        nodes={treeNodes}
        onSelect={onTreeSelect}
        onToggle={onTreeToggle}
        expandLabel={labels.expandFolder}
        collapseLabel={labels.collapseFolder}
      />
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
      />
    </section>
  );
}
