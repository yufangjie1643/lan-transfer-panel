import { useRef } from 'react';
import { File, Folder } from 'lucide-react';

export type FileListSortKey = 'name' | 'modified' | 'size';
export type FileListSortDirection = 'asc' | 'desc';

export interface ExplorerFileListLabels {
  name: string;
  modified: string;
  type: string;
  size: string;
  empty: string;
  loading: string;
  selectAll: string;
  folder: string;
  file: string;
}

export interface FileListItem {
  key: string;
  name: string;
  isDir: boolean;
  modified?: string;
  size?: number;
  mimeType?: string;
}

interface FileListProps {
  labels: ExplorerFileListLabels;
  items: FileListItem[];
  selectedKeys: Set<string>;
  sortKey: FileListSortKey;
  sortDirection: FileListSortDirection;
  isLoading?: boolean;
  onSort: (key: FileListSortKey) => void;
  onSelect: (key: string, event: React.MouseEvent | React.ChangeEvent) => void;
  onRangeSelect: (startKey: string, endKey: string) => void;
  onDoubleClick: (item: FileListItem) => void;
  onToggleSelectAll: () => void;
  onPrepareNativeDrag?: (key: string) => void;
  onNativeDragStart?: (key: string) => boolean;
}

export function FileList({
  labels,
  items,
  selectedKeys,
  sortKey,
  sortDirection,
  isLoading,
  onSort,
  onSelect,
  onRangeSelect,
  onDoubleClick,
  onToggleSelectAll,
  onPrepareNativeDrag,
  onNativeDragStart
}: FileListProps) {
  const lastSelectedRef = useRef<string | null>(null);

  const allSelected = items.length > 0 && items.every((item) => selectedKeys.has(item.key));

  function handleRowClick(item: FileListItem, event: React.MouseEvent) {
    if (event.shiftKey && lastSelectedRef.current) {
      onRangeSelect(lastSelectedRef.current, item.key);
    } else {
      onSelect(item.key, event);
    }
    lastSelectedRef.current = item.key;
  }

  function formatSize(size?: number) {
    if (size == null) return '—';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
    return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  function formatType(item: FileListItem) {
    if (item.isDir) return labels.folder;
    if (item.mimeType) return item.mimeType;
    return labels.file;
  }

  if (isLoading) {
    return <div className="file-list file-list-loading">{labels.loading}</div>;
  }

  if (!items.length) {
    return <div className="file-list file-list-empty">{labels.empty}</div>;
  }

  return (
    <div className="file-list" role="grid">
      <div className="file-list-header" role="row">
        <div role="columnheader">
          <input
            type="checkbox"
            aria-label={labels.selectAll}
            checked={allSelected}
            onChange={onToggleSelectAll}
          />
        </div>
        <div role="columnheader" className={sortKey === 'name' ? `sorted-${sortDirection}` : ''} onClick={() => onSort('name')}>
          {labels.name}
        </div>
        <div role="columnheader">{labels.modified}</div>
        <div role="columnheader">{labels.type}</div>
        <div role="columnheader" className={sortKey === 'size' ? `sorted-${sortDirection}` : ''} onClick={() => onSort('size')}>
          {labels.size}
        </div>
      </div>
      <div className="file-list-body">
        {items.map((item) => (
          <div
            key={item.key}
            className={selectedKeys.has(item.key) ? 'file-row selected' : 'file-row'}
            role="row"
            draggable={!item.isDir}
            onClick={(event) => handleRowClick(item, event)}
            onDoubleClick={() => onDoubleClick(item)}
            onMouseEnter={() => onPrepareNativeDrag?.(item.key)}
            onDragStart={(event) => {
              const ok = onNativeDragStart?.(item.key) ?? false;
              if (!ok) event.preventDefault();
            }}
          >
            <div role="gridcell" onClick={(event) => event.stopPropagation()}>
              <input
                type="checkbox"
                checked={selectedKeys.has(item.key)}
                onChange={(event) => onSelect(item.key, event)}
              />
            </div>
            <div role="gridcell" className="file-cell-name">
              {item.isDir ? <Folder size={16} /> : <File size={16} />}
              <span>{item.name}</span>
            </div>
            <div role="gridcell">{item.modified ? new Date(item.modified).toLocaleDateString() : '—'}</div>
            <div role="gridcell">{formatType(item)}</div>
            <div role="gridcell">{formatSize(item.size)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
