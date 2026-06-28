#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const backendUrl = stripTrailingSlash(process.env.PANEL_URL || 'http://localhost:5590');
const username = process.env.PANEL_USER || readCredential('username') || os.userInfo().username || 'admin';
const password = process.env.PANEL_PASS || readCredential('password');
const remote = process.env.DEMO_REMOTE || 'server';
const listPath = process.env.DEMO_PATH || '';
const explicitFile = process.env.DEMO_FILE || '';
const maxDemoBytes = Number(process.env.DEMO_MAX_BYTES || 1024 * 1024);

async function login() {
  const response = await fetch(`${backendUrl}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  jar.store(response);
  if (!response.ok) {
    fail(`Login failed: HTTP ${response.status} ${await response.text()}`);
  }
}

async function findSmallFile(basePath) {
  const queue = [basePath];
  for (let scanned = 0; queue.length && scanned < 100; scanned += 1) {
    const current = queue.shift() || '';
    const result = await apiJson(`/api/list?${new URLSearchParams({ remote, path: current })}`);
    for (const item of result.list || []) {
      const itemPath = item.Path || item.Name;
      if (!item.IsDir && Number(item.Size || 0) > 0 && Number(item.Size || 0) <= maxDemoBytes) {
        return itemPath;
      }
    }
    for (const item of result.list || []) {
      if (item.IsDir) queue.push(item.Path || item.Name);
      if (queue.length >= 20) break;
    }
  }
  fail(`No small file <= ${maxDemoBytes} bytes found under ${remote}:${basePath || '/'}`);
}

async function apiJson(apiPath, init = {}) {
  const response = await fetch(`${backendUrl}${apiPath}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(jar.header() ? { cookie: jar.header() } : {}),
      ...(init.headers || {}),
    },
  });
  jar.store(response);
  if (!response.ok) {
    fail(`API ${apiPath} failed: HTTP ${response.status} ${await response.text()}`);
  }
  return response.json();
}

class CookieJar {
  cookies = new Map();

  store(response) {
    const setCookie = response.headers.get('set-cookie');
    if (!setCookie) return;
    const [pair] = setCookie.split(';');
    const [name, value] = pair.split('=');
    if (name && value) this.cookies.set(name.trim(), value.trim());
  }

  header() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

if (!password) {
  fail('PANEL_PASS is required, or configure ~/.config/file-transfer/rclone-rc.credentials');
}

const jar = new CookieJar();

console.log(`Demo check: ${backendUrl}`);
try {
  await login();
  const session = await apiJson('/api/session');
  console.log(`Session: ${session.username}, sshRoot=${session.sshRoot || '(none)'}`);

  const target = explicitFile || await findSmallFile(listPath);
  console.log(`Virtual drag file: ${remote}:${target}`);

  const tokenResponse = await apiJson('/api/virtual-drag-token', {
    method: 'POST',
    body: JSON.stringify({ remote, path: target }),
  });
  console.log(`Token expires at: ${tokenResponse.expiresAt}`);

  const downloadUrl = `${backendUrl}/api/download?${new URLSearchParams({ downloadToken: tokenResponse.token })}`;
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    fail(`Token download failed: HTTP ${response.status} ${await response.text()}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) fail('Token download returned an empty file');
  console.log(`Downloaded ${bytes.length} bytes through one-time token.`);
  console.log('Demo backend path is ready. Start the desktop app and drag the same file to Explorer.');
} catch (error) {
  if (error?.cause?.code === 'ECONNREFUSED' || /fetch failed/i.test(String(error?.message || error))) {
    fail(`Cannot reach ${backendUrl}. Start the backend first with: npm run dev:server`);
  }
  throw error;
}

function readCredential(key) {
  try {
    const credentialsPath = path.join(os.homedir(), '.config', 'file-transfer', 'rclone-rc.credentials');
    const text = fs.readFileSync(credentialsPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const [left, ...right] = line.split('=');
      if (left?.trim() === key) return right.join('=').trim();
    }
  } catch {
    return '';
  }
  return '';
}

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
