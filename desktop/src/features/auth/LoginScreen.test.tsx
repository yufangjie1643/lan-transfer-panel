import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginScreen } from './LoginScreen';
import type { ConnectionProfile } from './connectionProfiles';
import { messages } from '../../i18n/messages';

const profiles: ConnectionProfile[] = [
  {
    id: 'server-10-42-0-1',
    label: 'yufanssh',
    host: '10.42.0.1',
    port: 2687,
    username: 'yufan',
    authMethod: 'key',
    privateKeyPath: 'C:\\Users\\admin\\.ssh\\id_ed25519_local',
    password: '',
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

describe('LoginScreen', () => {
  it('defaults to the LAN server profile and submits loaded server credentials', () => {
    const onSubmit = vi.fn();

    render(
      <LoginScreen
        labels={messages['zh-CN'].login}
        profiles={profiles}
        isConnecting={false}
        error={null}
        onSubmit={onSubmit}
        onSaveProfile={() => undefined}
        onDeleteProfile={() => undefined}
      />
    );

    expect(screen.getByLabelText('连接配置')).toHaveValue('server-10-42-0-1');
    expect(screen.getByLabelText('服务器地址')).toHaveValue('10.42.0.1');
    expect(screen.getByLabelText('SSH 端口')).toHaveValue(2687);
    expect(screen.getByLabelText('用户名')).toHaveValue('yufan');
    expect(screen.getByLabelText('私钥路径')).toHaveValue('C:\\Users\\admin\\.ssh\\id_ed25519_local');

    fireEvent.click(screen.getByRole('button', { name: '连接' }));

    expect(onSubmit).toHaveBeenCalledWith({
      id: 'server-10-42-0-1',
      label: 'yufanssh',
      host: '10.42.0.1',
      port: 2687,
      username: 'yufan',
      authMethod: 'key',
      password: '',
      privateKeyPath: 'C:\\Users\\admin\\.ssh\\id_ed25519_local',
      passphrase: '',
      saveCredential: false
    });
  });

  it('allows switching to a custom connection', () => {
    render(
      <LoginScreen
        labels={messages['zh-CN'].login}
        profiles={profiles}
        isConnecting={false}
        error={null}
        onSubmit={() => undefined}
        onSaveProfile={() => undefined}
        onDeleteProfile={() => undefined}
      />
    );

    fireEvent.change(screen.getByLabelText('连接配置'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('服务器地址'), {
      target: { value: '10.42.0.88' }
    });

    expect(screen.getByLabelText('服务器地址')).toHaveValue('10.42.0.88');
    expect(screen.getByLabelText('用户名')).toHaveValue('');
  });
});
