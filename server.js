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
import { Readable } from 'node:stream';
import { buildLocalAria2Download } from './lib/aria2-download.js';
import { chooseFolderDownloadPlan } from './lib/folder-plan.js';
import { createFolderPlanCache } from './lib/folder-plan-cache.js';
import { getFolderDownloadWorkOrder } from './lib/folder-download-order.js';
import {
  loadPostDownloadJobs,
  postDownloadJobsStorePath,
  savePostDownloadJobs,
} from './lib/post-download-store.js';
import { publicFolderPlan } from './lib/public-folder-plan.js';
import { buildSshArchiveScript } from './lib/ssh-archive-script.js';
import { normalizeSshRemotePath } from './lib/ssh-paths.js';
import { encodeSshPythonArg, encodeSshRemotePath } from './lib/ssh-python-args.js';
import {
  buildPythonRangeServeScript,
  buildRcloneServeArgs,
  buildSshServedFileDownload,
  buildSshTunnelArgs,
} from './lib/ssh-source.js';
import { buildCorsHeaders } from './lib/cors.js';

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
const sshServedDirectories = new Map();
const sshTunnels = new Map();
const postDownloadJobs = new Map();
const folderPlanCache = createFolderPlanCache();
const serveTtlMs = 2 * 60 * 60 * 1000;

const runtime = await loadRuntime();
const postDownloadStorePath = postDownloadJobsStorePath(path.dirname(runtime.aria2ConfPath));
for (const [gid, job] of await loadPostDownloadJobs(postDownloadStorePath)) {
  postDownloadJobs.set(gid, job);
}

setInterval(() => {
  const now = Date.now();
  for (const [sid, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(sid);
  }
  for (const [key, served] of servedRemotes) {
    if (served.expiresAt <= now) stopServedRemote(key);
  }
  for (const [key, served] of sshServedDirectories) {
    if (served.expiresAt <= now) stopSshServedDirectory(key);
  }
  for (const [key, tunnel] of sshTunnels) {
    if (tunnel.expiresAt <= now) stopSshTunnel(key);
  }
}, 10 * 60 * 1000).unref();

let postDownloadMonitorRunning = false;
setInterval(() => {
  monitorPostDownloadJobs().catch((error) => {
    console.error(`post download monitor: ${error.message}`);
  });
}, 3000).unref();

async function loadRuntime() {
  const rcloneCredentialsPath = expandHome(
    process.env.RCLONE_CREDENTIALS || '~/.config/file-transfer/rclone-rc.credentials',
  );
  const aria2ConfPath = expandHome(process.env.ARIA2_CONF || '~/.config/file-transfer/aria2.conf');

  const rcloneCredentials = parseKeyValue(await readTextIfExists(rcloneCredentialsPath));
  const aria2Config = parseKeyValue(await readTextIfExists(aria2ConfPath));

  const rcloneUrl = stripTrailingSlash(process.env.RCLONE_URL || rcloneCredentials.url || '');
  const rcloneUser = process.env.RCLONE_USER || rcloneCredentials.username;
  const rclonePass = process.env.RCLONE_PASS || rcloneCredentials.password;
  const aria2Url = process.env.ARIA2_URL || 'http://127.0.0.1:6800/jsonrpc';
  const aria2Secret = process.env.ARIA2_SECRET || aria2Config['rpc-secret'] || '';
  const aria2Dir = process.env.ARIA2_DIR || aria2Config.dir || '';
  const sshHost = process.env.SSH_HOST || 'yufanssh';
  const sshRoot = process.env.SSH_ROOT || '/home/yufan';
  const sshRemoteName = process.env.SSH_REMOTE_NAME || 'server';
  const sshCommand = process.env.SSH_COMMAND || 'ssh';

  const hasRcloneRc = Boolean(rcloneUrl && rcloneUser && rclonePass);
  const appUser = process.env.PANEL_USER || rcloneUser || os.userInfo().username || 'admin';
  const appPass = process.env.PANEL_PASS || rclonePass;
  if (!appPass) {
    throw new Error('PANEL_PASS is required when local rclone credentials are not configured');
  }

  return {
    rcloneCredentialsPath,
    aria2ConfPath,
    rcloneUrl,
    rcloneUser,
    rclonePass,
    hasRcloneRc,
    aria2Url,
    aria2Secret,
    aria2Dir,
    sshHost,
    sshRoot,
    sshRemoteName,
    sshCommand,
    appUser,
    appPass,
  };
}

async function readTextIfExists(filePath) {
  try {
    return await fsp.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
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

function applyCors(req, res) {
  const headers = buildCorsHeaders(req.headers.origin, process.env.PANEL_CORS_ORIGINS);
  for (const [name, value] of Object.entries(headers)) {
    res.setHeader(name, value);
  }
}

function sendNoContent(res) {
  res.writeHead(204, {
    'Cache-Control': 'no-store',
    'Content-Length': 0,
  });
  res.end();
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
    applyCors(req, res);
    if (req.method === 'OPTIONS') {
      sendNoContent(res);
      return;
    }

    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (requestUrl.pathname.startsWith('/api/')) {
      await handleApi(req, res, requestUrl);
      return;
    }
    await serveStatic(req, res, requestUrl);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      sendError(res, error.statusCode || 500, error.message || '服务器错误', error.detail);
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
      rcloneUrl: runtime.rcloneUrl ? runtime.rcloneUrl.replace(/\/\/.*@/, '//***@') : null,
      aria2Dir: runtime.aria2Dir,
      sshHost: runtime.sshHost,
      sshRoot: runtime.sshRoot,
      sshRemoteName: runtime.sshRemoteName,
      bindAddresses,
      port,
    });
    return;
  }

  if (endpoint === '/api/remotes' && req.method === 'GET') {
    const remotes = [runtime.sshRemoteName];
    if (!runtime.hasRcloneRc) {
      sendJson(res, 200, { remotes });
      return;
    }
    const result = await rcloneRc('config/listremotes', {});
    remotes.push(...(result.remotes || []).map((remote) => String(remote).replace(/:$/, '')));
    sendJson(res, 200, {
      remotes: [...new Set(remotes)],
    });
    return;
  }

  if (endpoint === '/api/list' && req.method === 'GET') {
    const remote = assertRemote(requestUrl.searchParams.get('remote'));
    if (isSshRemote(remote)) {
      const remotePath = normalizeSshRemotePath(requestUrl.searchParams.get('path') || '');
      const result = await listSshFiles(remotePath);
      sendJson(res, 200, { remote, path: remotePath, list: result.list.sort(sortItems) });
      return;
    }
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

  if (
    (endpoint === '/api/downloads/add-remote' || endpoint === '/api/aria2/add-remote') &&
    req.method === 'POST'
  ) {
    const body = await readJson(req);
    const remote = assertRemote(body.remote);
    const result = isSshRemote(remote)
      ? await addSshFileToLocalAria2(body)
      : await addRcloneFileToLocalAria2(body);
    sendJson(res, 200, result);
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
  if (!runtime.hasRcloneRc) {
    throw Object.assign(new Error('本机未配置 rclone RC；当前默认使用服务器 SSH 文件源'), {
      statusCode: 400,
    });
  }
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
      params: secret ? [`token:${secret}`, ...params] : params,
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

async function addSshFileToLocalAria2(body) {
  const remotePath = normalizeSshRemotePath(body.path || '');
  if (!remotePath) throw Object.assign(new Error('缺少文件路径'), { statusCode: 400 });

  const stat = await statSshPath(remotePath);
  if (stat.item.IsDir) {
    return addSshFolderToLocalAria2(remotePath, stat.item, body);
  }

  const served = await ensureSshServedDirectory(stat.item.ParentPath);
  const tunnel = await ensureSshTunnel(served.port);
  const request = buildSshServedFileDownload({
    stat: stat.item,
    localPort: tunnel.localPort,
    dir: body.dir,
  });
  await waitForHttpSource(request.url, 8000);
  const gid = await aria2('aria2.addUri', request.params);

  return {
    ok: true,
    route: 'ssh-rclone-serve',
    gid,
    sourceUrl: request.url,
    sshHost: runtime.sshHost,
    sourceBackend: served.backend,
    servePort: served.port,
    tunnelPort: tunnel.localPort,
    expiresAt: new Date(Math.min(served.expiresAt, tunnel.expiresAt)).toISOString(),
    out: request.options.out,
    dir: request.options.dir || null,
  };
}

async function addSshFolderToLocalAria2(remotePath, item, body) {
  let summary;
  let plan;
  const planToken = typeof body.planToken === 'string' ? body.planToken : '';
  const cached = body.confirmed
    ? folderPlanCache.take(planToken, { remote: body.remote, remotePath })
    : null;
  if (cached) {
    summary = cached.summary;
    plan = cached.plan;
  } else {
    if (body.confirmed && planToken) {
      throw Object.assign(new Error('目录下载计划已过期，请重新确认下载'), { statusCode: 409 });
    }
    summary = await summarizeSshFolder(remotePath);
    plan = chooseFolderDownloadPlan(summary);
  }
  if (plan.requiresFullListing) {
    throw Object.assign(new Error('目录文件列表过大，无法安全生成下载计划'), { statusCode: 400 });
  }
  if (plan.requiresConfirmation && !body.confirmed) {
    const token = folderPlanCache.put({
      remote: body.remote,
      remotePath,
      summary,
      plan,
    });
    return {
      ok: true,
      requiresConfirmation: true,
      planToken: token,
      strategy: plan.strategy,
      plan: publicFolderPlan(plan),
      summary: publicFolderSummary(summary),
    };
  }

  if (plan.strategy === 'archive-small-files') {
    return addSshFolderArchiveToLocalAria2(summary, body, plan, plan.archive.files);
  }
  if (plan.strategy === 'mixed') {
    return addSshFolderMixedToLocalAria2(summary, body, plan);
  }
  return addSshFolderFilesToLocalAria2(summary, body, plan.direct.files);
}

async function addSshFolderFilesToLocalAria2(summary, body, files = summary.files) {
  if (!files?.length) {
    throw Object.assign(new Error('文件夹内没有可下载文件'), { statusCode: 400 });
  }

  const served = await ensureSshServedDirectory(summary.item.AbsolutePath);
  const tunnel = await ensureSshTunnel(served.port);
  const origin = `http://127.0.0.1:${tunnel.localPort}`;
  const firstUrl = `${origin}/${encodeRemotePath(files[0].RelPath)}`;
  await waitForHttpSource(firstUrl, 8000);

  const gids = [];
  for (const file of files) {
    const url = `${origin}/${encodeRemotePath(file.RelPath)}`;
    const options = folderFileAria2Options(
      safeAria2RelativeOut(joinRemotePath(summary.item.Name, file.RelPath)),
      body.dir,
    );
    const gid = await aria2('aria2.addUri', [[url], options]);
    gids.push(gid);
  }

  return {
    ok: true,
    route: 'ssh-folder-files',
    strategy: 'files',
    gids,
    count: gids.length,
    summary: publicFolderSummary(summary),
    sshHost: runtime.sshHost,
    sourceBackend: served.backend,
    servePort: served.port,
    tunnelPort: tunnel.localPort,
    expiresAt: new Date(Math.min(served.expiresAt, tunnel.expiresAt)).toISOString(),
  };
}

async function addSshFolderMixedToLocalAria2(summary, body, plan) {
  const results = {};
  for (const batch of getFolderDownloadWorkOrder(plan)) {
    if (batch === 'archive') {
      results.archive = await addSshFolderArchiveToLocalAria2(summary, body, plan, plan.archive.files);
    }
    if (batch === 'direct') {
      results.direct = await addSshFolderFilesToLocalAria2(summary, body, plan.direct.files);
    }
  }

  return {
    ok: true,
    route: 'ssh-folder-mixed',
    strategy: 'mixed',
    plan: publicFolderPlan(plan),
    summary: publicFolderSummary(summary),
    direct: results.direct || null,
    archive: results.archive || null,
    count: Number(results.direct?.count || 0) + Number(results.archive?.gid ? 1 : 0),
  };
}

async function addSshFolderArchiveToLocalAria2(summary, body, plan, files = summary.files) {
  if (!files?.length) {
    throw Object.assign(new Error('没有可打包的小文件'), { statusCode: 400 });
  }
  const compression = body.compression === 'gzip' ? 'gzip' : 'none';
  const archive = await createSshFolderArchive(summary.item, compression, files);
  const served = await ensureSshServedDirectory(path.posix.dirname(archive.remotePath));
  const tunnel = await ensureSshTunnel(served.port);
  const url = `http://127.0.0.1:${tunnel.localPort}/${encodeRemotePath(path.posix.basename(archive.remotePath))}`;
  await waitForHttpSource(url, 8000);
  const options = folderFileAria2Options(archive.fileName, body.dir || runtime.aria2Dir);
  const gid = await aria2('aria2.addUri', [[url], options]);
  await rememberPostDownloadJob(gid, {
    type: 'extract-archive',
    gid,
    archiveFileName: archive.fileName,
    remoteArchivePath: archive.remotePath,
    extractDir: options.dir || null,
    createdAt: Date.now(),
    status: 'waiting',
  });

  return {
    ok: true,
    route: 'ssh-folder-archive',
    strategy: 'archive',
    gid,
    plan: publicFolderPlan(plan),
    summary: publicFolderSummary(summary),
    compression,
    sourceUrl: url,
    sshHost: runtime.sshHost,
    sourceBackend: served.backend,
    servePort: served.port,
    tunnelPort: tunnel.localPort,
    expiresAt: new Date(Math.min(served.expiresAt, tunnel.expiresAt)).toISOString(),
    out: options.out,
    dir: options.dir || null,
    postAction: 'extract-delete-archive',
  };
}

async function addRcloneFileToLocalAria2(body) {
  const remote = assertRemote(body.remote);
  const remotePath = normalizeRemotePath(body.path || '');
  if (!remotePath) throw Object.assign(new Error('缺少文件路径'), { statusCode: 400 });

  const stat = await rcloneRc('operations/stat', {
    fs: `${remote}:`,
    remote: remotePath,
    opt: { filesOnly: true },
  });
  if (!stat.item || stat.item.IsDir) {
    throw Object.assign(new Error('只能下载文件'), { statusCode: 400 });
  }

  const served = await ensureServedRemote(remote, '127.0.0.1');
  const request = buildLocalAria2Download({
    servedOrigin: served.origin,
    remotePath,
    item: stat.item,
    dir: body.dir,
  });
  const gid = await aria2('aria2.addUri', request.params);

  return {
    ok: true,
    route: 'local-aria2',
    gid,
    sourceUrl: redactUrl(request.url),
    servePort: served.port,
    expiresAt: new Date(served.expiresAt).toISOString(),
    out: request.options.out,
    dir: request.options.dir || null,
  };
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

function isSshRemote(remote) {
  return remote === runtime.sshRemoteName;
}

async function listSshFiles(remotePath) {
  return runSshPythonJson('list', normalizeSshRemotePath(remotePath));
}

async function statSshPath(remotePath) {
  return runSshPythonJson('stat', normalizeSshRemotePath(remotePath));
}

async function summarizeSshFolder(remotePath) {
  return runSshPythonJson('summary', normalizeSshRemotePath(remotePath));
}

async function runSshPythonJson(mode, remotePath) {
  const root = encodeSshPythonArg(runtime.sshRoot);
  const requested = encodeSshRemotePath(remotePath);
  const result = await runCommand(
    runtime.sshCommand,
    sshBaseArgs('python3', '-', root, requested, mode),
    {
      input: sshFsScript(),
      timeoutMs: mode === 'summary' ? 120000 : 20000,
    },
  );
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw Object.assign(new Error('服务器返回的文件列表不是合法 JSON'), {
      statusCode: 502,
      detail: JSON.stringify({
        mode,
        remotePath,
        parseError: error.message,
        stdoutLength: result.stdout.length,
        stdoutHead: result.stdout.slice(0, 500),
        stdoutTail: result.stdout.slice(-500),
      }),
    });
  }
}

async function ensureSshServedDirectory(directory) {
  const key = `${runtime.sshHost}|${directory}`;
  const existing = sshServedDirectories.get(key);
  if (existing && existing.expiresAt > Date.now()) {
    existing.expiresAt = Date.now() + serveTtlMs;
    return existing;
  }

  const portNumber = await pickRemoteServePort();
  const rcloneArgs = buildRcloneServeArgs({ directory, port: portNumber });
  const logPath = `/tmp/lan-transfer-rclone-${crypto
    .createHash('sha256')
    .update(`${key}|${portNumber}`)
    .digest('hex')
    .slice(0, 16)}.log`;
  const helperPath = `/tmp/lan-transfer-range-${crypto
    .createHash('sha256')
    .update(`${directory}|${portNumber}`)
    .digest('hex')
    .slice(0, 16)}.py`;
  const commandLine = ['rclone', ...rcloneArgs].map(shellQuote).join(' ');
  const script = [
    'set -eu',
    'if command -v rclone >/dev/null 2>&1; then',
    `nohup ${commandLine} > ${shellQuote(logPath)} 2>&1 < /dev/null &`,
    'echo rclone:$!',
    'else',
    buildPythonRangeServeScript({
      helperPath,
      directory,
      port: portNumber,
      logPath,
    }),
    'fi',
  ].join('\n');
  const result = await runCommand(runtime.sshCommand, sshBaseArgs('sh', '-s'), {
    input: script,
    timeoutMs: 10000,
  });
  const match = result.stdout.trim().match(/(rclone|python):(\d+)/);
  const backend = match?.[1] || 'unknown';
  const pid = Number(match?.[2]);
  if (!Number.isInteger(pid) || pid <= 0) {
    throw Object.assign(new Error('服务器 HTTP 下载源启动失败'), {
      statusCode: 502,
      detail: result.stdout,
    });
  }

  const served = {
    host: runtime.sshHost,
    directory,
    port: portNumber,
    pid,
    backend,
    logPath,
    expiresAt: Date.now() + serveTtlMs,
  };
  sshServedDirectories.set(key, served);
  return served;
}

async function ensureSshTunnel(remotePort) {
  const key = `${runtime.sshHost}|${remotePort}`;
  const existing = sshTunnels.get(key);
  if (existing && existing.child.exitCode === null) {
    existing.expiresAt = Date.now() + serveTtlMs;
    return existing;
  }

  const localPort = await allocatePort('127.0.0.1');
  const args = buildSshTunnelArgs({
    host: runtime.sshHost,
    localPort,
    remotePort,
  });
  const child = spawn(runtime.sshCommand, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', (chunk) => {
    console.error(`ssh tunnel ${runtime.sshHost}:${remotePort}: ${chunk.toString().trim()}`);
  });
  child.on('exit', () => {
    const current = sshTunnels.get(key);
    if (current?.child === child) sshTunnels.delete(key);
  });
  await waitForTcp('127.0.0.1', localPort, 5000);

  const tunnel = {
    child,
    host: runtime.sshHost,
    remotePort,
    localPort,
    expiresAt: Date.now() + serveTtlMs,
  };
  sshTunnels.set(key, tunnel);
  return tunnel;
}

async function createSshFolderArchive(item, compression, files = []) {
  const archiveBase = `${safeArchiveBaseName(item.Name)}-${Date.now().toString(36)}-${crypto
    .randomBytes(3)
    .toString('hex')}`;
  const extension = compression === 'gzip' ? 'tar.gz' : 'tar';
  const fileName = `${archiveBase}.${extension}`;
  const remotePath = `/tmp/${fileName}`;
  const listPath = `/tmp/${archiveBase}.files`;
  const script = buildSshArchiveScript({
    parentPath: item.ParentPath,
    folderName: item.Name,
    remotePath,
    listPath,
    compression,
    files,
  });
  const result = await runCommand(runtime.sshCommand, sshBaseArgs('sh', '-s'), {
    input: script,
    timeoutMs: 30 * 60 * 1000,
  });
  const size = Number(result.stdout.trim().split(/\s+/).pop() || 0);
  return {
    fileName,
    remotePath,
    compression,
    size,
  };
}

async function rememberPostDownloadJob(gid, job) {
  postDownloadJobs.set(gid, job);
  await persistPostDownloadJobs();
}

async function forgetPostDownloadJob(gid) {
  postDownloadJobs.delete(gid);
  await persistPostDownloadJobs();
}

async function persistPostDownloadJobs() {
  await savePostDownloadJobs(postDownloadStorePath, postDownloadJobs).catch((error) => {
    console.error(`post job store: ${error.message}`);
  });
}

async function monitorPostDownloadJobs() {
  if (postDownloadMonitorRunning || !postDownloadJobs.size) return;
  postDownloadMonitorRunning = true;
  try {
    for (const [gid, job] of postDownloadJobs) {
      if (job.status === 'error') continue;
      if (job.status === 'running') continue;
      const task = await aria2('aria2.tellStatus', [
        gid,
        ['gid', 'status', 'dir', 'files', 'errorMessage'],
      ]).catch((error) => {
        console.error(`post job ${gid}: ${error.message}`);
        return null;
      });
      if (!task) continue;
      if (task.status === 'error' || task.status === 'removed') {
        job.status = task.status;
        job.errorMessage = task.errorMessage || task.status;
        await persistPostDownloadJobs();
        continue;
      }
      if (task.status !== 'complete') continue;
      job.status = 'running';
      delete job.errorMessage;
      await persistPostDownloadJobs();
      await runArchivePostAction(job, task).catch((error) => {
        job.status = 'error';
        job.errorMessage = error.message;
        console.error(`post job ${gid}: ${error.message}`);
      });
      if (job.status !== 'error') {
        await forgetPostDownloadJob(gid);
      } else {
        await persistPostDownloadJobs();
      }
    }
  } finally {
    postDownloadMonitorRunning = false;
  }
}

async function runArchivePostAction(job, task) {
  const firstFile = task.files?.[0];
  const archivePath = firstFile?.path || path.join(job.extractDir || task.dir || '', job.archiveFileName);
  if (!archivePath) throw new Error('找不到本地归档文件路径');
  const extractDir = job.extractDir || task.dir || path.dirname(archivePath);
  await fsp.mkdir(extractDir, { recursive: true });
  await runCommand('tar', ['-xf', archivePath, '-C', extractDir], {
    timeoutMs: 60 * 60 * 1000,
  });
  await fsp.rm(archivePath, { force: true });
  if (job.remoteArchivePath) {
    await runCommand(runtime.sshCommand, sshBaseArgs('rm', '-f', job.remoteArchivePath), {
      timeoutMs: 10000,
    }).catch((error) => {
      console.error(`remote archive cleanup: ${error.message}`);
    });
  }
}

function stopSshServedDirectory(key) {
  const served = sshServedDirectories.get(key);
  if (!served) return;
  sshServedDirectories.delete(key);
  if (Number.isInteger(served.pid) && served.pid > 0) {
    runCommand(runtime.sshCommand, sshBaseArgs('kill', String(served.pid)), { timeoutMs: 5000 }).catch(
      () => {},
    );
  }
}

function stopSshTunnel(key) {
  const tunnel = sshTunnels.get(key);
  if (!tunnel) return;
  tunnel.child.kill('SIGTERM');
  sshTunnels.delete(key);
}

async function pickRemoteServePort() {
  if (process.env.SSH_REMOTE_PORT) return Number(process.env.SSH_REMOTE_PORT);
  return 18000 + crypto.randomInt(20000);
}

async function waitForHttpSource(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) return;
    } catch {
      // Retry until the SSH tunnel and server-side rclone have both opened.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw Object.assign(new Error('服务器 HTTP 下载源启动超时'), { statusCode: 502 });
}

function sshBaseArgs(...remoteArgs) {
  return ['-o', 'BatchMode=yes', runtime.sshHost, ...remoteArgs];
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function sshFsScript() {
  return `
import base64
import datetime
import json
import mimetypes
import os
import pathlib
import sys

def decode(value):
    return base64.b64decode(value.encode("ascii")).decode("utf-8")

root = pathlib.Path(decode(sys.argv[1])).expanduser().resolve()
requested = decode(sys.argv[2])
mode = sys.argv[3]

def resolve_target(value):
    if value.startswith("/"):
        target = pathlib.Path(value).expanduser().resolve()
    else:
        target = (root / value).resolve()
        try:
            common = os.path.commonpath([str(root), str(target)])
        except ValueError:
            raise SystemExit("path is outside root")
        if common != str(root):
            raise SystemExit("path is outside root")
    return target

def item_for(target):
    st = target.stat()
    try:
        common = os.path.commonpath([str(root), str(target)])
    except ValueError:
        common = ""
    if common == str(root):
        rel = os.path.relpath(target, root)
        if rel == ".":
            rel = ""
        rel = rel.replace(os.sep, "/")
    else:
        rel = str(target)
    is_dir = target.is_dir()
    return {
        "Name": target.name if rel else root.name,
        "Path": rel,
        "IsDir": is_dir,
        "Size": 0 if is_dir else st.st_size,
        "ModTime": datetime.datetime.fromtimestamp(st.st_mtime, datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        "MimeType": "" if is_dir else (mimetypes.guess_type(target.name)[0] or ""),
        "ParentPath": str(target.parent),
        "AbsolutePath": str(target),
    }

def list_items(target):
    items = []
    for child in target.iterdir():
        try:
            items.append(item_for(child))
        except OSError:
            continue
    return items

target = resolve_target(requested)
if mode == "stat":
    print(json.dumps({"item": item_for(target)}, ensure_ascii=False))
elif mode == "list":
    if not target.is_dir():
        raise SystemExit("path is not a directory")
    print(json.dumps({"list": list_items(target)}, ensure_ascii=False))
elif mode == "summary":
    if not target.is_dir():
        raise SystemExit("path is not a directory")
    files = []
    file_count = 0
    dir_count = 0
    total_size = 0
    for current, dirs, names in os.walk(target):
        dir_count += len(dirs)
        for name in names:
            file_path = pathlib.Path(current) / name
            try:
                st = file_path.stat()
            except OSError:
                continue
            if not file_path.is_file():
                continue
            file_count += 1
            total_size += st.st_size
            rel = os.path.relpath(file_path, target).replace(os.sep, "/")
            files.append({
                "Name": file_path.name,
                "RelPath": rel,
                "Size": st.st_size,
                "ModTime": datetime.datetime.fromtimestamp(st.st_mtime, datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
                "MimeType": mimetypes.guess_type(file_path.name)[0] or "",
                "AbsolutePath": str(file_path),
            })
    print(json.dumps({
        "item": item_for(target),
        "fileCount": file_count,
        "dirCount": dir_count,
        "totalSize": total_size,
        "files": files,
        "filesTruncated": False,
    }, ensure_ascii=False))
else:
    raise SystemExit("unsupported mode")
`;
}

function sshCatScript() {
  return `
import base64
import os
import pathlib
import shutil
import sys

def decode(value):
    return base64.b64decode(value.encode("ascii")).decode("utf-8")

root = pathlib.Path(decode(sys.argv[1])).expanduser().resolve()
requested = decode(sys.argv[2])
target = (root / requested).resolve()
if requested.startswith("/"):
    target = pathlib.Path(requested).expanduser().resolve()
else:
    target = (root / requested).resolve()
    try:
        common = os.path.commonpath([str(root), str(target)])
    except ValueError:
        raise SystemExit("path is outside root")
    if common != str(root):
        raise SystemExit("path is outside root")
if not target.is_file():
    raise SystemExit("path is not a file")
with target.open("rb") as source:
    shutil.copyfileobj(source, sys.stdout.buffer)
`;
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

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.input === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timer = null;
    const done = once((error, result) => {
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    });
    if (options.timeoutMs) {
      timer = setTimeout(() => {
        child.kill('SIGTERM');
        done(
          Object.assign(new Error(`${command} timed out after ${options.timeoutMs}ms`), {
            statusCode: 502,
          }),
        );
      }, options.timeoutMs);
    }
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => done(error));
    child.on('close', (code) => {
      if (code === 0) {
        done(null, { stdout, stderr });
      } else {
        done(
          Object.assign(new Error(stderr.trim() || stdout.trim() || `${command} exited with ${code}`), {
            statusCode: 502,
          }),
        );
      }
    });
    if (options.input !== undefined) {
      child.stdin.end(options.input);
    }
  });
}

async function handleDownload(req, res, requestUrl) {
  const remote = assertRemote(requestUrl.searchParams.get('remote'));
  const remotePath = isSshRemote(remote)
    ? normalizeSshRemotePath(requestUrl.searchParams.get('path') || '')
    : normalizeRemotePath(requestUrl.searchParams.get('path') || '');
  if (!remotePath) throw Object.assign(new Error('缺少文件路径'), { statusCode: 400 });

  await handleDownloadForRemotePath(req, res, remote, remotePath);
}

async function handleDownloadForRemotePath(req, res, remote, remotePath) {
  if (isSshRemote(remote)) {
    await handleSshDownload(req, res, remotePath);
    return;
  }

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

async function handleSshDownload(req, res, remotePath) {
  const stat = await statSshPath(remotePath);
  if (!stat.item || stat.item.IsDir) {
    throw Object.assign(new Error('只能下载文件'), { statusCode: 400 });
  }

  const root = encodeSshPythonArg(runtime.sshRoot);
  const requested = encodeSshRemotePath(remotePath);
  const child = spawn(runtime.sshCommand, sshBaseArgs('python3', '-', root, requested), {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdin.end(sshCatScript());

  const filename = encodeURIComponent(stat.item.Name || path.posix.basename(remotePath));
  res.writeHead(200, {
    'Content-Type': stat.item.MimeType || 'application/octet-stream',
    'Content-Length': stat.item.Size,
    'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    'Cache-Control': 'no-store',
  });

  child.stdout.pipe(res);
  child.stderr.on('data', (chunk) => {
    console.error(`ssh cat ${runtime.sshHost}: ${chunk.toString().trim()}`);
  });
  req.on('close', () => child.kill('SIGTERM'));
  child.on('error', (error) => res.destroy(error));
}

async function handleDownloadFolder(req, res, requestUrl) {
  const remote = assertRemote(requestUrl.searchParams.get('remote'));
  const remotePath = isSshRemote(remote)
    ? normalizeSshRemotePath(requestUrl.searchParams.get('path') || '')
    : normalizeRemotePath(requestUrl.searchParams.get('path') || '');
  if (!remotePath) throw Object.assign(new Error('缺少文件夹路径'), { statusCode: 400 });

  if (isSshRemote(remote)) {
    await handleSshDownloadFolder(req, res, remotePath);
    return;
  }

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

async function handleSshDownloadFolder(req, res, remotePath) {
  const summary = await summarizeSshFolder(remotePath);
  if (!summary.item?.IsDir) {
    throw Object.assign(new Error('只能打包下载文件夹'), { statusCode: 400 });
  }
  if (!summary.files?.length) {
    throw Object.assign(new Error('文件夹内没有可下载文件'), { statusCode: 400 });
  }

  const archive = await createSshFolderArchive(summary.item, 'gzip', summary.files);
  const served = await ensureSshServedDirectory(path.posix.dirname(archive.remotePath));
  const tunnel = await ensureSshTunnel(served.port);
  const url = `http://127.0.0.1:${tunnel.localPort}/${encodeRemotePath(path.posix.basename(archive.remotePath))}`;
  await waitForHttpSource(url, 8000);

  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw Object.assign(new Error('服务器归档下载源不可用'), { statusCode: 502 });
  }

  const filename = encodeURIComponent(archive.fileName);
  res.writeHead(200, {
    'Content-Type': 'application/gzip',
    ...(archive.size ? { 'Content-Length': archive.size } : {}),
    'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    'Cache-Control': 'no-store',
  });

  const cleanup = once(() => {
    runCommand(runtime.sshCommand, sshBaseArgs('rm', '-f', archive.remotePath), {
      timeoutMs: 10000,
    }).catch((error) => {
      console.error(`remote archive cleanup: ${error.message}`);
    });
  });
  req.on('close', cleanup);
  res.on('finish', cleanup);
  Readable.fromWeb(response.body).on('error', (error) => res.destroy(error)).pipe(res);
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

function folderFileAria2Options(out, dir) {
  const options = {
    out,
    continue: 'true',
    split: '16',
    'max-connection-per-server': '16',
    'min-split-size': '20M',
    'auto-file-renaming': 'false',
    'allow-overwrite': 'false',
  };
  if (dir) options.dir = String(dir);
  return options;
}

function safeAria2RelativeOut(value) {
  const normalized = normalizeRemotePath(value);
  const cleaned = normalized
    .split('/')
    .map((segment) =>
      segment
        .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
        .replace(/^\.+$/, '_')
        .trim(),
    )
    .filter(Boolean)
    .join('/');
  if (!cleaned) throw Object.assign(new Error('输出路径不合法'), { statusCode: 400 });
  return cleaned.slice(0, 240);
}

function publicFolderSummary(summary) {
  return {
    name: summary.item?.Name || '',
    path: summary.item?.Path || '',
    fileCount: Number(summary.fileCount || 0),
    dirCount: Number(summary.dirCount || 0),
    totalSize: Number(summary.totalSize || 0),
    filesTruncated: Boolean(summary.filesTruncated),
  };
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
