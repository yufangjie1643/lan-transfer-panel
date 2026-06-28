import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FolderTree, type FolderTreeNode } from './FolderTree';

const nodes: FolderTreeNode[] = [
  {
    id: 'C:\\',
    name: 'C:',
    path: 'C:\\',
    depth: 0,
    isExpanded: false,
    isSelected: false
  },
  {
    id: 'C:\\Users',
    name: 'Users',
    path: 'C:\\Users',
    depth: 1,
    isExpanded: true,
    isSelected: true
  }
];

describe('FolderTree', () => {
  it('renders a selectable nested directory tree', () => {
    const onSelect = vi.fn();
    const onToggle = vi.fn();

    render(
      <FolderTree
        ariaLabel="本地目录树"
        nodes={nodes}
        onSelect={onSelect}
        onToggle={onToggle}
      />
    );

    const tree = screen.getByRole('tree', { name: '本地目录树' });
    expect(within(tree).getByRole('treeitem', { name: /Users/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    fireEvent.click(screen.getByRole('button', { name: '展开 C:' }));
    expect(onToggle).toHaveBeenCalledWith('C:\\');

    fireEvent.click(screen.getByRole('button', { name: 'Users' }));
    expect(onSelect).toHaveBeenCalledWith('C:\\Users');
  });
});
