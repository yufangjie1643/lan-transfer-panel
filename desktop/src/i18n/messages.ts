export type Locale = 'zh-CN' | 'en-US';

interface Messages {
  appTitle: string;
  language: {
    label: string;
    zhCN: string;
    enUS: string;
  };
  connection: {
    region: string;
    backendUrl: string;
    username: string;
    password: string;
    connect: string;
    disconnected: string;
    connecting: string;
    connectedAs: (username: string) => string;
    loginFailed: string;
    switchConnection: string;
  };
  login: {
    title: string;
    subtitle: string;
    profile: string;
    backendUrl: string;
    username: string;
    password: string;
    connect: string;
    connecting: string;
  };
  panes: {
    local: string;
    localTree: string;
    localDetails: string;
    remote: string;
    remoteTree: string;
    remoteDetails: string;
    downloadTo: string;
    remotePath: string;
    openPath: string;
    refresh: (title: string) => string;
    expandFolder: (name: string) => string;
    collapseFolder: (name: string) => string;
  };
  drag: {
    differentPanes: string;
  };
  queue: {
    title: string;
    taskCount: (count: number) => string;
    pause: (gid: string) => string;
    resume: (gid: string) => string;
    remove: (gid: string) => string;
  };
  errors: {
    openDirectoryFailed: string;
    refreshFailed: string;
    queueControlFailed: string;
    downloadFailed: string;
  };
}

export const defaultLocale: Locale = 'zh-CN';

export const messages: Record<Locale, Messages> = {
  'zh-CN': {
    appTitle: '局域网传输',
    language: {
      label: '语言',
      zhCN: '中文',
      enUS: 'English'
    },
    connection: {
      region: '连接设置',
      backendUrl: '后端地址',
      username: '用户名',
      password: '密码',
      connect: '连接',
      disconnected: '未连接',
      connecting: '连接中...',
      connectedAs: (username) => `已连接：${username}`,
      loginFailed: '登录失败',
      switchConnection: '切换连接'
    },
    login: {
      title: '连接服务器',
      subtitle: '选择服务器凭证，或输入自定义连接。',
      profile: '连接配置',
      backendUrl: '后端地址',
      username: '用户名',
      password: '密码',
      connect: '连接',
      connecting: '连接中...'
    },
    panes: {
      local: '本地文件',
      localTree: '本地目录树',
      localDetails: '本地文件详情',
      remote: '远端文件',
      remoteTree: '远端目录树',
      remoteDetails: '远端文件详情',
      downloadTo: '下载到...',
      remotePath: '远程路径',
      openPath: '打开路径',
      refresh: (title) => `刷新${title}`,
      expandFolder: (name) => `展开 ${name}`,
      collapseFolder: (name) => `折叠 ${name}`
    },
    drag: {
      differentPanes: '请在本地和远端之间拖放文件'
    },
    queue: {
      title: '传输队列',
      taskCount: (count) => `${count} 个任务`,
      pause: (gid) => `暂停 ${gid}`,
      resume: (gid) => `继续 ${gid}`,
      remove: (gid) => `移除 ${gid}`
    },
    errors: {
      openDirectoryFailed: '打开目录失败',
      refreshFailed: '刷新失败',
      queueControlFailed: '控制队列失败',
      downloadFailed: '添加下载失败'
    }
  },
  'en-US': {
    appTitle: 'LAN Transfer',
    language: {
      label: 'Language',
      zhCN: '中文',
      enUS: 'English'
    },
    connection: {
      region: 'Connection',
      backendUrl: 'Backend URL',
      username: 'Username',
      password: 'Password',
      connect: 'Connect',
      disconnected: 'Disconnected',
      connecting: 'Connecting...',
      connectedAs: (username) => `Connected as ${username}`,
      loginFailed: 'Login failed',
      switchConnection: 'Switch connection'
    },
    login: {
      title: 'Connect to server',
      subtitle: 'Choose saved server credentials or enter a custom connection.',
      profile: 'Connection profile',
      backendUrl: 'Backend URL',
      username: 'Username',
      password: 'Password',
      connect: 'Connect',
      connecting: 'Connecting...'
    },
    panes: {
      local: 'Local files',
      localTree: 'Local folder tree',
      localDetails: 'Local file details',
      remote: 'Remote files',
      remoteTree: 'Remote folder tree',
      remoteDetails: 'Remote file details',
      downloadTo: 'Download to...',
      remotePath: 'Remote path',
      openPath: 'Open path',
      refresh: (title) => `Refresh ${title}`,
      expandFolder: (name) => `Expand ${name}`,
      collapseFolder: (name) => `Collapse ${name}`
    },
    drag: {
      differentPanes: 'Drop between different panes to transfer files'
    },
    queue: {
      title: 'Transfer queue',
      taskCount: (count) => `${count} tasks`,
      pause: (gid) => `Pause ${gid}`,
      resume: (gid) => `Resume ${gid}`,
      remove: (gid) => `Remove ${gid}`
    },
    errors: {
      openDirectoryFailed: 'Open directory failed',
      refreshFailed: 'Refresh failed',
      queueControlFailed: 'Queue control failed',
      downloadFailed: 'Add download failed'
    }
  }
};

export const defaultMessages = messages[defaultLocale];
