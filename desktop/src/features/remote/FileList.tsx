import { useCallback, useEffect, useRef, useState } from 'react';
import { File, Folder } from 'lucide-react';

export type FileListSortKey = 'name' | 'modified' | 'size';
export type FileListSortDirection = 'asc' | 'desc';
type ColumnKey = 'name' | 'modified' | 'type' | 'size';

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

const COLUMN_ORDER: ColumnKey[] = ['name', 'modified', 'type', 'size'];
const DEFAULT_WIDTHS: Record<ColumnKey, number> = {
  name: 240,
  modified: 120,
  type: 100,
  size: 90
};
const MIN_WIDTHS: Record<ColumnKey, number> = {
  name: 80,
  modified: 80,
  type: 60,
  size: 60
};
const HIDABLE_COLUMNS: ColumnKey[] = ['modified', 'type', 'size'];
const STORAGE_KEY = 'lan-transfer-file-list-columns';

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
  const resizingRef = useRef<{ key: ColumnKey; startX: number; startWidth: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_WIDTHS, ...(parsed.widths || {}) };
      }
    } catch {}
    return { ...DEFAULT_WIDTHS };
  });

  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { name: true, modified: true, type: true, size: true, ...(parsed.visible || {}) };
      }
    } catch {}
    return { name: true, modified: true, type: true, size: true };
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ widths: columnWidths, visible: visibleColumns })
      );
    } catch {}
  }, [columnWidths, visibleColumns]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      window.addEventListener('mousedown', handleClickOutside);
      return () => window.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpen]);

  const allSelected = items.length > 0 && items.every((item) => selectedKeys.has(item.key));

  const visibleColumnKeys = COLUMN_ORDER.filter((key) => visibleColumns[key]);
  const gridTemplateColumns = ['32px', ...visibleColumnKeys.map((key) => `${columnWidths[key]}px`)].join(' ');

  const handleResizeMove = useCallback((event: MouseEvent) => {
    if (!resizingRef.current) return;
    const { key, startX, startWidth } = resizingRef.current;
    const nextWidth = Math.max(MIN_WIDTHS[key], startWidth + event.clientX - startX);
    setColumnWidths((current) => ({ ...current, [key]: nextWidth }));
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizingRef.current = null;
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('mouseup', handleResizeEnd);
  }, [handleResizeMove]);

  function handleResizeStart(key: ColumnKey, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    resizingRef.current = { key, startX: event.clientX, startWidth: columnWidths[key] };
    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeEnd);
  }

  function handleHeaderContextMenu(event: React.MouseEvent) {
    event.preventDefault();
    setMenuPosition({ left: event.clientX, top: event.clientY });
    setMenuOpen(true);
  }

  function toggleColumn(key: ColumnKey) {
    setVisibleColumns((current) => ({ ...current, [key]: !current[key] }));
  }

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

  function renderCell(key: ColumnKey, item: FileListItem) {
    if (key === 'name') {
      return (
        <div role="gridcell" className="file-cell-name" key={key}>
          {item.isDir ? <Folder size={16} /> : <File size={16} />}
          <span>{item.name}</span>
        </div>
      );
    }
    if (key === 'modified') {
      return <div role="gridcell" key={key}>{item.modified ? new Date(item.modified).toLocaleDateString() : '—'}</div>;
    }
    if (key === 'type') {
      return <div role="gridcell" key={key}>{formatType(item)}</div>;
    }
    return <div role="gridcell" key={key}>{formatSize(item.size)}</div>;
  }

  function renderHeader(key: ColumnKey) {
    const isSortable = key === 'name' || key === 'size';
    return (
      <div
        role="columnheader"
        key={key}
        className={isSortable && sortKey === key ? `sorted-${sortDirection}` : ''}
        onClick={isSortable ? () => onSort(key) : undefined}
      >
        {labels[key]}
        <span
          className="column-resize-handle"
          onMouseDown={(event) => handleResizeStart(key, event)}
          aria-hidden="true"
        />
      </div>
    );
  }

  if (isLoading) {
    return <div className="file-list file-list-loading">{labels.loading}</div>;
  }

  if (!items.length) {
    return <div className="file-list file-list-empty">{labels.empty}</div>;
  }

  return (
    <div className="file-list" role="grid">
      <div
        className="file-list-header"
        role="row"
        style={{ gridTemplateColumns }}
        onContextMenu={handleHeaderContextMenu}
      >
        <div role="columnheader">
          <input
            type="checkbox"
            aria-label={labels.selectAll}
            checked={allSelected}
            onChange={onToggleSelectAll}
          />
        </div>
        {visibleColumnKeys.map(renderHeader)}
      </div>
      <div className="file-list-body">
        {items.map((item) => (
          <div
            key={item.key}
            className={selectedKeys.has(item.key) ? 'file-row selected' : 'file-row'}
            role="row"
            style={{ gridTemplateColumns }}
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
            {visibleColumnKeys.map((key) => renderCell(key, item))}
          </div>
        ))}
      </div>
      {menuOpen ? (
        <div
          ref={menuRef}
          className="column-menu"
          style={{ left: menuPosition.left, top: menuPosition.top }}
          role="menu"
        >
          <div className="column-menu-title">显示列</div>
          {HIDABLE_COLUMNS.map((key) => (
            <label key={key} className="column-menu-item">
              <input
                type="checkbox"
                checked={visibleColumns[key]}
                onChange={() => toggleColumn(key)}
              />
              <span>{labels[key]}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
