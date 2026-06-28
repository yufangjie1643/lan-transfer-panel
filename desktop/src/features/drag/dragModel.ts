export type PaneKind = 'local' | 'remote';

export interface DropIntent {
  source: PaneKind;
  target: PaneKind;
  itemCount: number;
}

export function classifyDrop(intent: DropIntent): { action: 'upload' | 'download' | 'reject' } {
  if (intent.itemCount <= 0) return { action: 'reject' };
  if (intent.source === 'local' && intent.target === 'remote') return { action: 'upload' };
  if (intent.source === 'remote' && intent.target === 'local') return { action: 'download' };
  return { action: 'reject' };
}
