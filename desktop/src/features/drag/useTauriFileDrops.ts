import { useEffect } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';

interface DropPayload {
  type: string;
  paths?: string[];
}

export function useTauriFileDrops(onDropPaths: (paths: string[]) => void) {
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload as DropPayload;
        if (payload.type === 'drop' && Array.isArray(payload.paths)) {
          onDropPaths(payload.paths);
        }
      })
      .then((listener) => {
        unlisten = listener;
      })
      .catch(() => {
        unlisten = undefined;
      });

    return () => unlisten?.();
  }, [onDropPaths]);
}
