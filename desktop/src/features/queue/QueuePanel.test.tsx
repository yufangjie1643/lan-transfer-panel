import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueuePanel } from './QueuePanel';

describe('QueuePanel', () => {
  it('shows active tasks and triggers pause', () => {
    const onControl = vi.fn();
    render(
      <QueuePanel
        tasks={{
          active: [
            {
              gid: 'abc',
              status: 'active',
              completedLength: '10',
              totalLength: '100',
              downloadSpeed: '5'
            }
          ],
          waiting: [],
          stopped: [],
          globalStat: {}
        }}
        onControl={onControl}
      />
    );

    expect(screen.getByText('abc')).toBeInTheDocument();
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.getByText('传输队列')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('暂停 abc'));
    expect(onControl).toHaveBeenCalledWith('abc', 'pause');
  });
});
