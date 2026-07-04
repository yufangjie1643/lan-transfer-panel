import type { ExplorerSettings } from './explorerSettings';

export interface ExplorerSettingsPanelLabels {
  title: string;
  cacheEnabled: string;
  cacheTtl: string;
  preloadEnabled: string;
  preloadDepth: string;
  autoRefreshEnabled: string;
  autoRefreshInterval: string;
  close: string;
}

interface ExplorerSettingsPanelProps {
  labels: ExplorerSettingsPanelLabels;
  settings: ExplorerSettings;
  onChange: (settings: ExplorerSettings) => void;
  onClose: () => void;
}

export function ExplorerSettingsPanel({ labels, settings, onChange, onClose }: ExplorerSettingsPanelProps) {
  function update<K extends keyof ExplorerSettings>(key: K, value: ExplorerSettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  return (
    <div className="explorer-settings-overlay" onClick={onClose}>
      <div className="explorer-settings-panel" onClick={(event) => event.stopPropagation()}>
        <h3>{labels.title}</h3>
        <label className="settings-row">
          <input
            type="checkbox"
            checked={settings.cacheEnabled}
            onChange={(event) => update('cacheEnabled', event.target.checked)}
          />
          <span>{labels.cacheEnabled}</span>
        </label>
        <label className="settings-row">
          <span>{labels.cacheTtl}</span>
          <input
            type="number"
            min={10}
            value={settings.cacheTtlSeconds}
            onChange={(event) => update('cacheTtlSeconds', Math.max(10, Number(event.target.value) || 10))}
          />
        </label>
        <label className="settings-row">
          <input
            type="checkbox"
            checked={settings.preloadEnabled}
            onChange={(event) => update('preloadEnabled', event.target.checked)}
          />
          <span>{labels.preloadEnabled}</span>
        </label>
        <label className="settings-row">
          <span>{labels.preloadDepth}</span>
          <input
            type="number"
            min={0}
            max={3}
            value={settings.preloadDepth}
            onChange={(event) => update('preloadDepth', Math.max(0, Math.min(3, Number(event.target.value) || 0)))}
          />
        </label>
        <label className="settings-row">
          <input
            type="checkbox"
            checked={settings.autoRefreshEnabled}
            onChange={(event) => update('autoRefreshEnabled', event.target.checked)}
          />
          <span>{labels.autoRefreshEnabled}</span>
        </label>
        <label className="settings-row">
          <span>{labels.autoRefreshInterval}</span>
          <input
            type="number"
            min={10}
            value={settings.autoRefreshIntervalSeconds}
            onChange={(event) => update('autoRefreshIntervalSeconds', Math.max(10, Number(event.target.value) || 10))}
          />
        </label>
        <div className="settings-actions">
          <button type="button" onClick={onClose}>
            {labels.close}
          </button>
        </div>
      </div>
    </div>
  );
}
