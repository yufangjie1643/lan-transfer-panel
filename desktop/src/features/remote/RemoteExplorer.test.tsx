import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RemoteExplorer } from './RemoteExplorer';
import type { FolderTreeNode } from '../local/FolderTree';

const treeNodes: FolderTreeNode[] = [
  {
    id: 'server:',
    name: 'server:',
    path: '',
    depth: 0,
    isExpanded: true,
    isSelected: true
  },
  {
    id: 'server:/logs',
    name: 'logs',
    path: 'logs',
    depth: 1,
    isExpanded: false,
    isSelected: false
  }
];

describe('RemoteExplorer', () => {
  it('renders the remote tree on the left and remote file details on the right', () => {
    const onTreeSelect = vi.fn();
    const onOpenDirectory = vi.fn();

    render(
      <RemoteExplorer
        labels={{
          title: '远端文件',
          tree: '远端目录树',
          details: '远端文件详情',
          refresh: '刷新远端文件',
          path: '远程路径',
          openPath: '打开路径',
          expandFolder: (name) => `展开 ${name}`,
          collapseFolder: (name) => `折叠 ${name}`
        }}
        treeNodes={treeNodes}
        currentPath="server:/"
        pathValue="server:/"
        onPathValueChange={() => undefined}
        onPathSubmit={() => undefined}
        items={[
          { key: 'logs', name: 'logs', isDir: true },
          { key: 'logs_2.sqlite', name: 'logs_2.sqlite', isDir: false, size: 2048 }
        ]}
        selectedKeys={new Set()}
        onTreeSelect={onTreeSelect}
        onTreeToggle={() => undefined}
        onSelectItem={() => undefined}
        onOpenDirectory={onOpenDirectory}
        onRefresh={() => undefined}
      />
    );

    const tree = screen.getByRole('tree', { name: '远端目录树' });
    expect(within(tree).getByRole('treeitem', { name: 'logs' })).toBeInTheDocument();

    const details = screen.getByLabelText('远端文件详情');
    expect(within(details).getByText('logs_2.sqlite')).toBeInTheDocument();

    fireEvent.click(within(tree).getByRole('button', { name: 'logs' }));
    expect(onTreeSelect).toHaveBeenCalledWith('logs');

    fireEvent.doubleClick(within(details).getByText('logs'));
    expect(onOpenDirectory).toHaveBeenCalledWith('logs');
  });
});
