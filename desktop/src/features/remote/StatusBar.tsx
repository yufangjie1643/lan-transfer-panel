export interface ExplorerStatusBarLabels {
  items: (count: number) => string;
  selected: (count: number) => string;
  loading: string;
}

interface StatusBarProps {
  labels: ExplorerStatusBarLabels;
  itemCount: number;
  selectedCount: number;
  error?: string | null;
  isLoading?: boolean;
}

export function StatusBar({ labels, itemCount, selectedCount, error, isLoading }: StatusBarProps) {
  return (
    <div className="explorer-status-bar" role="status">
      <span>{labels.items(itemCount)}</span>
      {selectedCount > 0 ? <span>{labels.selected(selectedCount)}</span> : null}
      {isLoading ? <span className="status-loading">{labels.loading}</span> : null}
      {error ? <span className="status-error">{error}</span> : null}
    </div>
  );
}
