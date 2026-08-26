-- Burp Bridge v4 — performance at scale (10k+ traffic rows).
-- pg_trgm GIN indexes make the ILIKE searches (url / path) fast instead of a
-- full sequential scan over every row (and its multi-KB bodies).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "BurpTraffic_url_trgm" ON "BurpTraffic" USING gin (url gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "BurpTraffic_path_trgm" ON "BurpTraffic" USING gin ("pathNoQuery" gin_trgm_ops);

-- Flow / match / sample queries filter by (projectId, host, method) then sort by time.
CREATE INDEX IF NOT EXISTS "BurpTraffic_projectId_host_method_created_idx"
  ON "BurpTraffic"("projectId", host, method, "createdAt" DESC);

-- Auto-confirm + listing filter by source quickly.
CREATE INDEX IF NOT EXISTS "BurpChecklistItem_projectId_source_idx" ON "BurpChecklistItem"("projectId", source);

-- Auto-confirm only scans HTML responses.
CREATE INDEX IF NOT EXISTS "BurpTraffic_projectId_contentType_idx" ON "BurpTraffic"("projectId", "contentType");

-- Refresh planner statistics after the schema change.
ANALYZE "BurpTraffic";
ANALYZE "BurpEndpoint";
ANALYZE "BurpChecklistItem";
