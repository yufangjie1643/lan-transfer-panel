import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginScreen } from './LoginScreen';
import type { ConnectionProfile } from './connectionProfiles';
import { messages } from '../../i18n/messages';

const profiles: ConnectionProfile[] = [
  {
    id: 'server-10-42-0-1',
    label: '本机面板 + 服务器 10.42.0.1',
    backendUrl: 'http://localhost:5590',
    username: 'rclone',
    password: 'loaded-secret'
  },
  {
    id: 'local-dev',
    label: '本机开发 127.0.0.1',
    backendUrl: 'http://localhost:5590',
    username: 'admin',
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

describe('LoginScreen', () => {
  it('defaults to the local panel profile and submits loaded server credentials', () => {
    const onSubmit = vi.fn();

    render(
      <LoginScreen
        labels={messages['zh-CN'].login}
        profiles={profiles}
        isConnecting={false}
        error={null}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByLabelText('连接配置')).toHaveValue('server-10-42-0-1');
    expect(screen.getByLabelText('后端地址')).toHaveValue('http://localhost:5590');
    expect(screen.getByLabelText('用户名')).toHaveValue('rclone');
    expect(screen.getByLabelText('密码')).toHaveValue('loaded-secret');

    fireEvent.click(screen.getByRole('button', { name: '连接' }));

    expect(onSubmit).toHaveBeenCalledWith({
      backendUrl: 'http://localhost:5590',
      username: 'rclone',
      password: 'loaded-secret'
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
      />
    );

    fireEvent.change(screen.getByLabelText('连接配置'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('后端地址'), {
      target: { value: 'http://10.42.0.88:5590' }
    });

    expect(screen.getByLabelText('后端地址')).toHaveValue('http://10.42.0.88:5590');
    expect(screen.getByLabelText('用户名')).toHaveValue('');
  });
});
