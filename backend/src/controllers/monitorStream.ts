import type { Request, Response } from 'express';
import { loadAdmin } from '../middleware/auth';
import { liveBus, type LiveEvent } from '../services/eventBus';

/**
 * Server-Sent Events stream for the live monitoring dashboard. Re-validates the admin session
 * periodically so a revoked/expired session stops receiving events.
 */
export async function monitorStream(req: Request, res: Response) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  res.write(`event: hello\ndata: ${JSON.stringify({ serverNow: new Date().toISOString() })}\n\n`);

  const onEvent = (e: LiveEvent) => {
    res.write(`event: security\nid: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`);
  };
  liveBus.on('event', onEvent);

  const keepAlive = setInterval(() => res.write(`: ping ${Date.now()}\n\n`), 15_000);
  const recheck = setInterval(async () => {
    const ctx = await loadAdmin(req).catch(() => null);
    if (!ctx) {
      res.write('event: unauthorized\ndata: {}\n\n');
      cleanup();
      res.end();
    }
  }, 60_000);

  function cleanup() {
    clearInterval(keepAlive);
    clearInterval(recheck);
    liveBus.off('event', onEvent);
  }
  req.on('close', cleanup);
}
