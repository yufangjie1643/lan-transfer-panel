import { invoke } from '@tauri-apps/api/core';

export interface ConnectionProfile {
  id: string;
  label: string;
  backendUrl?: string;
  host?: string;
  port?: number;
  username: string;
  password: string;
  authMethod?: 'password' | 'key';
  privateKeyPath?: string;
  passphrase?: string;
  saveCredential?: boolean;
}

export const defaultConnectionProfiles: ConnectionProfile[] = [
  {
    id: 'server-10-42-0-1',
    label: '本机面板 + 服务器 10.42.0.1',
    backendUrl: 'http://localhost:5590',
    host: '10.42.0.1',
    port: 22,
    username: '',
    password: '',
    authMethod: 'password',
    saveCredential: true
  },
  {
    id: 'local-dev',
    label: '本机开发 127.0.0.1',
    backendUrl: 'http://localhost:5590',
    host: '127.0.0.1',
    port: 22,
    username: '',
    password: '',
    authMethod: 'password',
    saveCredential: true
  },
  {
    id: 'custom',
    label: '自定义连接',
    backendUrl: '',
    host: '',
    port: 22,
    username: '',
    password: '',
    authMethod: 'password',
    saveCredential: true
  }
];

export function listConnectionProfiles() {
  return invoke<ConnectionProfile[]>('list_connection_profiles');
}
