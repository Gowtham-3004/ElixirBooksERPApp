import { useSyncExternalStore } from 'react';

/** navigator.onLine, kept live via the window online/offline events. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => { window.addEventListener('online', cb); window.addEventListener('offline', cb); return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb); }; },
    () => (typeof navigator === 'undefined' ? true : navigator.onLine),
    () => true,
  );
}
