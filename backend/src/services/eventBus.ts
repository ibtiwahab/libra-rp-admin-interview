import { EventEmitter } from 'node:events';

export interface LiveEvent {
  id: string;
  eventType: string;
  severity: string;
  source: string;
  candidateId: string | null;
  attemptId: string | null;
  questionIndex: number | null;
  message: string;
  serverTimestamp: string;
  candidateName?: string | null;
  candidateCode?: string | null;
}

/**
 * In-process pub/sub feeding the live monitoring SSE stream.
 * For multi-instance deployments replace with Redis pub/sub or a MongoDB change stream on
 * `security_events` (see documentation/ARCHITECTURE.md).
 */
class LiveBus extends EventEmitter {
  publish(event: LiveEvent) {
    this.emit('event', event);
  }
}

export const liveBus = new LiveBus();
liveBus.setMaxListeners(200);
