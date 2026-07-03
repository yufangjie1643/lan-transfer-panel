import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App shell', () => {
  it('starts on the server launcher with saved profiles', async () => {
    render(<App />);
    expect(screen.getByRole('main')).toHaveClass('launcher-shell');
    expect(screen.getByText('选择服务器')).toBeInTheDocument();
    expect(screen.getByText('yufanssh')).toBeInTheDocument();
    expect(screen.queryByLabelText('远端文件')).not.toBeInTheDocument();
  });

  it('can switch the launcher language to English', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('语言'), { target: { value: 'en-US' } });
    expect(screen.getByRole('main')).toHaveTextContent('LAN Transfer');
    expect(screen.getByText('Select server')).toBeInTheDocument();
  });
});
