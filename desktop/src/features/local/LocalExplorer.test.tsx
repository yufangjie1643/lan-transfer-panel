import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocalExplorer } from './LocalExplorer';
import type { FolderTreeNode } from './FolderTree';

const treeNodes: FolderTreeNode[] = [
  {
    id: 'C:\\',
    name: 'C:',
    path: 'C:\\',
    depth: 0,
    isExpanded: true,
    isSelected: false
  },
  {
    id: 'C:\\Users',
    name: 'Users',
    path: 'C:\\Users',
    depth: 1,
    isExpanded: false,
    isSelected: true
  }
];

describe('LocalExplorer', () => {
  it('combines a folder tree with the current directory details', () => {
    const onTreeSelect = vi.fn();
    const onOpenDirectory = vi.fn();

    render(
      <LocalExplorer
        labels={{
          title: '本地文件',
          tree: '本地目录树',
          details: '本地文件详情',
          refresh: '刷新本地文件'
        }}
        treeNodes={treeNodes}
        currentPath="C:\\Users"
        items={[
          { key: 'C:\\Users\\Downloads', name: 'Downloads', isDir: true },
          { key: 'C:\\Users\\report.txt', name: 'report.txt', isDir: false, size: 2048 }
        ]}
        selectedKeys={new Set(['C:\\Users\\report.txt'])}
        onTreeSelect={onTreeSelect}
        onTreeToggle={() => undefined}
        onSelectItem={() => undefined}
        onOpenDirectory={onOpenDirectory}
        onRefresh={() => undefined}
      />
    );

    expect(screen.getByLabelText('本地文件')).toBeInTheDocument();
    expect(screen.getByRole('tree', { name: '本地目录树' })).toBeInTheDocument();

    const details = screen.getByLabelText('本地文件详情');
    expect(within(details).getByText('Downloads')).toBeInTheDocument();
    expect(within(details).getByText('2.0 KB')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'C:' }));
    expect(onTreeSelect).toHaveBeenCalledWith('C:\\');

    fireEvent.doubleClick(within(details).getByText('Downloads'));
    expect(onOpenDirectory).toHaveBeenCalledWith('C:\\Users\\Downloads');
  });
});
