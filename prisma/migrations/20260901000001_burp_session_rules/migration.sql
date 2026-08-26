-- Burp Bridge v6 — session-aware replay, capture rules, extension pairing.

ALTER TABLE "BurpTraffic" ADD COLUMN IF NOT EXISTS "isSession" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "burpCaptureRules" TEXT NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS "BurpTraffic_projectId_isSession_idx" ON "BurpTraffic"("projectId", "isSession");

CREATE TABLE IF NOT EXISTS "BurpPairing" (
  id          TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  "codeHash"  TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BurpPairing_codeHash_idx" ON "BurpPairing"("codeHash");
