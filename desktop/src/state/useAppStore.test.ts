import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAppStore } from './useAppStore';

describe('useAppStore', () => {
  it('defaults to launcher view', () => {
    const { result } = renderHook(() => useAppStore());
    expect(result.current.appView).toBe('launcher');
  });

  it('can set appView and editingProfileId', () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.setAppView('server-form');
      result.current.setEditingProfileId('profile-1');
    });
    expect(result.current.appView).toBe('server-form');
    expect(result.current.editingProfileId).toBe('profile-1');
  });

  it('sets remote items without clearing selection', () => {
    const { result } = renderHook(() => useAppStore());
    const items = [
      { Path: '/home/folder', Name: 'folder', IsDir: true, Size: 0, ModTime: '2024-01-01' },
      { Path: '/home/file.txt', Name: 'file.txt', IsDir: false, Size: 1024, ModTime: '2024-01-02' }
    ];

    act(() => {
      result.current.setSelectedRemoteKeys(new Set(['folder']));
      result.current.setRemoteItems('ssh', '/home', items);
    });

    expect(result.current.remote).toBe('ssh');
    expect(result.current.remotePath).toBe('/home');
    expect(result.current.remoteItems).toEqual(items);
    expect(result.current.selectedRemoteKeys).toEqual(new Set(['folder']));
  });
});
