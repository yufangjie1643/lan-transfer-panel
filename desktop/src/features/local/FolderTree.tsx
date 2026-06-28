import type { CSSProperties } from 'react';
import { ChevronDown, ChevronRight, Folder } from 'lucide-react';

export interface FolderTreeNode {
  id: string;
  name: string;
  path: string;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
}

interface FolderTreeProps {
  ariaLabel: string;
  nodes: FolderTreeNode[];
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
  expandLabel?: (name: string) => string;
  collapseLabel?: (name: string) => string;
}

export function FolderTree({
  ariaLabel,
  nodes,
  onSelect,
  onToggle,
  expandLabel = (name) => `展开 ${name}`,
  collapseLabel = (name) => `折叠 ${name}`
}: FolderTreeProps) {
  return (
    <div className="folder-tree" role="tree" aria-label={ariaLabel}>
      {nodes.map((node) => (
        <div
          className={node.isSelected ? 'folder-tree-item selected' : 'folder-tree-item'}
          key={node.id}
          role="treeitem"
          aria-label={node.name}
          aria-expanded={node.isExpanded}
          aria-selected={node.isSelected}
          style={{ paddingLeft: 4 + node.depth * 14 } as CSSProperties}
        >
          <button
            type="button"
            className="folder-tree-toggle"
            aria-label={node.isExpanded ? collapseLabel(node.name) : expandLabel(node.name)}
            onClick={() => onToggle(node.path)}
          >
            {node.isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <button
            type="button"
            className="folder-tree-label"
            onClick={() => onSelect(node.path)}
          >
            <Folder size={15} />
            <span>{node.name}</span>
          </button>
        </div>
      ))}
    </div>
  );
}
