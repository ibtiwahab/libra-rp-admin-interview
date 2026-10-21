'use client';

import { useEffect, useRef, useState } from 'react';
import type { SecurityEventRow } from '@/lib/types';

export type StreamState = 'connecting' | 'live' | 'reconnecting';

/**
 * Subscribes to the admin SSE stream. EventSource reconnects automatically; consumers should
 * also poll as a fallback because some proxies buffer event streams.
 */
export function useLiveStream(onEvent: (e: SecurityEventRow) => void) {
  const [state, setState] = useState<StreamState>('connecting');
  const cb = useRef(onEvent);
  cb.current = onEvent;

  useEffect(() => {
    const es = new EventSource('/api/monitor/stream');
    es.addEventListener('hello', () => setState('live'));
    es.addEventListener('security', (msg) => {
      try {
        cb.current(JSON.parse((msg as MessageEvent).data));
      } catch {
        /* ignore malformed */
      }
    });
    es.addEventListener('unauthorized', () => {
      es.close();
      window.location.assign('/admin/login?expired=1');
    });
    es.onerror = () => setState('reconnecting');
    es.onopen = () => setState('live');
    return () => es.close();
  }, []);

  return state;
}

/** Re-renders every `ms` milliseconds — for live countdowns. */
export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}
