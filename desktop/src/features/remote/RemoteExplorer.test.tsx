import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RemoteExplorer } from './RemoteExplorer';
import type { FolderTreeNode } from '../local/FolderTree';
import { messages } from '../../i18n/messages';

const labels = messages['zh-CN'].explorer;

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
    id: 'server:/docs',
    name: 'docs',
    path: 'docs',
    depth: 1,
    isExpanded: false,
    isSelected: false
  }
];

const defaultProps = {
  labels: {
    tree: '远端目录树',
    expandFolder: (name: string) => `展开 ${name}`,
    collapseFolder: (name: string) => `折叠 ${name}`,
    toolbar: labels.toolbar,
    addressBar: labels.addressBar,
    fileList: labels.fileList,
    statusBar: labels.statusBar
  },
  remoteName: 'server',
  treeNodes,
  currentPath: '/',
  items: [
    { key: 'logs', name: 'logs', isDir: true },
    { key: 'logs_2.sqlite', name: 'logs_2.sqlite', isDir: false, size: 2048 }
  ],
  selectedKeys: new Set<string>(),
  canGoBack: false,
  canGoForward: false,
  canGoUp: true,
  isLoading: false,
  error: null,
  onTreeSelect: vi.fn(),
  onTreeToggle: vi.fn(),
  onNavigate: vi.fn(),
  onGoBack: vi.fn(),
  onGoForward: vi.fn(),
  onGoUp: vi.fn(),
  onRefresh: vi.fn(),
  onNewFolder: vi.fn(),
  onUploadSelected: vi.fn(),
  onDownloadSelected: vi.fn(),
  onDeleteSelected: vi.fn(),
  onOpenQueue: vi.fn(),
  onSelect: vi.fn(),
  onRangeSelect: vi.fn(),
  onToggleSelectAll: vi.fn(),
  onDoubleClickItem: vi.fn()
};

describe('RemoteExplorer', () => {
  it('renders toolbar, address bar, folder tree, file list and status bar', () => {
    render(<RemoteExplorer {...defaultProps} />);

    expect(screen.getByRole('toolbar', { name: labels.toolbar.back })).toBeInTheDocument();
    expect(screen.getByRole('tree', { name: '远端目录树' })).toBeInTheDocument();
    expect(screen.getByRole('grid')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'server:' })).toBeInTheDocument();
  });

  it('notifies when a tree folder is selected or toggled', () => {
    const onTreeSelect = vi.fn();
    const onTreeToggle = vi.fn();
    render(<RemoteExplorer {...defaultProps} onTreeSelect={onTreeSelect} onTreeToggle={onTreeToggle} />);

    const tree = screen.getByRole('tree', { name: '远端目录树' });
    fireEvent.click(within(tree).getByRole('button', { name: 'docs' }));
    expect(onTreeSelect).toHaveBeenCalledWith('docs');

    fireEvent.click(within(tree).getByRole('button', { name: '展开 docs' }));
    expect(onTreeToggle).toHaveBeenCalledWith('docs');
  });

  it('navigates when an address bar segment is clicked', () => {
    const onNavigate = vi.fn();
    render(<RemoteExplorer {...defaultProps} currentPath="/logs" onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: 'logs' }));
    expect(onNavigate).toHaveBeenCalledWith('/logs');
  });

  it('calls toolbar action handlers', () => {
    const onDownloadSelected = vi.fn();
    const onOpenQueue = vi.fn();
    render(
      <RemoteExplorer
        {...defaultProps}
        selectedKeys={new Set(['logs_2.sqlite'])}
        onDownloadSelected={onDownloadSelected}
        onOpenQueue={onOpenQueue}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: labels.toolbar.download }));
    expect(onDownloadSelected).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: labels.toolbar.queue }));
    expect(onOpenQueue).toHaveBeenCalled();
  });

  it('passes file list selections with additive=false by default', () => {
    const onSelect = vi.fn();
    render(<RemoteExplorer {...defaultProps} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('logs_2.sqlite'));
    expect(onSelect).toHaveBeenCalledWith('logs_2.sqlite', false);
  });

  it('passes file list selections with additive=true when ctrl is held', () => {
    const onSelect = vi.fn();
    render(<RemoteExplorer {...defaultProps} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('logs_2.sqlite'), { ctrlKey: true });
    expect(onSelect).toHaveBeenCalledWith('logs_2.sqlite', true);
  });

  it('notifies when a file list item is double-clicked', () => {
    const onDoubleClickItem = vi.fn();
    render(<RemoteExplorer {...defaultProps} onDoubleClickItem={onDoubleClickItem} />);

    fireEvent.doubleClick(screen.getByText('logs'));
    expect(onDoubleClickItem).toHaveBeenCalledWith(expect.objectContaining({ key: 'logs' }));
  });

  it('displays item and selection counts in the status bar', () => {
    render(<RemoteExplorer {...defaultProps} selectedKeys={new Set(['logs'])} />);

    expect(screen.getByText(labels.statusBar.items(2))).toBeInTheDocument();
    expect(screen.getByText(labels.statusBar.selected(1))).toBeInTheDocument();
  });
});
