import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ServerFormScreen } from './ServerFormScreen';
import type { ConnectionProfile } from './connectionProfiles';
import { messages } from '../../i18n/messages';

const labels = messages['zh-CN'].serverForm;

describe('ServerFormScreen', () => {
  it('renders empty form in add mode', () => {
    render(<ServerFormScreen labels={labels} onCancel={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole('heading')).toHaveTextContent('添加服务器');
    expect(screen.getByLabelText('配置名称')).toHaveValue('');
  });

  it('renders filled form in edit mode', () => {
    const profile: ConnectionProfile = {
      id: 'p1',
      label: 'home',
      host: '10.42.0.1',
      port: 2687,
      username: 'yufan',
      authMethod: 'password',
      password: 'secret',
      saveCredential: true
    };
    render(
      <ServerFormScreen labels={labels} profile={profile} onCancel={vi.fn()} onSave={vi.fn()} />
    );
    expect(screen.getByRole('heading')).toHaveTextContent('编辑服务器');
    expect(screen.getByLabelText('配置名称')).toHaveValue('home');
    expect(screen.getByLabelText('服务器地址')).toHaveValue('10.42.0.1');
  });

  it('shows validation errors and does not submit when required fields are empty', () => {
    const onSave = vi.fn();
    render(<ServerFormScreen labels={labels} onCancel={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByText('请输入配置名称')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('focuses the first invalid field after submitting an empty form', () => {
    render(<ServerFormScreen labels={labels} onCancel={vi.fn()} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByLabelText('配置名称', { exact: false })).toHaveFocus();
  });

  it('focuses the next invalid field after the first error is fixed', () => {
    render(<ServerFormScreen labels={labels} onCancel={vi.fn()} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    fireEvent.change(screen.getByLabelText('配置名称', { exact: false }), {
      target: { value: 'home' }
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByLabelText('服务器地址', { exact: false })).toHaveFocus();
  });

  it('calls onSave with form values when valid', () => {
    const onSave = vi.fn();
    render(<ServerFormScreen labels={labels} onCancel={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('配置名称'), { target: { value: 'home' } });
    fireEvent.change(screen.getByLabelText('服务器地址'), { target: { value: '10.42.0.1' } });
    fireEvent.change(screen.getByLabelText('SSH 端口'), { target: { value: '2687' } });
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'yufan' } });
    fireEvent.change(screen.getByLabelText('登录密码'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).toHaveBeenCalledOnce();
    const saved: ConnectionProfile = onSave.mock.calls[0][0];
    expect(saved.label).toBe('home');
    expect(saved.host).toBe('10.42.0.1');
    expect(saved.port).toBe(2687);
    expect(saved.username).toBe('yufan');
    expect(saved.password).toBe('secret');
  });

  it('calls onSaveAndConnect when that button is clicked', () => {
    const onSaveAndConnect = vi.fn();
    render(
      <ServerFormScreen
        labels={labels}
        onCancel={vi.fn()}
        onSave={vi.fn()}
        onSaveAndConnect={onSaveAndConnect}
      />
    );
    fireEvent.change(screen.getByLabelText('配置名称'), { target: { value: 'home' } });
    fireEvent.change(screen.getByLabelText('服务器地址'), { target: { value: '10.42.0.1' } });
    fireEvent.change(screen.getByLabelText('SSH 端口'), { target: { value: '2687' } });
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'yufan' } });
    fireEvent.change(screen.getByLabelText('登录密码'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '保存并连接' }));
    expect(onSaveAndConnect).toHaveBeenCalledOnce();
  });
});
