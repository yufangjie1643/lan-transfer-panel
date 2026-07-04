import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import App from './App';
import { useAppStore } from './state/useAppStore';

describe('remote shell after SSH login', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useAppStore.setState({
      backendUrl: 'http://10.42.0.1:5590',
      sessionUsername: null,
      remotes: [],
      remote: '',
      remotePath: '',
      remoteItems: [],
      selectedRemoteKeys: new Set(),
      error: null,
      appView: 'launcher',
      editingProfileId: undefined
    });
  });

  it('enters the remote file shell after submitting SSH credentials', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText('yufanssh')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '连接' }));

    await waitFor(() => expect(screen.getByText('已连接：yufan@10.42.0.1:2687')).toBeInTheDocument());
    expect(screen.getByRole('treeitem', { name: '/' })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: 'home' })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: 'yufan' })).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: 'logs_2.sqlite' })).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: '.codex' })).toBeInTheDocument();

    const addressBar = screen.getByTestId('address-bar');
    expect(within(addressBar).getByRole('button', { name: 'server' })).toBeInTheDocument();
    expect(within(addressBar).getByRole('button', { name: 'home' })).toBeInTheDocument();
    expect(within(addressBar).getByRole('button', { name: 'yufan' })).toBeInTheDocument();

    expect(screen.getByText('2 个项目')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下载' })).toBeDisabled();
    expect(screen.queryByText('选择服务器')).not.toBeInTheDocument();
  });

  it('selects a remote file and downloads it through the toolbar', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText('yufanssh')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    await waitFor(() => expect(screen.getByText('logs_2.sqlite')).toBeInTheDocument());

    fireEvent.click(screen.getByText('logs_2.sqlite'));
    await waitFor(() => expect(screen.getByText('已选择 1 个')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '下载' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '下载' }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('select_download_directory');
      expect(invoke).toHaveBeenCalledWith('download_ssh_file', {
        profile: expect.objectContaining({
          host: '10.42.0.1',
          port: 2687,
          username: 'yufan',
          authMethod: 'key'
        }),
        remotePath: '/home/yufan/logs_2.sqlite',
        localDir: 'D:\\download'
      });
      expect(invoke).not.toHaveBeenCalledWith(
        'start_ssh_download_task',
        expect.objectContaining({
          remotePath: '/home/yufan/logs_2.sqlite'
        })
      );
    });
  });

  it('selects a folder and downloads it recursively through the toolbar', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText('yufanssh')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    const codexCell = await waitFor(() => screen.getByRole('gridcell', { name: '.codex' }));

    fireEvent.click(codexCell);
    await waitFor(() => expect(screen.getByText('已选择 1 个')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '下载' }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('start_ssh_download_task', {
        profile: expect.objectContaining({
          host: '10.42.0.1',
          port: 2687,
          username: 'yufan',
          authMethod: 'key'
        }),
        remotePath: '/home/yufan/.codex',
        localDir: 'D:\\download',
        recursive: true,
        name: '.codex',
        size: undefined
      });
    });
    expect(screen.queryByText('文件夹下载已取消；当前只支持单文件下载。')).not.toBeInTheDocument();
  });

  it('opens the desktop transfer queue from the toolbar', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText('yufanssh')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    await waitFor(() => expect(screen.getByText('已连接：yufan@10.42.0.1:2687')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '队列' }));

    expect(WebviewWindow).toHaveBeenCalledWith(
      'transfer-queue',
      expect.objectContaining({ title: '传输队列' })
    );
  });

  it('starts a native drag for a remote file', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText('yufanssh')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    const fileCell = await waitFor(() =>
      screen.getByRole('gridcell', { name: 'logs_2.sqlite' })
    );
    const row = fileCell.closest('[role="row"]') as HTMLElement;

    fireEvent.mouseEnter(row);
    fireEvent.dragStart(row);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('prepare_ssh_virtual_file', {
        profile: expect.objectContaining({
          host: '10.42.0.1',
          port: 2687,
          username: 'yufan',
          authMethod: 'key'
        }),
        remotePath: '/home/yufan/logs_2.sqlite',
        name: 'logs_2.sqlite'
      });
      expect(invoke).toHaveBeenCalledWith('start_virtual_file_drag', {
        name: 'logs_2.sqlite',
        remotePath: '/home/yufan/logs_2.sqlite',
        localPath: 'D:\\Temp\\lan-transfer-virtual-drag\\logs_2.sqlite',
        size: 2048
      });
    });
  });
});
