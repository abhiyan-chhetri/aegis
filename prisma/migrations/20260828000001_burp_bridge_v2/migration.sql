-- Burp Bridge v2 — interesting-rail pins, WebSocket capture, session fingerprinting.

CREATE TABLE IF NOT EXISTS "BurpPin" (
  id          TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  "trafficId" TEXT REFERENCES "BurpTraffic"(id) ON DELETE CASCADE,
  "userId"    TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  note        TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BurpPin_projectId_idx" ON "BurpPin"("projectId");

CREATE TABLE IF NOT EXISTS "BurpWebSocketMessage" (
  id          TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  host        TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL DEFAULT '',
  direction   TEXT NOT NULL DEFAULT 'sent',   -- 'sent' | 'received'
  content     TEXT NOT NULL DEFAULT '',
  tool        TEXT NOT NULL DEFAULT 'proxy',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BurpWebSocketMessage_projectId_createdAt_idx" ON "BurpWebSocketMessage"("projectId", "createdAt" DESC);
