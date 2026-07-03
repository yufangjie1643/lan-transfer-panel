import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueueWindow } from './QueueWindow';

describe('QueueWindow', () => {
  it('renders transfer tasks from the desktop queue', async () => {
    render(<QueueWindow />);

    await waitFor(() => expect(screen.getByRole('region', { name: '传输队列' })).toBeInTheDocument());
    expect(screen.getByText('ssh-1-logs_2.sqlite')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});
