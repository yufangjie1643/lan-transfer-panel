import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toolbar } from './Toolbar';
import { messages } from '../../i18n/messages';

const labels = messages['zh-CN'].explorer.toolbar;

describe('Toolbar', () => {
  it('renders navigation and action buttons', () => {
    render(
      <Toolbar
        labels={labels}
        canGoBack={false}
        canGoForward={false}
        canGoUp={true}
        hasSelection={false}
        onBack={vi.fn()}
        onForward={vi.fn()}
        onUp={vi.fn()}
        onRefresh={vi.fn()}
        onNewFolder={vi.fn()}
        onUpload={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        onOpenQueue={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: '上一级' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下载' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '删除' })).toBeDisabled();
  });

  it('enables download and delete when there is a selection', () => {
    render(
      <Toolbar
        labels={labels}
        canGoBack={true}
        canGoForward={false}
        canGoUp={true}
        hasSelection={true}
        onBack={vi.fn()}
        onForward={vi.fn()}
        onUp={vi.fn()}
        onRefresh={vi.fn()}
        onNewFolder={vi.fn()}
        onUpload={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        onOpenQueue={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: '后退' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '下载' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '删除' })).toBeEnabled();
  });

  it('calls callbacks when buttons are clicked', () => {
    const onRefresh = vi.fn();
    render(
      <Toolbar
        labels={labels}
        canGoBack={false}
        canGoForward={false}
        canGoUp={true}
        hasSelection={false}
        onBack={vi.fn()}
        onForward={vi.fn()}
        onUp={vi.fn()}
        onRefresh={onRefresh}
        onNewFolder={vi.fn()}
        onUpload={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        onOpenQueue={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(onRefresh).toHaveBeenCalled();
  });
});
