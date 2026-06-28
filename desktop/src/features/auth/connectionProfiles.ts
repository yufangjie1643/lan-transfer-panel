import { invoke } from '@tauri-apps/api/core';

export interface ConnectionProfile {
  id: string;
  label: string;
  backendUrl: string;
  username: string;
  password: string;
}

export const defaultConnectionProfiles: ConnectionProfile[] = [
  {
    id: 'server-10-42-0-1',
    label: '本机面板 + 服务器 10.42.0.1',
    backendUrl: 'http://localhost:5590',
    username: '',
    password: ''
  },
  {
    id: 'local-dev',
    label: '本机开发 127.0.0.1',
    backendUrl: 'http://localhost:5590',
    username: '',
    password: ''
  },
  {
    id: 'custom',
    label: '自定义连接',
    backendUrl: '',
    username: '',
    password: ''
  }
];

export function listConnectionProfiles() {
  return invoke<ConnectionProfile[]>('list_connection_profiles');
}
