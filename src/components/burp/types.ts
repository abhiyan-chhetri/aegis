// Shared UI types for the Burp Bridge tab.

export interface AnomalyFlag {
  type: string;
  label: string;
  severity: 'low' | 'medium' | 'high' | 'info';
}

export interface SecretHit {
  type: string;
  value: string;
  context: string;
}

export interface TrafficRow {
  id: string;
  method: string;
  url: string;
  host: string;
  pathNoQuery: string;
  query: string;
  statusCode: number;
  contentType: string;
  tool: string;
  sizeBytes: number;
  truncated: boolean;
  anomalies: AnomalyFlag[];
  secrets: SecretHit[];
  findingId: string | null;
  createdAt: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
}

export interface TrafficDetail extends TrafficRow {
  requestHeaders: Record<string, string>;
  requestBody: string;
  responseHeaders: Record<string, string>;
  responseBody: string;
  isSession?: boolean;
}

export interface EndpointRow {
  id: string;
  method: string;
  host: string;
  path: string;
  sampleUrl: string;
  hitCount: number;
  statusCodes: number[];
  firstSeenAt: string;
  lastSeenAt: string;
  isJsAsset: boolean;
  anomalies: AnomalyFlag[];
  testedCount: number;
  succeededCount: number;
}

export interface ChecklistItem {
  id: string;
  endpointId: string | null;
  parentId: string | null;
  category: string;
  technique: string;
  description: string;
  payload: string;
  status: 'untested' | 'tested' | 'succeeded' | 'failed' | 'blocked';
  resultNote: string;
  source: string;
  autoMarkedBy: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  epMethod?: string;
  epHost?: string;
  epPath?: string;
  epSampleUrl?: string;
}

export interface BurpStats {
  trafficTotal: number;
  trafficToday: number;
  anomalyTraffic: number;
  secretTraffic: number;
  outOfScope: number;
  lastIngest: string | null;
  endpoints: number;
  jsAssets: number;
  flaggedEndpoints: number;
  checklist: { untested: number; tested: number; succeeded: number; failed: number };
}

export interface BurpSettings {
  burpScope: string;
  burpRetentionDays: number;
}

export interface EngagementKey {
  id: string;
  keyPrefix: string;
  label: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface TrafficMatch {
  endpoint: {
    id: string;
    method: string;
    host: string;
    path: string;
    sampleUrl: string;
    hitCount: number;
    anomalies: AnomalyFlag[];
    isJsAsset: boolean;
  };
  score: number;
  matched: string[];
  samples: TrafficRow[];
}
