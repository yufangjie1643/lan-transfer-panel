import path from 'node:path';

const defaultAria2Options = {
  continue: 'true',
  split: '16',
  'max-connection-per-server': '16',
  'min-split-size': '20M',
  'auto-file-renaming': 'false',
  'allow-overwrite': 'false',
};

export function buildLocalAria2Download({ servedOrigin, remotePath, item = {}, dir } = {}) {
  const origin = String(servedOrigin || '').replace(/\/+$/, '');
  if (!origin) throw new Error('servedOrigin is required');

  const normalizedPath = normalizeRemotePath(remotePath);
  if (!normalizedPath) throw new Error('remotePath is required');

  const outputName = safeAria2OutputName(item.Name || path.posix.basename(normalizedPath));
  const url = `${origin}/${encodeRemotePath(normalizedPath)}`;
  const options = {
    out: outputName,
    ...defaultAria2Options,
  };
  if (dir) options.dir = String(dir);

  return {
    url,
    options,
    params: [[url], options],
  };
}

function normalizeRemotePath(value) {
  const input = String(value || '').replace(/\\/g, '/');
  const normalized = path.posix.normalize(`/${input}`).replace(/^\/+/, '');
  if (normalized === '.') return '';
  if (normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error('remotePath is invalid');
  }
  return normalized;
}

function encodeRemotePath(remotePath) {
  return remotePath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function safeAria2OutputName(value) {
  const cleaned = String(value || 'download.bin')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/^\.{1,2}$/, 'download.bin')
    .trim()
    .slice(0, 180);
  return cleaned || 'download.bin';
}
