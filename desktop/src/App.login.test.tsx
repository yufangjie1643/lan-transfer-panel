import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

describe('App login flow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('logs in to the configured backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, username: 'admin' })
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('用户名')).toHaveValue('rclone'));
    expect(screen.getByLabelText('密码')).toHaveValue('loaded-secret');
    fireEvent.click(screen.getByRole('button', { name: '连接' }));

    await waitFor(() => expect(screen.getByText('已连接：admin')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:5590/api/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ username: 'rclone', password: 'loaded-secret' })
      })
    );
  });
});
