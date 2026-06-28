import path from 'node:path';

export function normalizeSshRemotePath(value) {
  const input = String(value || '').trim().replace(/\\/g, '/');
  if (!input || input === '/') return input.startsWith('/') ? '/' : '';
  if (input.split('/').some((part) => part === '..')) {
    throw Object.assign(new Error('路径不合法'), { statusCode: 400 });
  }
  const absolute = input.startsWith('/');
  const normalized = path.posix.normalize(input);
  if (normalized === '.') return '';
  const parts = normalized.split('/').filter(Boolean);
  if (parts.includes('..')) {
    throw Object.assign(new Error('路径不合法'), { statusCode: 400 });
  }
  return absolute ? `/${parts.join('/')}` : parts.join('/');
}
