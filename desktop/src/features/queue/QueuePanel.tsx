import { Pause, Play, Trash2 } from 'lucide-react';
import type { DownloadTasksResponse } from '../../api/types';
import { defaultMessages } from '../../i18n/messages';

type QueueAction = 'pause' | 'unpause' | 'remove' | 'purge';
type QueueLabels = typeof defaultMessages.queue;

interface QueuePanelProps {
  tasks: DownloadTasksResponse;
  onControl: (gid: string, action: QueueAction) => void;
  labels?: QueueLabels;
}

export function QueuePanel({ tasks, onControl, labels = defaultMessages.queue }: QueuePanelProps) {
  const allTasks = [...tasks.active, ...tasks.waiting, ...tasks.stopped];
  const text = labels;

  return (
    <section className="queue-panel" aria-label={text.title}>
      <div className="queue-header">
        <strong>{text.title}</strong>
        <span>{text.taskCount(allTasks.length)}</span>
      </div>
      <div className="queue-list">
        {allTasks.map((task) => (
          <div className="queue-row" key={task.gid}>
            <span className="queue-gid">{task.gid}</span>
            <span>{task.status || ''}</span>
            <span>{formatProgress(task.completedLength, task.totalLength)}</span>
            <span>{formatSpeed(task.downloadSpeed)}</span>
            {task.errorMessage ? <span className="queue-error">{task.errorMessage}</span> : null}
            <button type="button" aria-label={text.pause(task.gid)} onClick={() => onControl(task.gid, 'pause')}>
              <Pause size={14} />
            </button>
            <button type="button" aria-label={text.resume(task.gid)} onClick={() => onControl(task.gid, 'unpause')}>
              <Play size={14} />
            </button>
            <button type="button" aria-label={text.remove(task.gid)} onClick={() => onControl(task.gid, 'remove')}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatProgress(done?: string, total?: string) {
  const doneNumber = Number(done ?? 0);
  const totalNumber = Number(total ?? 0);
  if (!totalNumber) return '';
  return `${Math.round((doneNumber / totalNumber) * 100)}%`;
}

function formatSpeed(speed?: string) {
  const value = Number(speed ?? 0);
  if (!value) return '';
  if (value < 1024) return `${value} B/s`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB/s`;
  return `${(value / 1024 / 1024).toFixed(1)} MB/s`;
}
