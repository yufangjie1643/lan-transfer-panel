import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useAppStore } from './state/useAppStore';

describe('App launcher flow', () => {
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

  it('connects to the selected SSH profile from the launcher', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('yufanssh')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    await waitFor(() => expect(screen.getByText('已连接：yufan@10.42.0.1:2687')).toBeInTheDocument());
    expect(screen.getByText('logs_2.sqlite')).toBeInTheDocument();
  });

  it('navigates to add-server form and back', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('yufanssh')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '添加服务器' }));
    await waitFor(() => expect(screen.getByText('添加服务器')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(screen.getByText('选择服务器')).toBeInTheDocument());
  });
});
