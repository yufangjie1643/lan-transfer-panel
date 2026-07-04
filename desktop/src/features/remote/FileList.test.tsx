import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FileList } from './FileList';
import { messages } from '../../i18n/messages';

const labels = messages['zh-CN'].explorer.fileList;

const items = [
  { key: 'a.txt', name: 'a.txt', isDir: false, modified: '2026-07-01', size: 1024, mimeType: 'text/plain' },
  { key: 'b', name: 'b', isDir: true, modified: '2026-06-28' },
  { key: 'c.png', name: 'c.png', isDir: false, modified: '2026-07-02', size: 2048, mimeType: 'image/png' }
];

describe('FileList', () => {
  it('renders column headers', () => {
    render(
      <FileList
        labels={labels}
        items={items}
        selectedKeys={new Set()}
        sortKey="name"
        sortDirection="asc"
        onSort={vi.fn()}
        onSelect={vi.fn()}
        onRangeSelect={vi.fn()}
        onDoubleClick={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />
    );
    expect(screen.getByText('名称')).toBeInTheDocument();
    expect(screen.getByText('修改日期')).toBeInTheDocument();
    expect(screen.getByText('类型')).toBeInTheDocument();
    expect(screen.getByText('大小')).toBeInTheDocument();
  });

  it('calls onSort when a column header is clicked', () => {
    const onSort = vi.fn();
    render(
      <FileList
        labels={labels}
        items={items}
        selectedKeys={new Set()}
        sortKey="name"
        sortDirection="asc"
        onSort={onSort}
        onSelect={vi.fn()}
        onRangeSelect={vi.fn()}
        onDoubleClick={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('名称'));
    expect(onSort).toHaveBeenCalledWith('name');
  });

  it('selects an item on click', () => {
    const onSelect = vi.fn();
    render(
      <FileList
        labels={labels}
        items={items}
        selectedKeys={new Set()}
        sortKey="name"
        sortDirection="asc"
        onSort={vi.fn()}
        onSelect={onSelect}
        onRangeSelect={vi.fn()}
        onDoubleClick={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('a.txt'));
    expect(onSelect).toHaveBeenCalled();
  });

  it('calls onDoubleClick when a row is double-clicked', () => {
    const onDoubleClick = vi.fn();
    render(
      <FileList
        labels={labels}
        items={items}
        selectedKeys={new Set()}
        sortKey="name"
        sortDirection="asc"
        onSort={vi.fn()}
        onSelect={vi.fn()}
        onRangeSelect={vi.fn()}
        onDoubleClick={onDoubleClick}
        onToggleSelectAll={vi.fn()}
      />
    );
    fireEvent.doubleClick(screen.getByText('b'));
    expect(onDoubleClick).toHaveBeenCalledWith(expect.objectContaining({ key: 'b' }));
  });
});
