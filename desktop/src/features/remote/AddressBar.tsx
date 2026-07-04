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
      <div className="explorer-address-bar editing">
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
    <div className="explorer-address-bar" onClick={() => setIsEditing(true)} role="button" tabIndex={0}>
      {segments.map((segment, index) => (
        <span key={`${segment}-${index}`} className="address-segment">
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
    </div>
  );
}
