-- Vuln list orders all findings by (severity ASC, createdAt DESC). Without an
-- index Postgres must sort the whole table on every page load; with many
-- findings that adds up. Index matches the query's sort order exactly.
CREATE INDEX IF NOT EXISTS "Finding_severity_createdAt_idx" ON "Finding" (severity, "createdAt" DESC);
