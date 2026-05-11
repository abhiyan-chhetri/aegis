/**
 * In-memory SSE broadcaster — singleton EventEmitter used by all API routes
 * to push real-time updates to subscribed clients without needing Redis.
 *
 * Works perfectly for single-server deployments (internal pentest tools).
 */
import { EventEmitter } from 'events';

declare global {
  // eslint-disable-next-line no-var
  var __aegis_broadcaster: EventEmitter | undefined;
}

if (!global.__aegis_broadcaster) {
  global.__aegis_broadcaster = new EventEmitter();
  global.__aegis_broadcaster.setMaxListeners(500);
}

export const broadcaster = global.__aegis_broadcaster;

/** Broadcast a message to all SSE subscribers on a channel. */
export function broadcast(channel: string, data: unknown): void {
  global.__aegis_broadcaster!.emit(channel, data);
}
