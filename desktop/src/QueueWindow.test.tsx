import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueueWindow } from './QueueWindow';

describe('QueueWindow', () => {
  it('renders transfer tasks from the backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/downloads/tasks')) {
          return json({
            globalStat: {},
            active: [
              {
                gid: 'gid-1',
                status: 'active',
                completedLength: '512',
                totalLength: '1024',
                downloadSpeed: '2048'
              }
            ],
            waiting: [],
            stopped: []
          });
        }
        return json({ ok: true });
      })
    );

    render(<QueueWindow />);

    await waitFor(() => expect(screen.getByRole('region', { name: '传输队列' })).toBeInTheDocument());
    expect(screen.getByText('gid-1')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });
});

function json(body: unknown) {
  return {
    ok: true,
    json: async () => body
  } as Response;
}
