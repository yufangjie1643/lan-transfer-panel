const defaultCorsOrigins = [
  'http://localhost:1420',
  'http://127.0.0.1:1420',
  'http://[::1]:1420',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'tauri://localhost',
];

export function parseCorsOrigins(value = '') {
  const configured = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return configured.length ? configured : defaultCorsOrigins;
}

export function buildCorsHeaders(origin, configuredOrigins = '') {
  if (!origin) return {};
  const allowedOrigins = parseCorsOrigins(configuredOrigins);
  if (!allowedOrigins.includes(origin) && !allowedOrigins.includes('*')) return {};

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
