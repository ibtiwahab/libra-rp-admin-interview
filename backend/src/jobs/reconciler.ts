import { env } from '../config/env';
import { logger } from '../config/logger';
import { expireStaleAssignments, reconcileAll } from '../services/examService';

/**
 * Background enforcement of server-side deadlines. Runs even when no browser is communicating:
 *  - closes questions whose deadline passed (TIMED_OUT) and advances the attempt,
 *  - ends attempts whose heartbeat stopped (abandoned / closed browser),
 *  - expires attempts past their hard ceiling and unstarted assignments past their window.
 *
 * Every transition is a compare-and-set, so running this in several API instances concurrently
 * is safe (the first instance wins; others become no-ops).
 */
export function startReconciler() {
  let running = false;
  let lastAssignmentSweep = 0;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await reconcileAll();
      if (r.heartbeats || r.expired) logger.info(r, 'reconciler ended attempts');
      if (Date.now() - lastAssignmentSweep > 60_000) {
        lastAssignmentSweep = Date.now();
        const n = await expireStaleAssignments();
        if (n) logger.info({ expiredAssignments: n }, 'expired stale assignments');
      }
    } catch (err) {
      logger.error({ err }, 'reconciler tick failed');
    } finally {
      running = false;
    }
  };

  const handle = setInterval(tick, env.RECONCILE_INTERVAL_MS);
  handle.unref();
  void tick();
  return () => clearInterval(handle);
}
