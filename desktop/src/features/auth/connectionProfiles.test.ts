import { invoke } from '@tauri-apps/api/core';
import { describe, expect, it } from 'vitest';
import { listConnectionProfiles } from './connectionProfiles';

describe('connectionProfiles', () => {
  it('loads connection profiles through Tauri invoke', async () => {
    const profiles = await listConnectionProfiles();

    expect(invoke).toHaveBeenCalledWith('list_connection_profiles');
    expect(profiles[0]).toEqual(
      expect.objectContaining({
        id: 'server-10-42-0-1',
        backendUrl: 'http://localhost:5590'
      })
    );
  });
});
