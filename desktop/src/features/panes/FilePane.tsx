import { File, Folder, RefreshCcw } from 'lucide-react';
import { defaultMessages } from '../../i18n/messages';

export interface PaneItem {
  key: string;
  name: string;
  isDir: boolean;
  size?: number;
  modified?: string | number;
}

interface FilePaneProps {
  title: string;
  ariaLabel?: string;
  refreshLabel?: string;
  showHeader?: boolean;
  path: string;
  items: PaneItem[];
  selectedKeys: Set<string>;
  onSelect: (key: string, additive: boolean) => void;
  onOpenDirectory: (key: string) => void;
  onRefresh: () => void;
  downloadLabel?: string;
  onDownload?: (key: string) => void;
  onDragDownload?: (key: string) => void;
  onPrepareNativeDrag?: (key: string) => void;
  onNativeDragStart?: (key: string) => boolean;
}

export function FilePane({
  title,
  ariaLabel = title,
  refreshLabel = defaultMessages.panes.refresh(title),
  showHeader = true,
  path,
  items,
  selectedKeys,
  onSelect,
  onOpenDirectory,
  onRefresh,
  downloadLabel,
  onDownload,
  onDragDownload,
  onPrepareNativeDrag,
  onNativeDragStart
}: FilePaneProps) {
  return (
    <section className={showHeader ? 'file-pane' : 'file-pane headerless'} aria-label={ariaLabel}>
      {showHeader ? (
        <div className="pane-header">
          <strong>{title}</strong>
          <code>{path || '/'}</code>
          <button type="button" aria-label={refreshLabel} onClick={onRefresh}>
            <RefreshCcw size={16} />
          </button>
        </div>
      ) : null}
      <div className="file-table" role="grid">
        {items.map((item) => (
          <div
            className={selectedKeys.has(item.key) ? 'file-row selected' : 'file-row'}
            key={item.key}
            draggable={Boolean(onDragDownload)}
            onMouseDown={(event) => {
              if (event.button === 0) onPrepareNativeDrag?.(item.key);
            }}
            onDragStart={(event) => {
              if (!onDragDownload) return;
              if (onNativeDragStart?.(item.key)) {
                event.currentTarget.dataset.nativeDrag = 'true';
                event.preventDefault();
                return;
              }
              delete event.currentTarget.dataset.nativeDrag;
              event.dataTransfer.effectAllowed = 'copy';
              event.dataTransfer.setData('text/plain', item.key);
              event.dataTransfer.setData(
                'application/x-lan-transfer-remote-path',
                JSON.stringify({ key: item.key, name: item.name, isDir: item.isDir }),
              );
            }}
            onDragEnd={(event) => {
              if (event.currentTarget.dataset.nativeDrag === 'true') {
                delete event.currentTarget.dataset.nativeDrag;
                return;
              }
              onDragDownload?.(item.key);
            }}
          >
            <button
              type="button"
              className="file-row-main"
              aria-pressed={selectedKeys.has(item.key)}
              onClick={(event) => onSelect(item.key, event.ctrlKey || event.metaKey)}
              onDoubleClick={() => item.isDir && onOpenDirectory(item.key)}
            >
              {item.isDir ? <Folder size={16} /> : <File size={16} />}
              <span className="file-name">{item.name}</span>
              <span className="file-size">{item.isDir ? '' : formatSize(item.size)}</span>
            </button>
            {onDownload && downloadLabel ? (
              <button
                type="button"
                className="file-row-action"
                aria-label={`${downloadLabel} ${item.name}`}
                onClick={() => onDownload(item.key)}
              >
                {downloadLabel}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function formatSize(size?: number) {
  if (size == null) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
