#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

const port = Number(process.env.PANEL_PORT || 5590);
const bindAddresses = (process.env.PANEL_BIND || '127.0.0.1,10.42.0.1')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const maxJsonBytes = 1024 * 1024;
const sessions = new Map();
const sessionTtlMs = 12 * 60 * 60 * 1000;
const servedRemotes = new Map();
const serveTtlMs = 2 * 60 * 60 * 1000;

const runtime = await loadRuntime();

setInterval(() => {
  const now = Date.now();
  for (const [sid, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(sid);
  }
  for (const [key, served] of servedRemotes) {
    if (served.expiresAt <= now) stopServedRemote(key);
  }
}, 10 * 60 * 1000).unref();

async function loadRuntime() {
  const rcloneCredentialsPath = expandHome(
    process.env.RCLONE_CREDENTIALS || '~/.config/file-transfer/rclone-rc.credentials',
  );
  const aria2ConfPath = expandHome(process.env.ARIA2_CONF || '~/.config/file-transfer/aria2.conf');

  const rcloneCredentials = parseKeyValue(await fsp.readFile(rcloneCredentialsPath, 'utf8'));
  const aria2Config = parseKeyValue(await fsp.readFile(aria2ConfPath, 'utf8'));

  const rcloneUrl = stripTrailingSlash(process.env.RCLONE_URL || rcloneCredentials.url);
  const rcloneUser = process.env.RCLONE_USER || rcloneCredentials.username;
  const rclonePass = process.env.RCLONE_PASS || rcloneCredentials.password;
  const aria2Url = process.env.ARIA2_URL || 'http://127.0.0.1:6800/jsonrpc';
  const aria2Secret = process.env.ARIA2_SECRET || aria2Config['rpc-secret'];
  const aria2Dir = process.env.ARIA2_DIR || aria2Config.dir || '/mnt/data/downloads/aria2';

  if (!rcloneUrl || !rcloneUser || !rclonePass) {
    throw new Error(`rclone credentials are incomplete: ${rcloneCredentialsPath}`);
  }
  if (!aria2Secret) {
    throw new Error(`aria2 rpc-secret is missing: ${aria2ConfPath}`);
  }

  return {
    rcloneCredentialsPath,
    aria2ConfPath,
    rcloneUrl,
    rcloneUser,
    rclonePass,
    aria2Url,
    aria2Secret,
    aria2Dir,
    appUser: process.env.PANEL_USER || rcloneUser,
    appPass: process.env.PANEL_PASS || rclonePass,
  };
}

function expandHome(input) {
  if (!input) return input;
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function parseKeyValue(text) {
  const output = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 0) continue;
    output[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return output;
}

function stripTrailingSlash(input) {
  return String(input || '').replace(/\/+$/, '');
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (!key) continue;
    cookies[key] = decodeURIComponent(rest.join('='));
  }
  return cookies;
}

function getSession(req) {
  const sid = parseCookies(req).ltp_session;
  if (!sid) return null;
  const session = sessions.get(sid);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(sid);
    return null;
  }
  session.expiresAt = Date.now() + sessionTtlMs;
  return session;
}

function setSessionCookie(res, sid) {
  res.setHeader(
    'Set-Cookie',
    `ltp_session=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(sessionTtlMs / 1000)}`,
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'ltp_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, status, message, detail) {
  sendJson(res, status, { error: message, detail });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxJsonBytes) {
        reject(Object.assign(new Error('JSON body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }));
      }
    });

    req.on('error', reject);
  });
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function requireAuth(req, res) {
  const session = getSession(req);
  if (session) return session;
  sendError(res, 401, '未登录');
  return null;
}

async function requestHandler(req, res) {
  try {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (requestUrl.pathname.startsWith('/api/')) {
      await handleApi(req, res, requestUrl);
      return;
    }
    await serveStatic(req, res, requestUrl);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      sendError(res, error.statusCode || 500, error.message || '服务器错误');
    } else {
      res.destroy(error);
    }
  }
}

async function handleApi(req, res, requestUrl) {
  const endpoint = requestUrl.pathname;

  if (endpoint === '/api/login' && req.method === 'POST') {
    const body = await readJson(req);
    const ok =
      timingSafeEqualString(body.username, runtime.appUser) &&
      timingSafeEqualString(body.password, runtime.appPass);
    if (!ok) {
      sendError(res, 401, '用户名或密码错误');
      return;
    }

    const sid = crypto.randomBytes(32).toString('hex');
    sessions.set(sid, {
      username: runtime.appUser,
      createdAt: Date.now(),
      expiresAt: Date.now() + sessionTtlMs,
    });
    setSessionCookie(res, sid);
    sendJson(res, 200, { ok: true, username: runtime.appUser });
    return;
  }

  if (endpoint === '/api/logout' && req.method === 'POST') {
    const sid = parseCookies(req).ltp_session;
    if (sid) sessions.delete(sid);
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  const session = requireAuth(req, res);
  if (!session) return;

  if (endpoint === '/api/session' && req.method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      username: session.username,
      rcloneUrl: runtime.rcloneUrl.replace(/\/\/.*@/, '//***@'),
      aria2Dir: runtime.aria2Dir,
      bindAddresses,
      port,
    });
    return;
  }

  if (endpoint === '/api/remotes' && req.method === 'GET') {
    const result = await rcloneRc('config/listremotes', {});
    sendJson(res, 200, {
      remotes: (result.remotes || []).map((remote) => String(remote).replace(/:$/, '')),
    });
    return;
  }

  if (endpoint === '/api/list' && req.method === 'GET') {
    const remote = assertRemote(requestUrl.searchParams.get('remote'));
    const remotePath = normalizeRemotePath(requestUrl.searchParams.get('path') || '');
    const result = await rcloneRc('operations/list', {
      fs: `${remote}:`,
      remote: remotePath,
      opt: { noModTime: false },
    });
    const list = (result.list || []).sort(sortItems);
    sendJson(res, 200, { remote, path: remotePath, list });
    return;
  }

  if (endpoint === '/api/mkdir' && req.method === 'POST') {
    const body = await readJson(req);
    const remote = assertRemote(body.remote);
    const parentPath = normalizeRemotePath(body.path || '');
    const name = assertName(body.name);
    const targetPath = joinRemotePath(parentPath, name);
    await rcloneRc('operations/mkdir', { fs: `${remote}:`, remote: targetPath });
    sendJson(res, 200, { ok: true, path: targetPath });
    return;
  }

  if (endpoint === '/api/delete' && req.method === 'POST') {
    const body = await readJson(req);
    const remote = assertRemote(body.remote);
    const remotePath = normalizeRemotePath(body.path || '');
    if (!remotePath) throw Object.assign(new Error('不能删除 remote 根目录'), { statusCode: 400 });
    await rcloneRc(body.isDir ? 'operations/rmdir' : 'operations/deletefile', {
      fs: `${remote}:`,
      remote: remotePath,
    });
    sendJson(res, 200, { ok: true });
    return;
  }

  if (endpoint === '/api/rclone/stats' && req.method === 'GET') {
    const stats = await rcloneRc('core/stats', {});
    sendJson(res, 200, stats);
    return;
  }

  if (endpoint === '/api/transfers/stats' && req.method === 'GET') {
    const [storage, downloads] = await Promise.allSettled([rcloneRc('core/stats', {}), downloadTasks()]);
    const globalStat = downloads.status === 'fulfilled' ? downloads.value.globalStat || {} : {};
    sendJson(res, 200, {
      transferSpeed: storage.status === 'fulfilled' ? Number(storage.value.speed || 0) : 0,
      downloadSpeed: Number(globalStat.downloadSpeed || 0),
      activeCount: Number(globalStat.numActive || 0) + Number(globalStat.numWaiting || 0),
    });
    return;
  }

  if ((endpoint === '/api/downloads/tasks' || endpoint === '/api/aria2/tasks') && req.method === 'GET') {
    sendJson(res, 200, await downloadTasks());
    return;
  }

  if ((endpoint === '/api/downloads/add' || endpoint === '/api/aria2/add') && req.method === 'POST') {
    const body = await readJson(req);
    const uri = assertDownloadUri(body.url);
    const options = {};
    if (body.dir) options.dir = String(body.dir);
    const gid = await aria2('aria2.addUri', [[uri], options]);
    sendJson(res, 200, { ok: true, gid });
    return;
  }

  if (endpoint === '/api/send' && req.method === 'POST') {
    const body = await readJson(req);
    const result = await sendToPeer(body);
    sendJson(res, 200, result);
    return;
  }

  if ((endpoint === '/api/downloads/control' || endpoint === '/api/aria2/control') && req.method === 'POST') {
    const body = await readJson(req);
    const gid = assertGid(body.gid);
    const actions = {
      pause: 'aria2.pause',
      unpause: 'aria2.unpause',
      remove: 'aria2.remove',
      purge: 'aria2.removeDownloadResult',
    };
    const method = actions[body.action];
    if (!method) throw Object.assign(new Error('不支持的任务操作'), { statusCode: 400 });
    const result = await aria2(method, [gid]);
    sendJson(res, 200, { ok: true, result });
    return;
  }

  if (endpoint === '/api/download' && req.method === 'GET') {
    await handleDownload(req, res, requestUrl);
    return;
  }

  if (endpoint === '/api/download-folder' && req.method === 'GET') {
    await handleDownloadFolder(req, res, requestUrl);
    return;
  }

  if (endpoint === '/api/upload' && req.method === 'PUT') {
    await handleUpload(req, res, requestUrl);
    return;
  }

  sendError(res, 404, '接口不存在');
}

async function serveStatic(req, res, requestUrl) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendError(res, 405, 'Method Not Allowed');
    return;
  }

  let relativePath = decodeURIComponent(requestUrl.pathname);
  if (relativePath === '/') relativePath = '/index.html';
  const filePath = path.normalize(path.join(publicDir, relativePath));
  if (!filePath.startsWith(publicDir)) {
    sendError(res, 403, 'Forbidden');
    return;
  }

  let targetPath = filePath;
  try {
    const stat = await fsp.stat(targetPath);
    if (stat.isDirectory()) targetPath = path.join(targetPath, 'index.html');
  } catch {
    targetPath = path.join(publicDir, 'index.html');
  }

  const stat = await fsp.stat(targetPath);
  res.writeHead(200, {
    'Content-Type': contentType(targetPath),
    'Content-Length': stat.size,
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(targetPath).pipe(res);
}

async function rcloneRc(command, body) {
  const auth = Buffer.from(`${runtime.rcloneUser}:${runtime.rclonePass}`).toString('base64');
  const response = await fetch(`${runtime.rcloneUrl}/${command}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  });
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  if (!response.ok) {
    const message = data.error || data.message || `rclone RC failed: ${response.status}`;
    throw Object.assign(new Error(message), { statusCode: 502, detail: data });
  }
  return data;
}

async function aria2(method, params = []) {
  return aria2Request(runtime.aria2Url, runtime.aria2Secret, method, params);
}

async function downloadTasks() {
  const keys = [
    'gid',
    'status',
    'totalLength',
    'completedLength',
    'downloadSpeed',
    'uploadSpeed',
    'numSeeders',
    'connections',
    'dir',
    'files',
    'errorMessage',
    'bittorrent',
  ];
  const [globalStat, active, waiting, stopped] = await Promise.all([
    aria2('aria2.getGlobalStat'),
    aria2('aria2.tellActive', [keys]),
    aria2('aria2.tellWaiting', [0, 50, keys]),
    aria2('aria2.tellStopped', [0, 50, keys]),
  ]);
  return { globalStat, active, waiting, stopped };
}

async function aria2Request(url, secret, method, params = []) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method,
      params: [`token:${secret}`, ...params],
    }),
  });
  const data = await response.json();
  if (data.error) {
    throw Object.assign(new Error(data.error.message || '下载服务请求失败'), {
      statusCode: 502,
      detail: data.error,
    });
  }
  return data.result;
}

async function sendToPeer(body) {
  const remote = assertRemote(body.remote);
  const remotePath = normalizeRemotePath(body.path || '');
  if (!remotePath) throw Object.assign(new Error('缺少文件路径'), { statusCode: 400 });

  const stat = await rcloneRc('operations/stat', {
    fs: `${remote}:`,
    remote: remotePath,
    opt: { filesOnly: true },
  });
  if (!stat.item || stat.item.IsDir) {
    throw Object.assign(new Error('第一版只支持发送单个文件'), { statusCode: 400 });
  }

  const thresholdBytes = Number(body.thresholdBytes || 1024 ** 3);
  if (Number(stat.item.Size || 0) >= thresholdBytes) {
    return sendLargeFileWithAria2(remote, remotePath, stat.item, body);
  }

  const smallMethod = String(body.smallMethod || 'none');
  if (smallMethod === 'copy' || smallMethod === 'rclone') {
    return copySmallFileWithRclone(remote, remotePath, stat.item, body);
  }
  if (smallMethod === 'sync' || smallMethod === 'rsync') {
    return copySmallFileWithRsync(remote, remotePath, body);
  }

  throw Object.assign(new Error('这个文件低于阈值，请配置复制目标或同步目标'), {
    statusCode: 400,
  });
}

async function sendLargeFileWithAria2(remote, remotePath, item, body) {
  const peerReceiverUrl = assertRpcUrl(body.peerReceiverUrl || body.peerAria2Url);
  const peerReceiverToken = String(body.peerReceiverToken || body.peerAria2Secret || '').trim();
  if (!peerReceiverToken) {
    throw Object.assign(new Error('缺少远端接收口令'), { statusCode: 400 });
  }
  const peerDir = String(body.peerDir || '').trim();
  if (!peerDir) {
    throw Object.assign(new Error('缺少对端下载目录'), { statusCode: 400 });
  }
  const publicHost = assertHost(body.publicHost || '10.42.0.1');

  const served = await ensureServedRemote(remote, publicHost);
  const url = `${served.origin}/${encodeRemotePath(remotePath)}`;
  const gid = await aria2Request(peerReceiverUrl, peerReceiverToken, 'aria2.addUri', [
    [url],
    {
      dir: peerDir,
      out: item.Name || path.posix.basename(remotePath),
      split: '16',
      'max-connection-per-server': '16',
      continue: 'true',
    },
  ]);

  return {
    ok: true,
    route: 'receiver',
    gid,
    sourceUrl: redactUrl(url),
    servePort: served.port,
    expiresAt: new Date(served.expiresAt).toISOString(),
  };
}

async function copySmallFileWithRclone(remote, remotePath, item, body) {
  const target = splitRcloneTarget(body.copyTarget || body.rcloneTarget);
  const dstRemote = joinRemotePath(target.path, item.Name || path.posix.basename(remotePath));
  await rcloneRc('operations/copyfile', {
    srcFs: `${remote}:`,
    srcRemote: remotePath,
    dstFs: `${target.remote}:`,
    dstRemote,
  });
  return {
    ok: true,
    route: 'copy',
    destination: `${target.remote}:${dstRemote}`,
  };
}

async function copySmallFileWithRsync(remote, remotePath, body) {
  const target = String(body.syncTarget || body.rsyncTarget || '').trim();
  if (!target) throw Object.assign(new Error('缺少同步目标'), { statusCode: 400 });
  const source = await localPathForRemote(remote, remotePath);
  const result = await runCommand('rsync', [
    '-avP',
    '--timeout=60',
    '-e',
    'ssh -o BatchMode=yes',
    source,
    target,
  ]);
  return {
    ok: true,
    route: 'sync',
    destination: target,
    output: result.stdout.slice(-4000),
  };
}

async function ensureServedRemote(remote, host) {
  const key = `${remote}|${host}`;
  const existing = servedRemotes.get(key);
  if (existing && existing.child.exitCode === null) {
    existing.expiresAt = Date.now() + serveTtlMs;
    return existing;
  }

  const portNumber = await allocatePort(host);
  const username = 'ltp';
  const password = crypto.randomBytes(24).toString('hex');
  const htpasswdPath = path.join(
    os.tmpdir(),
    `ltp-rclone-serve-${crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)}.htpasswd`,
  );
  const sha1 = crypto.createHash('sha1').update(password).digest('base64');
  await fsp.writeFile(htpasswdPath, `${username}:{SHA}${sha1}\n`, { mode: 0o600 });

  const args = [
    'serve',
    'http',
    `${remote}:`,
    '--addr',
    `${host}:${portNumber}`,
    '--htpasswd',
    htpasswdPath,
    '--dir-cache-time',
    '30s',
    '--server-read-timeout',
    '24h',
    '--server-write-timeout',
    '24h',
  ];
  const child = spawn('rclone', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', (chunk) => {
    console.error(`rclone serve ${remote}: ${chunk.toString().trim()}`);
  });
  child.on('exit', () => {
    const current = servedRemotes.get(key);
    if (current?.child === child) servedRemotes.delete(key);
    fsp.rm(htpasswdPath, { force: true }).catch(() => {});
  });

  await waitForTcp(host, portNumber, 5000);

  const served = {
    child,
    remote,
    host,
    port: portNumber,
    htpasswdPath,
    origin: `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${portNumber}`,
    expiresAt: Date.now() + serveTtlMs,
  };
  servedRemotes.set(key, served);
  return served;
}

function stopServedRemote(key) {
  const served = servedRemotes.get(key);
  if (!served) return;
  served.child.kill('SIGTERM');
  fsp.rm(served.htpasswdPath, { force: true }).catch(() => {});
  servedRemotes.delete(key);
}

async function allocatePort(host) {
  const server = net.createServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      const selected = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(selected));
    });
  });
}

async function waitForTcp(host, portNumber, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const socket = net.createConnection({ host, port: portNumber });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => resolve(false));
      socket.setTimeout(500, () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Object.assign(new Error('rclone serve 启动超时'), { statusCode: 502 });
}

async function localPathForRemote(remote, remotePath) {
  const dump = await rcloneRc('config/dump', {});
  const config = dump[remote];
  if (!config || config.type !== 'alias' || !config.remote) {
    throw Object.assign(new Error('rsync 只支持本地 alias remote'), { statusCode: 400 });
  }
  const root = path.resolve(config.remote);
  const candidate = path.resolve(root, remotePath);
  if (!candidate.startsWith(root + path.sep) && candidate !== root) {
    throw Object.assign(new Error('路径不合法'), { statusCode: 400 });
  }
  return candidate;
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          Object.assign(new Error(stderr.trim() || stdout.trim() || `${command} exited with ${code}`), {
            statusCode: 502,
          }),
        );
      }
    });
  });
}

async function handleDownload(req, res, requestUrl) {
  const remote = assertRemote(requestUrl.searchParams.get('remote'));
  const remotePath = normalizeRemotePath(requestUrl.searchParams.get('path') || '');
  if (!remotePath) throw Object.assign(new Error('缺少文件路径'), { statusCode: 400 });

  const stat = await rcloneRc('operations/stat', {
    fs: `${remote}:`,
    remote: remotePath,
    opt: { filesOnly: true },
  });
  if (!stat.item || stat.item.IsDir) {
    throw Object.assign(new Error('只能下载文件'), { statusCode: 400 });
  }

  const child = spawn('rclone', ['cat', `${remote}:${remotePath}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const filename = encodeURIComponent(stat.item.Name || path.posix.basename(remotePath));
  res.writeHead(200, {
    'Content-Type': stat.item.MimeType || 'application/octet-stream',
    'Content-Length': stat.item.Size,
    'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    'Cache-Control': 'no-store',
  });

  child.stdout.pipe(res);
  child.stderr.on('data', (chunk) => {
    console.error(`rclone cat: ${chunk.toString().trim()}`);
  });
  req.on('close', () => child.kill('SIGTERM'));
  child.on('error', (error) => res.destroy(error));
}

async function handleDownloadFolder(req, res, requestUrl) {
  const remote = assertRemote(requestUrl.searchParams.get('remote'));
  const remotePath = normalizeRemotePath(requestUrl.searchParams.get('path') || '');
  if (!remotePath) throw Object.assign(new Error('缺少文件夹路径'), { statusCode: 400 });

  const stat = await rcloneRc('operations/stat', {
    fs: `${remote}:`,
    remote: remotePath,
    opt: { dirsOnly: true },
  });
  if (!stat.item || !stat.item.IsDir) {
    throw Object.assign(new Error('只能打包下载文件夹'), { statusCode: 400 });
  }

  const folderName = safeArchiveBaseName(stat.item.Name || path.posix.basename(remotePath));
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'lan-transfer-folder-'));
  const folderRoot = path.join(tempRoot, folderName);
  const archivePath = path.join(tempRoot, `${folderName}.tar.gz`);
  let handoffToResponse = false;

  try {
    await fsp.mkdir(folderRoot, { recursive: true });
    await runCommand('rclone', ['copy', `${remote}:${remotePath}`, folderRoot]);
    await runCommand('tar', [
      '-C',
      tempRoot,
      '--use-compress-program=gzip -1',
      '-cf',
      archivePath,
      '--',
      folderName,
    ]);

    const archiveStat = await fsp.stat(archivePath);
    const filename = encodeURIComponent(`${folderName}.tar.gz`);
    res.writeHead(200, {
      'Content-Type': 'application/gzip',
      'Content-Length': archiveStat.size,
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      'Cache-Control': 'no-store',
    });

    handoffToResponse = true;
    const cleanup = once(() => {
      fsp.rm(tempRoot, { recursive: true, force: true }).catch((error) => {
        console.error(`cleanup archive temp: ${error.message}`);
      });
    });
    const stream = fs.createReadStream(archivePath);
    stream.on('error', (error) => res.destroy(error));
    res.on('close', cleanup);
    stream.pipe(res);
  } catch (error) {
    if (!handoffToResponse) {
      await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
    }
    throw error;
  }
}

async function handleUpload(req, res, requestUrl) {
  const remote = assertRemote(requestUrl.searchParams.get('remote'));
  const parentPath = normalizeRemotePath(requestUrl.searchParams.get('path') || '');
  const name = assertName(requestUrl.searchParams.get('name'));
  const targetPath = joinRemotePath(parentPath, name);

  const child = spawn('rclone', ['rcat', `${remote}:${targetPath}`], {
    stdio: ['pipe', 'ignore', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  req.pipe(child.stdin);
  req.on('aborted', () => child.kill('SIGTERM'));

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });

  if (exitCode !== 0) {
    throw Object.assign(new Error(stderr.trim() || `rclone rcat exited with ${exitCode}`), {
      statusCode: 502,
    });
  }

  sendJson(res, 200, { ok: true, path: targetPath });
}

function assertRemote(value) {
  const remote = String(value || '').replace(/:$/, '');
  if (!/^[A-Za-z0-9_.-]+$/.test(remote)) {
    throw Object.assign(new Error('remote 名称不合法'), { statusCode: 400 });
  }
  return remote;
}

function normalizeRemotePath(value) {
  const input = String(value || '').replace(/\\/g, '/');
  const normalized = path.posix.normalize(`/${input}`).replace(/^\/+/, '');
  if (normalized === '.') return '';
  if (normalized.startsWith('../') || normalized.includes('/../')) {
    throw Object.assign(new Error('路径不合法'), { statusCode: 400 });
  }
  return normalized;
}

function assertName(value) {
  const name = String(value || '').trim();
  if (!name || name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
    throw Object.assign(new Error('名称不合法'), { statusCode: 400 });
  }
  return name;
}

function assertDownloadUri(value) {
  const uri = String(value || '').trim();
  if (!uri) throw Object.assign(new Error('请输入下载链接'), { statusCode: 400 });
  if (/^magnet:\?/i.test(uri)) return uri;
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw Object.assign(new Error('下载链接格式不合法'), { statusCode: 400 });
  }
  if (!['http:', 'https:', 'ftp:'].includes(parsed.protocol)) {
    throw Object.assign(new Error('仅支持 http、https、ftp、magnet 链接'), { statusCode: 400 });
  }
  return uri;
}

function assertRpcUrl(value) {
  const url = String(value || '').trim();
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw Object.assign(new Error('远端接收地址不合法'), { statusCode: 400 });
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw Object.assign(new Error('远端接收地址仅支持 http/https'), { statusCode: 400 });
  }
  return parsed.toString();
}

function assertHost(value) {
  const host = String(value || '').trim();
  if (!/^[A-Za-z0-9_.:-]+$/.test(host)) {
    throw Object.assign(new Error('本机对外地址不合法'), { statusCode: 400 });
  }
  return host;
}

function splitRcloneTarget(value) {
  const input = String(value || '').trim();
  const match = input.match(/^([A-Za-z0-9_.-]+):(.*)$/);
  if (!match) {
    throw Object.assign(new Error('复制目标格式应为 remote:/path'), { statusCode: 400 });
  }
  return {
    remote: match[1],
    path: normalizeRemotePath(match[2] || ''),
  };
}

function assertGid(value) {
  const gid = String(value || '');
  if (!/^[0-9a-fA-F]+$/.test(gid)) {
    throw Object.assign(new Error('任务编号不合法'), { statusCode: 400 });
  }
  return gid;
}

function safeArchiveBaseName(value) {
  const cleaned = String(value || 'folder')
    .replace(/[\\/:"*?<>|\x00-\x1f]/g, '_')
    .replace(/^\.+$/, 'folder')
    .trim()
    .slice(0, 96);
  return cleaned || 'folder';
}

function once(fn) {
  let called = false;
  return (...args) => {
    if (called) return undefined;
    called = true;
    return fn(...args);
  };
}

function joinRemotePath(parentPath, name) {
  return normalizeRemotePath([parentPath, name].filter(Boolean).join('/'));
}

function encodeRemotePath(remotePath) {
  return normalizeRemotePath(remotePath)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function redactUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.username) parsed.username = '***';
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return url;
  }
}

function sortItems(a, b) {
  if (a.IsDir !== b.IsDir) return a.IsDir ? -1 : 1;
  return String(a.Name || '').localeCompare(String(b.Name || ''), 'zh-Hans-CN');
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
    }[ext] || 'application/octet-stream'
  );
}

async function listen(address) {
  const server = http.createServer(requestHandler);
  return new Promise((resolve) => {
    server.once('error', (error) => {
      console.error(`listen ${address}:${port} failed: ${error.message}`);
      resolve(null);
    });
    server.listen(port, address, () => {
      console.log(`LAN Transfer Panel listening on http://${address}:${port}/`);
      resolve(server);
    });
  });
}

const servers = (await Promise.all([...new Set(bindAddresses)].map(listen))).filter(Boolean);
if (!servers.length) {
  console.error('No listen address is available.');
  process.exit(1);
}
