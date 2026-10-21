'use client';

import { useEffect, useRef } from 'react';
import type { ClientSignal } from '@/services/exam';

export interface ViolationDetails {
  trigger: string;
  visibilityState: string;
  hasFocus: boolean;
  elapsedMs: number;
}

/**
 * Focus & visibility enforcement for an active examination.
 *
 * What a browser CAN observe, and is monitored here:
 *  - the tab becoming hidden (tab switch, minimise, OS screen lock)   → visibilitychange
 *  - the window losing focus (Alt+Tab, another app/window, devtools)  → window blur
 *  - the page being closed, reloaded or navigated away from           → pagehide / beforeunload
 *
 * What a browser CANNOT observe (and this code does not pretend to): other applications,
 * background processes, screen recorders, a second device. See documentation/SECURITY.md.
 *
 * The first signal wins; duplicates are suppressed. Monitoring arms only once the attempt is live.
 */
export function useExamGuard({ armed, onViolation }: { armed: boolean; onViolation: (type: ClientSignal, details: ViolationDetails, unloading: boolean) => void }) {
  const cb = useRef(onViolation);
  cb.current = onViolation;

  useEffect(() => {
    if (!armed) return;
    const armedAt = performance.now();
    let fired = false;

    const fire = (type: ClientSignal, trigger: string, unloading = false) => {
      if (fired) return;
      fired = true;
      cb.current(type, { trigger, visibilityState: document.visibilityState, hasFocus: document.hasFocus(), elapsedMs: Math.round(performance.now() - armedAt) }, unloading);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') fire('TAB_HIDDEN', 'visibilitychange');
    };
    // Only the window itself losing focus counts — element-level blur events never reach here,
    // but guard explicitly in case a browser re-targets them.
    const onBlur = (e: FocusEvent) => {
      if (e.target === window) fire('WINDOW_BLURRED', 'blur');
    };
    const onPageHide = () => fire('PAGE_EXIT', 'pagehide', true);
    const onBeforeUnload = () => fire('PAGE_EXIT', 'beforeunload', true);
    const onFreeze = () => fire('TAB_HIDDEN', 'freeze', true);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('freeze', onFreeze);

    // The environment must already be compliant at the moment monitoring arms.
    if (document.visibilityState !== 'visible') fire('TAB_HIDDEN', 'armed-while-hidden');
    else if (!document.hasFocus()) fire('WINDOW_BLURRED', 'armed-while-unfocused');

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('freeze', onFreeze);
    };
  }, [armed]);
}
