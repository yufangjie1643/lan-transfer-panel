import { invoke } from '@tauri-apps/api/core';

export type AuthMethod = 'password' | 'key';

export interface ConnectionProfile {
  id: string;
  label: string;
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
  saveCredential: boolean;
}

export const defaultConnectionProfiles: ConnectionProfile[] = [
  {
    id: 'server-10-42-0-1',
    label: 'yufanssh',
    host: '10.42.0.1',
    port: 2687,
    username: 'yufan',
    authMethod: 'key',
    password: '',
    privateKeyPath: 'C:\\Users\\admin\\.ssh\\id_ed25519_local',
    saveCredential: false
  },
  {
    id: 'custom',
    label: '自定义连接',
    host: '',
    port: 22,
    username: '',
    authMethod: 'password',
    password: '',
    saveCredential: false
  }
];

export function listConnectionProfiles() {
  return invoke<ConnectionProfile[]>('list_connection_profiles');
}

export function saveConnectionProfile(profile: ConnectionProfile) {
  return invoke<ConnectionProfile[]>('save_connection_profile', { profile });
}

export function deleteConnectionProfile(id: string) {
  return invoke<ConnectionProfile[]>('delete_connection_profile', { id });
}
