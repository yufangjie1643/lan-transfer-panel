import { useCallback, useEffect, useState } from 'react';
import type { DownloadTasksResponse } from './api/types';
import { QueuePanel } from './features/queue/QueuePanel';
import { controlTransferTask, listTransferTasks } from './features/remote/sshRemote';
import { defaultLocale, messages, type Locale } from './i18n/messages';

const emptyTasks: DownloadTasksResponse = {
  globalStat: {},
  active: [],
  waiting: [],
  stopped: []
};

export function QueueWindow() {
  const [tasks, setTasks] = useState<DownloadTasksResponse>(emptyTasks);
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [error, setError] = useState<string | null>(null);
  const text = messages[locale];

  const loadTasks = useCallback(async () => {
    const nextTasks = await listTransferTasks();
    setTasks({
      globalStat: nextTasks.globalStat ?? {},
      active: Array.isArray(nextTasks.active) ? nextTasks.active : [],
      waiting: Array.isArray(nextTasks.waiting) ? nextTasks.waiting : [],
      stopped: Array.isArray(nextTasks.stopped) ? nextTasks.stopped : []
    });
  }, []);

  useEffect(() => {
    let canceled = false;
    async function tick() {
      try {
        await loadTasks();
        if (!canceled) setError(null);
      } catch (taskError) {
        if (!canceled) {
          setTasks(emptyTasks);
          setError(taskError instanceof Error ? taskError.message : text.errors.refreshFailed);
        }
      }
    }

    tick();
    const interval = window.setInterval(tick, 1500);
    return () => {
      canceled = true;
      window.clearInterval(interval);
    };
  }, [loadTasks, text.errors.refreshFailed]);

  return (
    <main className="queue-window-shell">
      <header className="top-bar">
        <strong>{text.queue.title}</strong>
        <label className="language-switch">
          {text.language.label}
          <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
            <option value="zh-CN">{text.language.zhCN}</option>
            <option value="en-US">{text.language.enUS}</option>
          </select>
        </label>
      </header>
      {error ? (
        <p className="connection-error app-error" role="alert">
          {error}
        </p>
      ) : null}
      <QueuePanel
        tasks={tasks}
        labels={text.queue}
        onControl={(gid, action) => {
          controlTransferTask(gid, action)
            .then(loadTasks)
            .catch((controlError) => {
              setError(
                controlError instanceof Error ? controlError.message : text.errors.queueControlFailed
              );
            });
        }}
      />
    </main>
  );
}
