import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LauncherScreen } from './LauncherScreen';
import type { ConnectionProfile } from './connectionProfiles';
import { messages } from '../../i18n/messages';

const labels = messages['zh-CN'].launcher;

const profiles: ConnectionProfile[] = [
  {
    id: 'p1',
    label: 'home',
    host: '10.42.0.1',
    port: 2687,
    username: 'yufan',
    authMethod: 'password',
    password: 'secret',
    saveCredential: true
  },
  {
    id: 'p2',
    label: 'office',
    host: '192.168.1.10',
    port: 22,
    username: 'admin',
    authMethod: 'key',
    privateKeyPath: 'C:\\Users\\admin\\.ssh\\id_rsa',
    saveCredential: true
  }
];

describe('LauncherScreen', () => {
  it('renders profile cards', () => {
    render(
      <LauncherScreen
        labels={labels}
        profiles={profiles}
        onConnect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );
    expect(screen.getByText('home')).toBeInTheDocument();
    expect(screen.getByText('10.42.0.1:2687')).toBeInTheDocument();
    expect(screen.getByText('office')).toBeInTheDocument();
  });

  it('calls onConnect when connect button clicked', () => {
    const onConnect = vi.fn();
    render(
      <LauncherScreen
        labels={labels}
        profiles={profiles}
        onConnect={onConnect}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );
    fireEvent.click(screen.getAllByRole('button', { name: '连接' })[0]);
    expect(onConnect).toHaveBeenCalledWith(profiles[0]);
  });

  it('calls onEdit when edit link clicked', () => {
    const onEdit = vi.fn();
    render(
      <LauncherScreen
        labels={labels}
        profiles={profiles}
        onConnect={vi.fn()}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );
    fireEvent.click(screen.getAllByText('编辑')[0]);
    expect(onEdit).toHaveBeenCalledWith(profiles[0]);
  });

  it('requires confirmation before delete', () => {
    const onDelete = vi.fn();
    render(
      <LauncherScreen
        labels={labels}
        profiles={profiles}
        onConnect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={onDelete}
        onAdd={vi.fn()}
      />
    );
    fireEvent.click(screen.getAllByText('删除')[0]);
    expect(screen.getByText('确认删除？')).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('确认删除？'));
    expect(onDelete).toHaveBeenCalledWith('p1');
  });

  it('shows empty state when no profiles', () => {
    render(
      <LauncherScreen
        labels={labels}
        profiles={[]}
        onConnect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );
    expect(screen.getByText('还没有保存的服务器')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加服务器' })).toBeInTheDocument();
  });

  it('calls onAdd when add button clicked', () => {
    const onAdd = vi.fn();
    render(
      <LauncherScreen
        labels={labels}
        profiles={profiles}
        onConnect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={onAdd}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '添加服务器' }));
    expect(onAdd).toHaveBeenCalled();
  });

  it('displays inline error for a profile', () => {
    render(
      <LauncherScreen
        labels={labels}
        profiles={profiles}
        errors={{ p1: '连接超时' }}
        onConnect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );
    expect(screen.getByText('连接超时')).toBeInTheDocument();
  });
});
