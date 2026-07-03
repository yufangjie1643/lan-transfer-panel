import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilePane } from './FilePane';

describe('FilePane', () => {
  it('opens folders on double click and selects rows', () => {
    const onOpenDirectory = vi.fn();
    const onSelect = vi.fn();

    render(
      <FilePane
        title="远端文件"
        path="/home"
        items={[
          { key: 'docs', name: 'docs', isDir: true },
          { key: 'a.txt', name: 'a.txt', isDir: false, size: 12 }
        ]}
        selectedKeys={new Set()}
        onSelect={onSelect}
        onOpenDirectory={onOpenDirectory}
        onRefresh={() => undefined}
      />
    );

    fireEvent.click(screen.getByText('a.txt'));
    expect(onSelect).toHaveBeenCalledWith('a.txt', false);

    fireEvent.doubleClick(screen.getByText('docs'));
    expect(onOpenDirectory).toHaveBeenCalledWith('docs');
  });

  it('shows download actions for files and folders', () => {
    const onDownload = vi.fn();

    render(
      <FilePane
        title="远端文件"
        path="/home"
        items={[
          { key: 'docs', name: 'docs', isDir: true },
          { key: 'a.txt', name: 'a.txt', isDir: false, size: 12 }
        ]}
        selectedKeys={new Set()}
        onSelect={() => undefined}
        onOpenDirectory={() => undefined}
        onRefresh={() => undefined}
        downloadLabel="下载到..."
        onDownload={onDownload}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '下载到... a.txt' }));
    fireEvent.click(screen.getByRole('button', { name: '下载到... docs' }));

    expect(onDownload).toHaveBeenCalledWith('a.txt');
    expect(onDownload).toHaveBeenCalledWith('docs');
  });

  it('starts the managed download flow when a remote row is dragged out', () => {
    const onDragDownload = vi.fn();
    const dataTransfer = {
      effectAllowed: '',
      setData: vi.fn()
    };

    render(
      <FilePane
        title="远端文件"
        path="/home"
        items={[{
          key: '/mnt/data/Ironman.txt',
          name: 'Ironman.txt',
          isDir: false,
          size: 12
        }]}
        selectedKeys={new Set()}
        onSelect={() => undefined}
        onOpenDirectory={() => undefined}
        onRefresh={() => undefined}
        onDragDownload={onDragDownload}
      />
    );

    const row = screen.getByText('Ironman.txt').closest('.file-row');
    expect(row).toHaveAttribute('draggable', 'true');
    fireEvent.dragStart(row!, { dataTransfer });
    fireEvent.dragEnd(row!, { dataTransfer: { dropEffect: 'none' } });

    expect(dataTransfer.effectAllowed).toBe('copy');
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', '/mnt/data/Ironman.txt');
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      'application/x-lan-transfer-remote-path',
      JSON.stringify({ key: '/mnt/data/Ironman.txt', name: 'Ironman.txt', isDir: false })
    );
    expect(onDragDownload).toHaveBeenCalledWith('/mnt/data/Ironman.txt');
  });

  it('does not allow folder drag downloads', () => {
    const onDragDownload = vi.fn();
    const dataTransfer = {
      effectAllowed: '',
      setData: vi.fn()
    };

    render(
      <FilePane
        title="远端文件"
        path="/home"
        items={[{
          key: '/mnt/data/test',
          name: 'test',
          isDir: true
        }]}
        selectedKeys={new Set()}
        onSelect={() => undefined}
        onOpenDirectory={() => undefined}
        onRefresh={() => undefined}
        onDragDownload={onDragDownload}
      />
    );

    const row = screen.getByText('test').closest('.file-row');
    expect(row).toHaveAttribute('draggable', 'false');
    fireEvent.dragStart(row!, { dataTransfer });
    fireEvent.dragEnd(row!);

    expect(dataTransfer.setData).not.toHaveBeenCalled();
    expect(onDragDownload).not.toHaveBeenCalled();
  });

  it('preserves hidden file names in drag metadata', () => {
    const dataTransfer = {
      effectAllowed: '',
      setData: vi.fn()
    };

    render(
      <FilePane
        title="远端文件"
        path="/home"
        items={[{
          key: '/home/yufan/.bash_history',
          name: '.bash_history',
          isDir: false
        }]}
        selectedKeys={new Set()}
        onSelect={() => undefined}
        onOpenDirectory={() => undefined}
        onRefresh={() => undefined}
        onDragDownload={() => undefined}
      />
    );

    const row = screen.getByText('.bash_history').closest('.file-row');
    fireEvent.dragStart(row!, { dataTransfer });

    expect(dataTransfer.setData).toHaveBeenCalledWith(
      'application/x-lan-transfer-remote-path',
      JSON.stringify({ key: '/home/yufan/.bash_history', name: '.bash_history', isDir: false })
    );
  });

  it('starts managed download even when drop effect is copy', () => {
    const onDragDownload = vi.fn();

    render(
      <FilePane
        title="远端文件"
        path="/home"
        items={[{
          key: '/mnt/data/Ironman.txt',
          name: 'Ironman.txt',
          isDir: false,
          size: 12
        }]}
        selectedKeys={new Set()}
        onSelect={() => undefined}
        onOpenDirectory={() => undefined}
        onRefresh={() => undefined}
        onDragDownload={onDragDownload}
      />
    );

    const row = screen.getByText('Ironman.txt').closest('.file-row');
    fireEvent.dragEnd(row!, { dataTransfer: { dropEffect: 'none' } });

    expect(onDragDownload).toHaveBeenCalledWith('/mnt/data/Ironman.txt');
  });

  it('can hide the pane header when path chrome is not needed', () => {
    render(
      <FilePane
        title="本地文件"
        ariaLabel="本地文件"
        path="C:\\Users\\admin"
        items={[{ key: 'C:\\Users\\admin\\a.txt', name: 'a.txt', isDir: false, size: 12 }]}
        selectedKeys={new Set()}
        showHeader={false}
        onSelect={() => undefined}
        onOpenDirectory={() => undefined}
        onRefresh={() => undefined}
      />
    );

    expect(screen.getByLabelText('本地文件')).toBeInTheDocument();
    expect(screen.queryByText('本地文件')).not.toBeInTheDocument();
    expect(screen.queryByText('C:\\Users\\admin')).not.toBeInTheDocument();
    expect(screen.getByText('a.txt')).toBeInTheDocument();
  });
});
