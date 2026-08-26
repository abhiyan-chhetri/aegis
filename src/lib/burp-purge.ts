/**
 * Burp Bridge data purge — wipes all captured traffic, endpoints, checklist
 * items, WebSocket messages, pins, and engagement keys for a project. Called
 * automatically when a project is marked Completed (saves space) or manually
 * from the Burp settings. Returns the number of rows removed per table.
 */
import { db } from './db';

export interface PurgeCounts {
  traffic: number;
  endpoints: number;
  checklist: number;
  websocket: number;
  pins: number;
  keys: number;
  analysis: number;
  replays: number;
  total: number;
}

export async function purgeProjectBurpData(projectId: string): Promise<PurgeCounts> {
  const del = async (table: string): Promise<number> => {
    try {
      return await db.$executeRawUnsafe(
        `DELETE FROM "${table}" WHERE "projectId" = $1`, projectId,
      );
    } catch (e) {
      console.error(`[burp-purge] ${table} delete failed:`, e);
      return 0;
    }
  };

  const counts: PurgeCounts = {
    traffic: await del('BurpTraffic'),
    endpoints: await del('BurpEndpoint'),
    checklist: await del('BurpChecklistItem'),
    websocket: await del('BurpWebSocketMessage'),
    pins: await del('BurpPin'),
    keys: await del('EngagementKey'),
    analysis: await del('BurpAnalysisJob'),
    replays: await del('BurpReplayTask'),
    total: 0,
  };
  counts.total = counts.traffic + counts.endpoints + counts.checklist + counts.websocket + counts.pins + counts.keys + counts.analysis + counts.replays;
  return counts;
}
