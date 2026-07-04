import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AddressBar } from './AddressBar';
import { messages } from '../../i18n/messages';

const labels = messages['zh-CN'].explorer.addressBar;

describe('AddressBar', () => {
  it('renders breadcrumbs for the current path', () => {
    render(<AddressBar labels={labels} remoteName="server" path="/home/yufan" onNavigate={vi.fn()} />);
    expect(screen.getByText('server')).toBeInTheDocument();
    expect(screen.getByText('home')).toBeInTheDocument();
    expect(screen.getByText('yufan')).toBeInTheDocument();
  });

  it('calls onNavigate when a breadcrumb segment is clicked', () => {
    const onNavigate = vi.fn();
    render(<AddressBar labels={labels} remoteName="server" path="/home/yufan" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('home'));
    expect(onNavigate).toHaveBeenCalledWith('/home');
  });

  it('switches to edit mode and submits a new path', () => {
    const onNavigate = vi.fn();
    render(<AddressBar labels={labels} remoteName="server" path="/home/yufan" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: labels.editPath }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '/tmp' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledWith('/tmp');
  });
});
