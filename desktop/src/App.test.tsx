import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App shell', () => {
  it('starts on the standalone SSH login screen with the LAN server preset', () => {
    render(<App />);

    expect(screen.getByRole('main')).toHaveClass('login-shell');
    expect(screen.getByLabelText('连接配置')).toHaveValue('server-10-42-0-1');
    expect(screen.getByLabelText('服务器地址')).toHaveValue('10.42.0.1');
    expect(screen.getByLabelText('SSH 端口')).toHaveValue(2687);
    expect(screen.queryByLabelText('远端文件')).not.toBeInTheDocument();
  });

  it('can switch the login language to English', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('语言'), { target: { value: 'en-US' } });

    expect(screen.getByRole('main')).toHaveTextContent('LAN Transfer');
    expect(screen.getByLabelText('Connection profile')).toBeInTheDocument();
  });
});
