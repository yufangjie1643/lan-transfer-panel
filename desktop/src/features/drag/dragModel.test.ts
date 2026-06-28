import { describe, expect, it } from 'vitest';
import { classifyDrop } from './dragModel';

describe('classifyDrop', () => {
  it('uploads local files dropped on remote pane', () => {
    expect(classifyDrop({ source: 'local', target: 'remote', itemCount: 2 })).toEqual({
      action: 'upload'
    });
  });

  it('downloads remote files dropped on local pane', () => {
    expect(classifyDrop({ source: 'remote', target: 'local', itemCount: 1 })).toEqual({
      action: 'download'
    });
  });

  it('rejects same-pane drops for MVP', () => {
    expect(classifyDrop({ source: 'remote', target: 'remote', itemCount: 1 }).action).toBe('reject');
  });
});
