export interface ExplorerSettings {
  cacheEnabled: boolean;
  cacheTtlSeconds: number;
  preloadEnabled: boolean;
  preloadDepth: number;
  autoRefreshEnabled: boolean;
  autoRefreshIntervalSeconds: number;
}

const DEFAULT_SETTINGS: ExplorerSettings = {
  cacheEnabled: true,
  cacheTtlSeconds: 300,
  preloadEnabled: true,
  preloadDepth: 1,
  autoRefreshEnabled: false,
  autoRefreshIntervalSeconds: 60
};

const STORAGE_KEY = 'lan-transfer-explorer-settings';

export function loadExplorerSettings(): ExplorerSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    }
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

export function saveExplorerSettings(settings: ExplorerSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}
