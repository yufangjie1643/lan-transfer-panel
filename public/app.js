const savedLocation = loadLocationState();
const savedSort = loadSortState();

const state = {
  remotes: [],
  remote: savedLocation.remote || 'data',
  path: savedLocation.path || '',
  files: [],
  fileFilter: '',
  fileSortKey: savedSort.key,
  fileSortDir: savedSort.dir,
  filesRequestId: 0,
  tasksRequestId: 0,
  filesLoading: false,
  filesError: '',
  sendSettings: loadSendSettings(),
  tasksTimer: null,
  statsTimer: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

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
const fileFilter = $('#fileFilter');
const loginButton = loginForm.querySelector('button[type="submit"]');
const downloadButton = $('#downloadForm button[type="submit"]');
const saveSendSettingsButton = $('#sendSettingsForm button[type="submit"]');

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  const form = new FormData(loginForm);
  setButtonBusy(loginButton, true, '登录中');
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
  } finally {
    setButtonBusy(loginButton, false);
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  stopTimers();
  appView.hidden = true;
  loginView.hidden = false;
});

$('#reloadRemotesBtn').addEventListener('click', (event) => {
  runButtonAction(event.currentTarget, '刷新中', loadRemotes);
});
$('#refreshFilesBtn').addEventListener('click', (event) => {
  runButtonAction(event.currentTarget, '刷新中', loadFiles);
});
$('#refreshTasksBtn').addEventListener('click', (event) => {
  runButtonAction(event.currentTarget, '刷新中', loadTasks);
});
$('#refreshAllBtn').addEventListener('click', async () => {
  await runButtonAction($('#refreshAllBtn'), '刷新中', async () => {
    await Promise.allSettled([loadRemotes(), loadFiles(), loadTasks(), loadStats()]);
  });
});

$('#mkdirBtn').addEventListener('click', async (event) => {
  const name = window.prompt('文件夹名称');
  if (!name) return;
  setButtonBusy(event.currentTarget, true, '创建中');
  try {
    await api('/api/mkdir', {
      method: 'POST',
      body: { remote: state.remote, path: state.path, name },
    });
    showMessage(`已创建：${name}`);
    await loadFiles();
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    setButtonBusy(event.currentTarget, false);
  }
});

$('#uploadBtn').addEventListener('click', () => $('#fileInput').click());

$('#fileInput').addEventListener('change', async (event) => {
  const files = [...event.target.files];
  if (!files.length) return;
  setButtonBusy($('#uploadBtn'), true, '上传中');
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
      if (response.status === 401) handleUnauthorized();
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `上传失败：${file.name}`);
    } catch (error) {
      showMessage(error.message, true);
      event.target.value = '';
      setButtonBusy($('#uploadBtn'), false);
      return;
    }
  }
  event.target.value = '';
  setButtonBusy($('#uploadBtn'), false);
  showMessage(`上传完成：${files.length} 个文件`);
  await loadFiles();
});

$('#downloadForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = $('#downloadUrl').value.trim();
  if (!url) return;
  setButtonBusy(downloadButton, true, '添加中');
  try {
    const result = await api('/api/downloads/add', {
      method: 'POST',
      body: { url },
    });
    $('#downloadUrl').value = '';
    showMessage(`下载任务已加入：${result.gid}`);
    await loadTasks();
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    setButtonBusy(downloadButton, false);
  }
});

$('#sendSettingsForm').addEventListener('submit', (event) => {
  event.preventDefault();
  setButtonBusy(saveSendSettingsButton, true, '已保存');
  state.sendSettings = readSendSettings();
  localStorage.setItem('lanTransferPanel.sendSettings', JSON.stringify(state.sendSettings));
  showMessage('发送策略已保存');
  window.setTimeout(() => setButtonBusy(saveSendSettingsButton, false), 500);
});

fileFilter.addEventListener('input', () => {
  state.fileFilter = fileFilter.value.trim().toLowerCase();
  renderFiles();
});

fileFilter.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && fileFilter.value) {
    fileFilter.value = '';
    state.fileFilter = '';
    renderFiles();
  }
});

for (const button of $$('.sort-button')) {
  button.addEventListener('click', () => {
    setFileSort(button.dataset.sort);
  });
}

for (const tab of $$('.side-tab')) {
  tab.addEventListener('click', () => {
    setSidePage(tab.dataset.sidePage);
  });
}

setSidePage(localStorage.getItem('lanTransferPanel.sidePage') || 'downloads');

async function boot() {
  await api('/api/session');
  loginView.hidden = true;
  appView.hidden = false;
  fillSendSettings();
  await loadRemotes();
  if (!state.remotes.includes(state.remote)) state.remote = state.remotes[0] || 'home';
  if (!savedLocation.remote || !state.remotes.includes(savedLocation.remote)) state.path = '';
  saveLocationState();
  await Promise.allSettled([loadFiles(), loadTasks(), loadStats()]);
  stopTimers();
  state.tasksTimer = setInterval(loadTasks, 5000);
  state.statsTimer = setInterval(loadStats, 3000);
}

async function loadRemotes() {
  try {
    const data = await api('/api/remotes');
    state.remotes = data.remotes || [];
    renderRemotes();
  } catch (error) {
    showMessage(error.message, true);
    setStatus('连接异常');
  }
}

async function loadFiles() {
  const requestId = ++state.filesRequestId;
  state.filesLoading = true;
  state.filesError = '';
  renderFiles();
  setStatus('加载中');
  const params = new URLSearchParams({ remote: state.remote, path: state.path });
  try {
    const data = await api(`/api/list?${params}`);
    if (requestId !== state.filesRequestId) return;
    state.files = data.list || [];
    renderBreadcrumb();
    renderFiles();
    setStatus('已连接');
  } catch (error) {
    if (requestId !== state.filesRequestId) return;
    state.files = [];
    state.filesError = error.message;
    renderBreadcrumb();
    renderFiles();
    showMessage(error.message, true);
    setStatus('连接异常');
  } finally {
    if (requestId === state.filesRequestId) {
      state.filesLoading = false;
      renderFiles();
    }
  }
}

async function loadTasks() {
  const requestId = ++state.tasksRequestId;
  try {
    const data = await api('/api/downloads/tasks');
    if (requestId !== state.tasksRequestId) return;
    renderTasks(data);
  } catch (error) {
    if (requestId !== state.tasksRequestId) return;
    renderTasksError(error.message);
  }
}

async function loadStats() {
  try {
    const stats = await api('/api/transfers/stats');
    $('#transferSpeed').textContent = `${formatSize(stats.transferSpeed || 0)}/s`;
    $('#downloadSpeed').textContent = `${formatSize(stats.downloadSpeed || 0)}/s`;
    $('#activeCount').textContent = String(Number(stats.activeCount || 0));
  } catch {
    $('#transferSpeed').textContent = '-';
    $('#downloadSpeed').textContent = '-';
    $('#activeCount').textContent = '-';
  }
}

function renderRemotes() {
  remoteList.innerHTML = '';
  if (!state.remotes.length) {
    const empty = document.createElement('p');
    empty.className = 'remote-empty';
    empty.textContent = '暂无可用位置';
    remoteList.append(empty);
    return;
  }

  for (const remote of state.remotes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = remote === state.remote ? 'remote-item active' : 'remote-item';
    button.textContent = `${remote}:`;
    button.addEventListener('click', async () => {
      if (remote === state.remote && !state.path) return;
      state.remote = remote;
      state.path = '';
      saveLocationState();
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
    const targetPath = current;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = part;
    button.addEventListener('click', () => navigateTo(targetPath));
    breadcrumb.append(button);
  }

  pathHint.textContent = state.path ? `${state.remote}:/${state.path}` : `${state.remote}:/`;
}

function renderFiles() {
  fileRows.innerHTML = '';
  renderSortIndicators();

  if (state.filesLoading && !state.files.length) {
    emptyState.textContent = '正在加载文件...';
    emptyState.hidden = false;
    return;
  }

  if (state.filesError) {
    emptyState.textContent = `加载失败：${state.filesError}`;
    emptyState.hidden = false;
    return;
  }

  const files = filteredAndSortedFiles();
  if (!files.length) {
    emptyState.textContent = state.fileFilter ? '没有匹配的文件' : '这个目录是空的';
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;

  for (const item of files) {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    const nameButton = document.createElement('button');
    nameButton.type = 'button';
    nameButton.className = item.IsDir ? 'file-name folder' : 'file-name';
    nameButton.title = item.Name;
    const nameIcon = document.createElement('span');
    nameIcon.className = item.IsDir ? 'file-icon folder' : 'file-icon';
    const nameText = document.createElement('span');
    nameText.textContent = item.Name;
    nameButton.append(nameIcon, nameText);
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
      sendButton.className = 'action-button primary-action';
      sendButton.textContent = '发送';
      sendButton.addEventListener('click', (event) => sendItem(item, event.currentTarget));
      actionCell.append(sendButton);

      const downloadLink = document.createElement('a');
      downloadLink.className = 'action-link';
      downloadLink.href = `/api/download?${new URLSearchParams({ remote: state.remote, path: item.Path })}`;
      downloadLink.textContent = '下载';
      actionCell.append(downloadLink);
    } else {
      const archiveLink = document.createElement('a');
      archiveLink.className = 'action-link primary-action';
      archiveLink.href = `/api/download-folder?${new URLSearchParams({ remote: state.remote, path: item.Path })}`;
      archiveLink.textContent = '打包下载';
      actionCell.append(archiveLink);
    }
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'action-button danger-action';
    deleteButton.textContent = item.IsDir ? '删除空目录' : '删除';
    deleteButton.addEventListener('click', (event) => deleteItem(item, event.currentTarget));
    actionCell.append(deleteButton);

    row.append(nameCell, sizeCell, timeCell, typeCell, actionCell);
    fileRows.append(row);
  }
}

function filteredAndSortedFiles() {
  const filter = state.fileFilter;
  const files = filter
    ? state.files.filter((item) => fileSearchText(item).includes(filter))
    : [...state.files];
  const direction = state.fileSortDir === 'desc' ? -1 : 1;
  files.sort((a, b) => {
    if (a.IsDir !== b.IsDir) return a.IsDir ? -1 : 1;
    return compareFileItems(a, b, state.fileSortKey) * direction;
  });
  return files;
}

function fileSearchText(item) {
  return [item.Name, item.Path, item.IsDir ? '文件夹 目录 folder' : item.MimeType || '文件']
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function compareFileItems(a, b, key) {
  if (key === 'size') return Number(a.Size || 0) - Number(b.Size || 0);
  if (key === 'time') return new Date(a.ModTime || 0).getTime() - new Date(b.ModTime || 0).getTime();
  if (key === 'type') return fileTypeText(a).localeCompare(fileTypeText(b), 'zh-CN');
  return String(a.Name || '').localeCompare(String(b.Name || ''), 'zh-CN', {
    numeric: true,
    sensitivity: 'base',
  });
}

function fileTypeText(item) {
  return item.IsDir ? '文件夹' : item.MimeType || '文件';
}

function setFileSort(key) {
  if (state.fileSortKey === key) {
    state.fileSortDir = state.fileSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.fileSortKey = key;
    state.fileSortDir = key === 'name' || key === 'type' ? 'asc' : 'desc';
  }
  localStorage.setItem(
    'lanTransferPanel.fileSort',
    JSON.stringify({ key: state.fileSortKey, dir: state.fileSortDir }),
  );
  renderFiles();
}

function renderSortIndicators() {
  for (const indicator of $$('[data-sort-indicator]')) {
    const key = indicator.dataset.sortIndicator;
    indicator.textContent = key === state.fileSortKey ? (state.fileSortDir === 'asc' ? '↑' : '↓') : '';
  }
  for (const button of $$('.sort-button')) {
    button.classList.toggle('active', button.dataset.sort === state.fileSortKey);
  }
}

async function sendItem(item, button) {
  const settings = readSendSettings();
  state.sendSettings = settings;
  localStorage.setItem('lanTransferPanel.sendSettings', JSON.stringify(settings));
  const thresholdBytes = Math.round(Number(settings.thresholdGb || 1) * 1024 ** 3);
  const route = Number(item.Size || 0) >= thresholdBytes ? 'receiver' : settings.smallMethod;
  const ok = window.confirm(
    `发送：${item.Name}\n方式：${sendRouteLabel(route)}\n继续？`,
  );
  if (!ok) return;

  setButtonBusy(button, true, '发送中');
  try {
    const result = await api('/api/send', {
      method: 'POST',
      body: {
        remote: state.remote,
        path: item.Path,
        thresholdBytes,
        publicHost: settings.publicHost,
        peerReceiverUrl: settings.peerReceiverUrl,
        peerReceiverToken: settings.peerReceiverToken,
        peerDir: settings.peerDir,
        smallMethod: settings.smallMethod,
        copyTarget: settings.copyTarget,
        syncTarget: settings.syncTarget,
      },
    });
    if (result.route === 'receiver') {
      showMessage(`远端接收任务已创建：${result.gid}`);
    } else if (result.route === 'copy') {
      showMessage(`已复制到：${result.destination}`);
    } else if (result.route === 'sync') {
      showMessage(`已同步到：${result.destination}`);
    } else {
      showMessage('发送任务已完成');
    }
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    setButtonBusy(button, false);
  }
}

function sendRouteLabel(route) {
  return {
    receiver: '远端接收',
    copy: '直连复制',
    sync: '同步发送',
    none: '手动确认',
  }[route] || '手动确认';
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
    empty.textContent = '暂无下载任务';
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
        <span>
          <i class="task-status ${taskStatusClass(task.status)}">${statusText(task.status)}</i>
          ${formatSize(task.completedLength)} / ${formatSize(task.totalLength)} · ${formatSize(task.downloadSpeed)}/s
        </span>
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

function renderTasksError(text) {
  taskRows.innerHTML = '';
  const error = document.createElement('div');
  error.className = 'empty-state inline error';
  error.textContent = `任务加载失败：${text}`;
  taskRows.append(error);
}

function taskButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', async () => {
    await runButtonAction(button, '处理中', onClick);
  });
  return button;
}

async function controlTask(gid, action) {
  try {
    await api('/api/downloads/control', {
      method: 'POST',
      body: { gid, action },
    });
    await loadTasks();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function deleteItem(item, button) {
  const ok = window.confirm(`确认删除 ${item.IsDir ? '空目录' : '文件'}：${item.Name}？`);
  if (!ok) return;
  setButtonBusy(button, true, '删除中');
  try {
    await api('/api/delete', {
      method: 'POST',
      body: { remote: state.remote, path: item.Path, isDir: item.IsDir },
    });
    showMessage(`已删除：${item.Name}`);
    await loadFiles();
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    setButtonBusy(button, false);
  }
}

async function navigateTo(nextPath) {
  state.path = nextPath || '';
  saveLocationState();
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
    handleUnauthorized();
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败：${response.status}`);
  return data;
}

function handleUnauthorized() {
  stopTimers();
  appView.hidden = true;
  loginView.hidden = false;
}

async function runButtonAction(button, busyText, action) {
  setButtonBusy(button, true, busyText);
  try {
    return await action();
  } finally {
    setButtonBusy(button, false);
  }
}

function setButtonBusy(button, isBusy, busyText) {
  if (!button) return;
  if (isBusy) {
    button.dataset.idleText = button.textContent;
    button.disabled = true;
    if (busyText) button.textContent = busyText;
    return;
  }
  button.disabled = false;
  if (button.dataset.idleText) {
    button.textContent = button.dataset.idleText;
    delete button.dataset.idleText;
  }
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

function setSidePage(page) {
  const nextPage = ['downloads', 'send', 'overview'].includes(page) ? page : 'downloads';
  for (const tab of $$('.side-tab')) {
    tab.classList.toggle('active', tab.dataset.sidePage === nextPage);
  }
  for (const content of $$('[data-side-content]')) {
    const active = content.dataset.sideContent === nextPage;
    content.classList.toggle('active', active);
    content.hidden = !active;
  }
  localStorage.setItem('lanTransferPanel.sidePage', nextPage);
}

function loadLocationState() {
  try {
    const value = JSON.parse(localStorage.getItem('lanTransferPanel.location') || '{}');
    return {
      remote: typeof value.remote === 'string' ? value.remote : '',
      path: typeof value.path === 'string' ? value.path : '',
    };
  } catch {
    return { remote: '', path: '' };
  }
}

function saveLocationState() {
  localStorage.setItem(
    'lanTransferPanel.location',
    JSON.stringify({ remote: state.remote, path: state.path }),
  );
}

function loadSortState() {
  try {
    const value = JSON.parse(localStorage.getItem('lanTransferPanel.fileSort') || '{}');
    const key = ['name', 'size', 'time', 'type'].includes(value.key) ? value.key : 'name';
    const dir = value.dir === 'desc' ? 'desc' : 'asc';
    return { key, dir };
  } catch {
    return { key: 'name', dir: 'asc' };
  }
}

function loadSendSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('lanTransferPanel.sendSettings') || '{}');
    const smallMethod = ['none', 'copy', 'sync'].includes(saved.smallMethod) ? saved.smallMethod : 'none';
    return {
      thresholdGb: 1,
      publicHost: '10.42.0.1',
      peerReceiverUrl: '',
      peerReceiverToken: '',
      peerDir: '',
      smallMethod: 'none',
      copyTarget: '',
      syncTarget: '',
      ...saved,
      smallMethod,
    };
  } catch {
    return {
      thresholdGb: 1,
      publicHost: '10.42.0.1',
      peerReceiverUrl: '',
      peerReceiverToken: '',
      peerDir: '',
      smallMethod: 'none',
      copyTarget: '',
      syncTarget: '',
    };
  }
}

function fillSendSettings() {
  $('#sendThresholdGb').value = state.sendSettings.thresholdGb || 1;
  $('#sendPublicHost').value = state.sendSettings.publicHost || '10.42.0.1';
  $('#peerReceiverUrl').value = state.sendSettings.peerReceiverUrl || '';
  $('#peerReceiverToken').value = state.sendSettings.peerReceiverToken || '';
  $('#peerDir').value = state.sendSettings.peerDir || '';
  $('#smallMethod').value = state.sendSettings.smallMethod || 'none';
  $('#copyTarget').value = state.sendSettings.copyTarget || '';
  $('#syncTarget').value = state.sendSettings.syncTarget || '';
}

function readSendSettings() {
  return {
    thresholdGb: Number($('#sendThresholdGb').value || 1),
    publicHost: $('#sendPublicHost').value.trim() || '10.42.0.1',
    peerReceiverUrl: $('#peerReceiverUrl').value.trim(),
    peerReceiverToken: $('#peerReceiverToken').value.trim(),
    peerDir: $('#peerDir').value.trim(),
    smallMethod: $('#smallMethod').value,
    copyTarget: $('#copyTarget').value.trim(),
    syncTarget: $('#syncTarget').value.trim(),
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

function taskStatusClass(status) {
  return {
    active: 'active',
    waiting: 'waiting',
    paused: 'paused',
    complete: 'complete',
    error: 'error',
    removed: 'removed',
  }[status] || 'waiting';
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
