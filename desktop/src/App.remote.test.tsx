import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
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
      error: null
    });
  });

  it('enters the remote file shell after submitting SSH credentials', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('用户名')).toHaveValue('yufan'));
    fireEvent.click(screen.getByRole('button', { name: '连接' }));

    await waitFor(() => expect(screen.getByText('已连接：yufan@10.42.0.1:2687')).toBeInTheDocument());
    expect(screen.getByRole('treeitem', { name: '/' })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: 'home' })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: 'yufan' })).toBeInTheDocument();
    expect(screen.getByText('logs_2.sqlite')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下载到... logs_2.sqlite' })).toBeInTheDocument();
    expect(screen.getByLabelText('远程路径')).toHaveValue('/home/yufan');
    expect(screen.queryByText('本地文件')).not.toBeInTheDocument();
  });

  it('downloads a remote file through SSH after choosing a local directory', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('用户名')).toHaveValue('yufan'));
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    await waitFor(() => expect(screen.getByText('logs_2.sqlite')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '下载到... logs_2.sqlite' }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('select_download_directory');
      expect(invoke).toHaveBeenCalledWith('start_ssh_download_task', {
        profile: expect.objectContaining({
          host: '10.42.0.1',
          port: 2687,
          username: 'yufan',
          authMethod: 'key'
        }),
        remotePath: '/home/yufan/logs_2.sqlite',
        localDir: 'D:\\download',
        recursive: false,
        name: 'logs_2.sqlite',
        size: 2048
      });
    });
  });

  it('keeps folder downloads available from the download button', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('用户名')).toHaveValue('yufan'));
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '下载到... .codex' })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: '下载到... .codex' }));

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

  it('opens the desktop transfer queue after SSH login', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('用户名')).toHaveValue('yufan'));
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    await waitFor(() => expect(screen.getByText('已连接：yufan@10.42.0.1:2687')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '传输队列' }));

    expect(screen.queryByText('传输队列将在 SSH 下载接入后启用')).not.toBeInTheDocument();
  });
});
