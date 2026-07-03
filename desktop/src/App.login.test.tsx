import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

describe('App login flow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('logs in with the selected SSH profile', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('用户名')).toHaveValue('yufan'));
    fireEvent.click(screen.getByRole('button', { name: '连接' }));

    await waitFor(() => expect(screen.getByText('已连接：yufan@10.42.0.1:2687')).toBeInTheDocument());
    expect(screen.getByText('logs_2.sqlite')).toBeInTheDocument();
  });
});
