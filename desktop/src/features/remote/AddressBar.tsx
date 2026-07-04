import { Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface ExplorerAddressBarLabels {
  editPath: string;
}

interface AddressBarProps {
  labels: ExplorerAddressBarLabels;
  remoteName: string;
  path: string;
  onNavigate: (path: string) => void;
}

export function AddressBar({ labels, remoteName, path, onNavigate }: AddressBarProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(path);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(path);
  }, [path]);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const segments = path === '/' ? [remoteName] : [remoteName, ...path.split('/').filter(Boolean)];
  const segmentPaths = segments.map((_, index) => {
    if (index === 0) return '/';
    return `/${segments.slice(1, index + 1).join('/')}`;
  });

  function submitEdit() {
    setIsEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== path) onNavigate(trimmed);
    else setEditValue(path);
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditValue(path);
  }

  if (isEditing) {
    return (
      <div className="explorer-address-bar editing" data-testid="address-bar">
        <input
          ref={inputRef}
          aria-label={labels.editPath}
          value={editValue}
          onChange={(event) => setEditValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submitEdit();
            if (event.key === 'Escape') cancelEdit();
          }}
          onBlur={submitEdit}
        />
      </div>
    );
  }

  return (
    <div className="explorer-address-bar" data-testid="address-bar">
      {segments.map((segment, index) => (
        <span key={segmentPaths[index]} className="address-segment">
          {index > 0 ? <span className="address-separator">›</span> : null}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onNavigate(segmentPaths[index]);
            }}
          >
            {segment}
          </button>
        </span>
      ))}
      <button
        type="button"
        className="address-edit-button"
        data-testid="address-bar-edit"
        aria-label={labels.editPath}
        onClick={() => setIsEditing(true)}
      >
        <Pencil size={14} />
      </button>
    </div>
  );
}
