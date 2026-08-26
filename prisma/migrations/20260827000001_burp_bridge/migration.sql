-- Burp Bridge — live traffic ingestion, endpoint inventory, AI checklist,
-- engagement keys, anomaly flags, and finding ↔ traffic linkage.

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "burpScope" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "burpRetentionDays" INTEGER NOT NULL DEFAULT 90;

CREATE TABLE IF NOT EXISTS "EngagementKey" (
  id          TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  "keyHash"   TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL DEFAULT '',
  label       TEXT NOT NULL DEFAULT 'Burp extension',
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt"  TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "EngagementKey_projectId_idx" ON "EngagementKey"("projectId");
CREATE INDEX IF NOT EXISTS "EngagementKey_keyHash_idx" ON "EngagementKey"("keyHash");

CREATE TABLE IF NOT EXISTS "BurpTraffic" (
  id               TEXT PRIMARY KEY,
  "projectId"      TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  sha256           TEXT NOT NULL,
  method           TEXT NOT NULL,
  url              TEXT NOT NULL,
  host             TEXT NOT NULL,
  path             TEXT NOT NULL DEFAULT '',
  "pathNoQuery"    TEXT NOT NULL DEFAULT '',
  query            TEXT NOT NULL DEFAULT '',
  "statusCode"     INTEGER NOT NULL DEFAULT 0,
  "contentType"    TEXT NOT NULL DEFAULT '',
  "requestHeaders" TEXT NOT NULL DEFAULT '',
  "requestBody"    TEXT NOT NULL DEFAULT '',
  "responseHeaders" TEXT NOT NULL DEFAULT '',
  "responseBody"   TEXT NOT NULL DEFAULT '',
  tool             TEXT NOT NULL DEFAULT 'proxy',
  "sizeBytes"      INTEGER NOT NULL DEFAULT 0,
  truncated        BOOLEAN NOT NULL DEFAULT false,
  "scopeOk"        BOOLEAN NOT NULL DEFAULT true,
  anomalies        TEXT NOT NULL DEFAULT '[]',
  secrets          TEXT NOT NULL DEFAULT '[]',
  "findingId"      TEXT REFERENCES "Finding"(id) ON DELETE SET NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "BurpTraffic_projectId_sha256_key" ON "BurpTraffic"("projectId", sha256);
CREATE INDEX IF NOT EXISTS "BurpTraffic_projectId_createdAt_idx" ON "BurpTraffic"("projectId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "BurpTraffic_projectId_findingId_idx" ON "BurpTraffic"("projectId", "findingId");
CREATE INDEX IF NOT EXISTS "BurpTraffic_host_pathNoQuery_idx" ON "BurpTraffic"(host, "pathNoQuery");

CREATE TABLE IF NOT EXISTS "BurpEndpoint" (
  id             TEXT PRIMARY KEY,
  "projectId"    TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  method         TEXT NOT NULL,
  host           TEXT NOT NULL,
  path           TEXT NOT NULL,
  "sampleUrl"    TEXT NOT NULL DEFAULT '',
  "hitCount"     INTEGER NOT NULL DEFAULT 0,
  "statusCodes"  TEXT NOT NULL DEFAULT '[]',
  "firstSeenAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isJsAsset"    BOOLEAN NOT NULL DEFAULT false,
  anomalies      TEXT NOT NULL DEFAULT '[]',
  "testedCount"  INTEGER NOT NULL DEFAULT 0,
  "succeededCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "BurpEndpoint_projectId_method_host_path_key" ON "BurpEndpoint"("projectId", method, host, path);
CREATE INDEX IF NOT EXISTS "BurpEndpoint_projectId_lastSeenAt_idx" ON "BurpEndpoint"("projectId", "lastSeenAt" DESC);

CREATE TABLE IF NOT EXISTS "BurpChecklistItem" (
  id            TEXT PRIMARY KEY,
  "projectId"   TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  "endpointId"  TEXT REFERENCES "BurpEndpoint"(id) ON DELETE CASCADE,
  "parentId"    TEXT REFERENCES "BurpChecklistItem"(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,
  technique     TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  payload       TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'untested',
  "resultNote"  TEXT NOT NULL DEFAULT '',
  source        TEXT NOT NULL DEFAULT 'ai',
  "autoMarkedBy" TEXT NOT NULL DEFAULT '',
  "order"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BurpChecklistItem_projectId_status_idx" ON "BurpChecklistItem"("projectId", status);
CREATE INDEX IF NOT EXISTS "BurpChecklistItem_projectId_category_idx" ON "BurpChecklistItem"("projectId", category);
