-- Burp Bridge v5 — AI secret analysis jobs + Burp replay pool.

CREATE TABLE IF NOT EXISTS "BurpAnalysisJob" (
  id          TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  "trafficId" TEXT REFERENCES "BurpTraffic"(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'js',   -- 'js' | 'response'
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | running | done | failed
  result      TEXT NOT NULL DEFAULT '',     -- JSON analysis result
  error       TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BurpAnalysisJob_projectId_status_idx" ON "BurpAnalysisJob"("projectId", status);

-- Requests whose server-side replay failed (target not reachable from the
-- Aegis host). The Burp extension polls this pool and fires them from the
-- tester's machine (Repeater + auto-send), posting the result back.
CREATE TABLE IF NOT EXISTS "BurpReplayTask" (
  id          TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  "trafficId" TEXT REFERENCES "BurpTraffic"(id) ON DELETE CASCADE,
  method      TEXT NOT NULL,
  url         TEXT NOT NULL,
  "requestHeaders" TEXT NOT NULL DEFAULT '{}',
  "requestBody"    TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | done | failed
  result      TEXT NOT NULL DEFAULT '',     -- JSON {statusCode,headers,body,durationMs,error}
  "sentVia"   TEXT NOT NULL DEFAULT 'burp',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BurpReplayTask_projectId_status_idx" ON "BurpReplayTask"("projectId", status);
