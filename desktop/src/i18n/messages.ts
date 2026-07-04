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
    profileName: string;
    host: string;
    port: string;
    username: string;
    authMethod: string;
    password: string;
    passwordAuth: string;
    keyAuth: string;
    privateKeyPath: string;
    passphrase: string;
    saveCredential: string;
    saveProfile: string;
    deleteProfile: string;
    advanced: string;
    aria2Rpc: string;
    aria2Secret: string;
    remoteTempDir: string;
    remoteDownloadService: string;
    connect: string;
    connecting: string;
  };
  launcher: {
    title: string;
    emptyTitle: string;
    emptySubtitle: string;
    addServer: string;
    connect: string;
    connecting: string;
    edit: string;
    delete: string;
    confirmDelete: string;
  };
  serverForm: {
    titleAdd: string;
    titleEdit: string;
    label: string;
    host: string;
    port: string;
    username: string;
    authMethod: string;
    passwordAuth: string;
    keyAuth: string;
    password: string;
    privateKeyPath: string;
    passphrase: string;
    saveCredential: string;
    advanced: string;
    aria2Rpc: string;
    aria2Secret: string;
    remoteTempDir: string;
    remoteDownloadService: string;
    downloadServiceAuto: string;
    downloadServiceRclone: string;
    downloadServiceHttp: string;
    cancel: string;
    save: string;
    saveAndConnect: string;
    validation: {
      labelRequired: string;
      hostRequired: string;
      portInvalid: string;
      usernameRequired: string;
      passwordRequired: string;
      privateKeyRequired: string;
    };
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
    back: string;
    forward: string;
    parent: string;
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
  explorer: {
    toolbar: {
      back: string;
      forward: string;
      up: string;
      refresh: string;
      newFolder: string;
      download: string;
      delete: string;
      queue: string;
    };
    addressBar: {
      editPath: string;
    };
    fileList: {
      name: string;
      modified: string;
      type: string;
      size: string;
      empty: string;
      loading: string;
      selectAll: string;
      folder: string;
      file: string;
    };
    statusBar: {
      items: (count: number) => string;
      selected: (count: number) => string;
    };
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
      password: '登录密码',
      connect: '连接',
      disconnected: '未连接',
      connecting: '连接中...',
      connectedAs: (username) => `已连接：${username}`,
      loginFailed: '登录失败',
      switchConnection: '切换连接'
    },
    login: {
      title: '连接服务器',
      subtitle: '选择已保存的 SSH 凭证，或输入新的服务器连接。',
      profile: '连接配置',
      profileName: '配置名称',
      host: '服务器地址',
      port: 'SSH 端口',
      username: '用户名',
      authMethod: '认证方式',
      password: '登录密码',
      passwordAuth: '密码',
      keyAuth: 'SSH 密钥',
      privateKeyPath: '私钥路径',
      passphrase: '密钥密码，可选',
      saveCredential: '保存此服务器配置',
      saveProfile: '保存配置',
      deleteProfile: '删除配置',
      advanced: '高级设置',
      aria2Rpc: 'Windows aria2 RPC',
      aria2Secret: 'aria2 密钥，可选',
      remoteTempDir: '远程临时目录',
      remoteDownloadService: '远程下载服务',
      connect: '连接',
      connecting: '连接中...'
    },
    launcher: {
      title: '选择服务器',
      emptyTitle: '还没有保存的服务器',
      emptySubtitle: '点击下方按钮添加第一台服务器',
      addServer: '添加服务器',
      connect: '连接',
      connecting: '连接中...',
      edit: '编辑',
      delete: '删除',
      confirmDelete: '确认删除？'
    },
    serverForm: {
      titleAdd: '添加服务器',
      titleEdit: '编辑服务器',
      label: '配置名称',
      host: '服务器地址',
      port: 'SSH 端口',
      username: '用户名',
      authMethod: '认证方式',
      passwordAuth: '密码',
      keyAuth: 'SSH 密钥',
      password: '登录密码',
      privateKeyPath: '私钥路径',
      passphrase: '密钥密码，可选',
      saveCredential: '保存此服务器配置',
      advanced: '高级设置',
      aria2Rpc: 'Windows aria2 RPC',
      aria2Secret: 'aria2 密钥，可选',
      remoteTempDir: '远程临时目录',
      remoteDownloadService: '远程下载服务',
      downloadServiceAuto: '自动',
      downloadServiceRclone: 'rclone serve',
      downloadServiceHttp: '自定义 HTTP',
      cancel: '取消',
      save: '保存',
      saveAndConnect: '保存并连接',
      validation: {
        labelRequired: '请输入配置名称',
        hostRequired: '请输入服务器地址',
        portInvalid: '端口号必须在 1–65535 之间',
        usernameRequired: '请输入用户名',
        passwordRequired: '请输入登录密码',
        privateKeyRequired: '请输入私钥路径'
      }
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
      back: '后退',
      forward: '前进',
      parent: '上一级',
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
    explorer: {
      toolbar: {
        back: '后退',
        forward: '前进',
        up: '上一级',
        refresh: '刷新',
        newFolder: '新建文件夹',
        download: '下载',
        delete: '删除',
        queue: '队列'
      },
      addressBar: {
        editPath: '编辑路径'
      },
      fileList: {
        name: '名称',
        modified: '修改日期',
        type: '类型',
        size: '大小',
        empty: '此文件夹为空',
        loading: '加载中...',
        selectAll: '全选',
        folder: '文件夹',
        file: '文件'
      },
      statusBar: {
        items: (count) => `${count} 个项目`,
        selected: (count) => `已选择 ${count} 个项目`
      }
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
      password: 'Login password',
      connect: 'Connect',
      disconnected: 'Disconnected',
      connecting: 'Connecting...',
      connectedAs: (username) => `Connected as ${username}`,
      loginFailed: 'Login failed',
      switchConnection: 'Switch connection'
    },
    login: {
      title: 'Connect to server',
      subtitle: 'Choose saved SSH credentials or enter a new server connection.',
      profile: 'Connection profile',
      profileName: 'Profile name',
      host: 'Server address',
      port: 'SSH port',
      username: 'Username',
      authMethod: 'Authentication',
      password: 'Login password',
      passwordAuth: 'Password',
      keyAuth: 'SSH key',
      privateKeyPath: 'Private key path',
      passphrase: 'Key passphrase, optional',
      saveCredential: 'Save this server profile',
      saveProfile: 'Save profile',
      deleteProfile: 'Delete profile',
      advanced: 'Advanced settings',
      aria2Rpc: 'Windows aria2 RPC',
      aria2Secret: 'aria2 secret, optional',
      remoteTempDir: 'Remote temp directory',
      remoteDownloadService: 'Remote download service',
      connect: 'Connect',
      connecting: 'Connecting...'
    },
    launcher: {
      title: 'Select server',
      emptyTitle: 'No saved servers',
      emptySubtitle: 'Add your first server below',
      addServer: 'Add server',
      connect: 'Connect',
      connecting: 'Connecting...',
      edit: 'Edit',
      delete: 'Delete',
      confirmDelete: 'Confirm delete?'
    },
    serverForm: {
      titleAdd: 'Add server',
      titleEdit: 'Edit server',
      label: 'Profile name',
      host: 'Server address',
      port: 'SSH port',
      username: 'Username',
      authMethod: 'Authentication',
      passwordAuth: 'Password',
      keyAuth: 'SSH key',
      password: 'Login password',
      privateKeyPath: 'Private key path',
      passphrase: 'Key passphrase, optional',
      saveCredential: 'Save this server profile',
      advanced: 'Advanced settings',
      aria2Rpc: 'Windows aria2 RPC',
      aria2Secret: 'aria2 secret, optional',
      remoteTempDir: 'Remote temp directory',
      remoteDownloadService: 'Remote download service',
      downloadServiceAuto: 'Auto',
      downloadServiceRclone: 'rclone serve',
      downloadServiceHttp: 'Custom HTTP',
      cancel: 'Cancel',
      save: 'Save',
      saveAndConnect: 'Save & connect',
      validation: {
        labelRequired: 'Profile name is required',
        hostRequired: 'Server address is required',
        portInvalid: 'Port must be between 1 and 65535',
        usernameRequired: 'Username is required',
        passwordRequired: 'Login password is required',
        privateKeyRequired: 'Private key path is required'
      }
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
      back: 'Back',
      forward: 'Forward',
      parent: 'Up one level',
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
    explorer: {
      toolbar: {
        back: 'Back',
        forward: 'Forward',
        up: 'Up one level',
        refresh: 'Refresh',
        newFolder: 'New folder',
        download: 'Download',
        delete: 'Delete',
        queue: 'Queue'
      },
      addressBar: {
        editPath: 'Edit path'
      },
      fileList: {
        name: 'Name',
        modified: 'Modified',
        type: 'Type',
        size: 'Size',
        empty: 'This folder is empty',
        loading: 'Loading...',
        selectAll: 'Select all',
        folder: 'Folder',
        file: 'File'
      },
      statusBar: {
        items: (count) => `${count} items`,
        selected: (count) => `${count} selected`
      }
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
