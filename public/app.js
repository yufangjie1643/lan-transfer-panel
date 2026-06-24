const state = {
  remotes: [],
  remote: 'data',
  path: '',
  files: [],
  sendSettings: loadSendSettings(),
  tasksTimer: null,
  statsTimer: null,
};

const $ = (selector) => document.querySelector(selector);

const loginView = $('#loginView');
const appView = $('#appView');
const loginForm = $('#loginForm');
const loginError = $('#loginError');
const remoteList = $('#remoteList');
const fileRows = $('#fileRows');
const emptyState = $('#emptyState');
const breadcrumb = $('#breadcrumb');
const pathHint = $('#pathHint');
const message = $('#message');
const taskRows = $('#taskRows');
const statusBadge = $('#statusBadge');

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  const form = new FormData(loginForm);
  try {
    await api('/api/login', {
      method: 'POST',
      body: {
        username: form.get('username'),
        password: form.get('password'),
      },
      skipAuthRedirect: true,
    });
    await boot();
  } catch (error) {
    loginError.textContent = error.message;
    loginError.hidden = false;
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  stopTimers();
  appView.hidden = true;
  loginView.hidden = false;
});

$('#reloadRemotesBtn').addEventListener('click', loadRemotes);
$('#refreshFilesBtn').addEventListener('click', loadFiles);
$('#refreshTasksBtn').addEventListener('click', loadTasks);
$('#refreshAllBtn').addEventListener('click', async () => {
  await Promise.allSettled([loadRemotes(), loadFiles(), loadTasks(), loadStats()]);
});

$('#mkdirBtn').addEventListener('click', async () => {
  const name = window.prompt('文件夹名称');
  if (!name) return;
  try {
    await api('/api/mkdir', {
      method: 'POST',
      body: { remote: state.remote, path: state.path, name },
    });
    showMessage(`已创建：${name}`);
    await loadFiles();
  } catch (error) {
    showMessage(error.message, true);
  }
});

$('#uploadBtn').addEventListener('click', () => $('#fileInput').click());

$('#fileInput').addEventListener('change', async (event) => {
  const files = [...event.target.files];
  if (!files.length) return;
  for (const file of files) {
    try {
      showMessage(`正在上传：${file.name}`);
      const params = new URLSearchParams({
        remote: state.remote,
        path: state.path,
        name: file.name,
      });
      const response = await fetch(`/api/upload?${params}`, {
        method: 'PUT',
        body: file,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `上传失败：${file.name}`);
    } catch (error) {
      showMessage(error.message, true);
      event.target.value = '';
      return;
    }
  }
  event.target.value = '';
  showMessage(`上传完成：${files.length} 个文件`);
  await loadFiles();
});

$('#downloadForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = $('#downloadUrl').value.trim();
  if (!url) return;
  try {
    const result = await api('/api/aria2/add', {
      method: 'POST',
      body: { url },
    });
    $('#downloadUrl').value = '';
    showMessage(`aria2 任务已添加：${result.gid}`);
    await loadTasks();
    if (state.remote === 'aria2') await loadFiles();
  } catch (error) {
    showMessage(error.message, true);
  }
});

$('#sendSettingsForm').addEventListener('submit', (event) => {
  event.preventDefault();
  state.sendSettings = readSendSettings();
  localStorage.setItem('lanTransferPanel.sendSettings', JSON.stringify(state.sendSettings));
  showMessage('发送策略已保存');
});

async function boot() {
  await api('/api/session');
  loginView.hidden = true;
  appView.hidden = false;
  fillSendSettings();
  await loadRemotes();
  if (!state.remotes.includes(state.remote)) state.remote = state.remotes[0] || 'home';
  state.path = '';
  await Promise.allSettled([loadFiles(), loadTasks(), loadStats()]);
  stopTimers();
  state.tasksTimer = setInterval(loadTasks, 5000);
  state.statsTimer = setInterval(loadStats, 3000);
}

async function loadRemotes() {
  const data = await api('/api/remotes');
  state.remotes = data.remotes || [];
  renderRemotes();
}

async function loadFiles() {
  setStatus('加载中');
  const params = new URLSearchParams({ remote: state.remote, path: state.path });
  const data = await api(`/api/list?${params}`);
  state.files = data.list || [];
  renderBreadcrumb();
  renderFiles();
  setStatus('已连接');
}

async function loadTasks() {
  const data = await api('/api/aria2/tasks');
  renderTasks(data);
}

async function loadStats() {
  const [rclone, aria2] = await Promise.allSettled([
    api('/api/rclone/stats'),
    api('/api/aria2/tasks'),
  ]);

  if (rclone.status === 'fulfilled') {
    $('#rcloneSpeed').textContent = `${formatSize(rclone.value.speed || 0)}/s`;
  }
  if (aria2.status === 'fulfilled') {
    const stat = aria2.value.globalStat || {};
    $('#aria2Speed').textContent = `${formatSize(Number(stat.downloadSpeed || 0))}/s`;
    $('#activeCount').textContent = String(Number(stat.numActive || 0) + Number(stat.numWaiting || 0));
  }
}

function renderRemotes() {
  remoteList.innerHTML = '';
  for (const remote of state.remotes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = remote === state.remote ? 'remote-item active' : 'remote-item';
    button.textContent = `${remote}:`;
    button.addEventListener('click', async () => {
      state.remote = remote;
      state.path = '';
      renderRemotes();
      await loadFiles();
    });
    remoteList.append(button);
  }
}

function renderBreadcrumb() {
  breadcrumb.innerHTML = '';
  const root = document.createElement('button');
  root.type = 'button';
  root.textContent = `${state.remote}:`;
  root.addEventListener('click', () => navigateTo(''));
  breadcrumb.append(root);

  const parts = state.path ? state.path.split('/') : [];
  let current = '';
  for (const part of parts) {
    const separator = document.createElement('span');
    separator.textContent = '/';
    breadcrumb.append(separator);

    current = current ? `${current}/${part}` : part;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = part;
    button.addEventListener('click', () => navigateTo(current));
    breadcrumb.append(button);
  }

  pathHint.textContent = state.path ? `${state.remote}:/${state.path}` : `${state.remote}:/`;
}

function renderFiles() {
  fileRows.innerHTML = '';
  emptyState.hidden = state.files.length > 0;

  for (const item of state.files) {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    const nameButton = document.createElement('button');
    nameButton.type = 'button';
    nameButton.className = item.IsDir ? 'file-name folder' : 'file-name';
    nameButton.textContent = item.IsDir ? `[目录] ${item.Name}` : item.Name;
    nameButton.addEventListener('click', () => {
      if (item.IsDir) navigateTo(item.Path);
    });
    nameCell.append(nameButton);

    const sizeCell = document.createElement('td');
    sizeCell.textContent = item.IsDir ? '-' : formatSize(item.Size);

    const timeCell = document.createElement('td');
    timeCell.textContent = formatTime(item.ModTime);

    const typeCell = document.createElement('td');
    typeCell.textContent = item.IsDir ? '文件夹' : item.MimeType || '文件';

    const actionCell = document.createElement('td');
    actionCell.className = 'row-actions';
    if (!item.IsDir) {
      const sendButton = document.createElement('button');
      sendButton.type = 'button';
      sendButton.textContent = '发送';
      sendButton.addEventListener('click', () => sendItem(item));
      actionCell.append(sendButton);

      const downloadLink = document.createElement('a');
      downloadLink.href = `/api/download?${new URLSearchParams({ remote: state.remote, path: item.Path })}`;
      downloadLink.textContent = '下载';
      actionCell.append(downloadLink);
    }
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = item.IsDir ? '删除空目录' : '删除';
    deleteButton.addEventListener('click', () => deleteItem(item));
    actionCell.append(deleteButton);

    row.append(nameCell, sizeCell, timeCell, typeCell, actionCell);
    fileRows.append(row);
  }
}

async function sendItem(item) {
  const settings = readSendSettings();
  state.sendSettings = settings;
  localStorage.setItem('lanTransferPanel.sendSettings', JSON.stringify(settings));
  const thresholdBytes = Math.round(Number(settings.thresholdGb || 1) * 1024 ** 3);
  const route = Number(item.Size || 0) >= thresholdBytes ? 'aria2' : settings.smallMethod;
  const ok = window.confirm(
    `发送：${item.Name}\n策略：${route === 'aria2' ? '大文件 aria2 拉取' : route || '未配置'}\n继续？`,
  );
  if (!ok) return;

  try {
    const result = await api('/api/send', {
      method: 'POST',
      body: {
        remote: state.remote,
        path: item.Path,
        thresholdBytes,
        publicHost: settings.publicHost,
        peerAria2Url: settings.peerAria2Url,
        peerAria2Secret: settings.peerAria2Secret,
        peerDir: settings.peerDir,
        smallMethod: settings.smallMethod,
        rcloneTarget: settings.rcloneTarget,
        rsyncTarget: settings.rsyncTarget,
      },
    });
    if (result.route === 'aria2') {
      showMessage(`已交给对端 aria2：${result.gid}`);
    } else if (result.route === 'rclone') {
      showMessage(`rclone 已复制到：${result.destination}`);
    } else if (result.route === 'rsync') {
      showMessage(`rsync 已发送到：${result.destination}`);
    } else {
      showMessage('发送任务已完成');
    }
  } catch (error) {
    showMessage(error.message, true);
  }
}

function renderTasks(data) {
  const tasks = [
    ...(data.active || []),
    ...(data.waiting || []),
    ...(data.stopped || []).slice(0, 20),
  ];
  taskRows.innerHTML = '';
  if (!tasks.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state inline';
    empty.textContent = '暂无 aria2 任务';
    taskRows.append(empty);
    return;
  }

  for (const task of tasks) {
    const item = document.createElement('article');
    item.className = 'task-item';
    const name = taskName(task);
    const percent = progressPercent(task);
    item.innerHTML = `
      <div class="task-main">
        <strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
        <span>${statusText(task.status)} · ${formatSize(task.completedLength)} / ${formatSize(task.totalLength)} · ${formatSize(task.downloadSpeed)}/s</span>
        <div class="progress"><i style="width:${percent}%"></i></div>
      </div>
      <div class="task-actions"></div>
    `;
    const actions = item.querySelector('.task-actions');
    if (task.status === 'active') {
      actions.append(taskButton('暂停', () => controlTask(task.gid, 'pause')));
    } else if (task.status === 'paused') {
      actions.append(taskButton('继续', () => controlTask(task.gid, 'unpause')));
    }
    if (task.status === 'complete' || task.status === 'removed' || task.status === 'error') {
      actions.append(taskButton('清除', () => controlTask(task.gid, 'purge')));
    } else {
      actions.append(taskButton('移除', () => controlTask(task.gid, 'remove')));
    }
    taskRows.append(item);
  }
}

function taskButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

async function controlTask(gid, action) {
  try {
    await api('/api/aria2/control', {
      method: 'POST',
      body: { gid, action },
    });
    await loadTasks();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function deleteItem(item) {
  const ok = window.confirm(`确认删除 ${item.IsDir ? '空目录' : '文件'}：${item.Name}？`);
  if (!ok) return;
  try {
    await api('/api/delete', {
      method: 'POST',
      body: { remote: state.remote, path: item.Path, isDir: item.IsDir },
    });
    showMessage(`已删除：${item.Name}`);
    await loadFiles();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function navigateTo(nextPath) {
  state.path = nextPath || '';
  await loadFiles();
}

async function api(url, options = {}) {
  const headers = options.body && !(options.body instanceof Blob) ? { 'Content-Type': 'application/json' } : {};
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body && !(options.body instanceof Blob) ? JSON.stringify(options.body) : options.body,
  });

  if (response.status === 401 && !options.skipAuthRedirect) {
    stopTimers();
    appView.hidden = true;
    loginView.hidden = false;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败：${response.status}`);
  return data;
}

function stopTimers() {
  clearInterval(state.tasksTimer);
  clearInterval(state.statsTimer);
  state.tasksTimer = null;
  state.statsTimer = null;
}

function setStatus(text) {
  statusBadge.textContent = text;
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.className = isError ? 'message error' : 'message';
  message.hidden = false;
  window.clearTimeout(showMessage.timer);
  showMessage.timer = window.setTimeout(() => {
    message.hidden = true;
  }, 4200);
}

function loadSendSettings() {
  try {
    return {
      thresholdGb: 1,
      publicHost: '10.42.0.1',
      peerAria2Url: '',
      peerAria2Secret: '',
      peerDir: '',
      smallMethod: 'none',
      rcloneTarget: '',
      rsyncTarget: '',
      ...JSON.parse(localStorage.getItem('lanTransferPanel.sendSettings') || '{}'),
    };
  } catch {
    return {
      thresholdGb: 1,
      publicHost: '10.42.0.1',
      peerAria2Url: '',
      peerAria2Secret: '',
      peerDir: '',
      smallMethod: 'none',
      rcloneTarget: '',
      rsyncTarget: '',
    };
  }
}

function fillSendSettings() {
  $('#sendThresholdGb').value = state.sendSettings.thresholdGb || 1;
  $('#sendPublicHost').value = state.sendSettings.publicHost || '10.42.0.1';
  $('#peerAria2Url').value = state.sendSettings.peerAria2Url || '';
  $('#peerAria2Secret').value = state.sendSettings.peerAria2Secret || '';
  $('#peerDir').value = state.sendSettings.peerDir || '';
  $('#smallMethod').value = state.sendSettings.smallMethod || 'none';
  $('#rcloneTarget').value = state.sendSettings.rcloneTarget || '';
  $('#rsyncTarget').value = state.sendSettings.rsyncTarget || '';
}

function readSendSettings() {
  return {
    thresholdGb: Number($('#sendThresholdGb').value || 1),
    publicHost: $('#sendPublicHost').value.trim() || '10.42.0.1',
    peerAria2Url: $('#peerAria2Url').value.trim(),
    peerAria2Secret: $('#peerAria2Secret').value.trim(),
    peerDir: $('#peerDir').value.trim(),
    smallMethod: $('#smallMethod').value,
    rcloneTarget: $('#rcloneTarget').value.trim(),
    rsyncTarget: $('#rsyncTarget').value.trim(),
  };
}

function taskName(task) {
  const firstFile = task.files && task.files[0];
  if (firstFile?.path) return firstFile.path.split('/').pop() || firstFile.path;
  if (task.bittorrent?.info?.name) return task.bittorrent.info.name;
  return task.gid;
}

function progressPercent(task) {
  const total = Number(task.totalLength || 0);
  if (!total) return 0;
  return Math.min(100, Math.round((Number(task.completedLength || 0) / total) * 100));
}

function statusText(status) {
  return {
    active: '下载中',
    waiting: '等待中',
    paused: '已暂停',
    complete: '已完成',
    error: '出错',
    removed: '已移除',
  }[status] || status;
}

function formatSize(value) {
  const size = Number(value || 0);
  if (!size) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

boot().catch(() => {
  appView.hidden = true;
  loginView.hidden = false;
});
