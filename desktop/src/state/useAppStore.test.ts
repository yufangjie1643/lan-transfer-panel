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
});
