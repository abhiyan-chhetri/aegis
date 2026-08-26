-- AI chat (per-user private conversations, optionally scoped to a finding) +
-- AI usage/cost ledger for the $ tracking indicator.
CREATE TABLE IF NOT EXISTS "Chat" (
  id          TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "findingId" TEXT REFERENCES "Finding"(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'general',   -- 'general' | 'finding'
  title       TEXT NOT NULL DEFAULT 'New chat',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Chat_userId_idx" ON "Chat"("userId");
CREATE INDEX IF NOT EXISTS "Chat_findingId_idx" ON "Chat"("findingId");

CREATE TABLE IF NOT EXISTS "ChatMessage" (
  id           TEXT PRIMARY KEY,
  "chatId"     TEXT NOT NULL REFERENCES "Chat"(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,                     -- 'user' | 'assistant'
  content      TEXT NOT NULL DEFAULT '',
  "inputTokens"  INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  cost         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ChatMessage_chatId_idx" ON "ChatMessage"("chatId");

CREATE TABLE IF NOT EXISTS "AiUsageLog" (
  id            TEXT PRIMARY KEY,
  "userId"      TEXT,
  provider      TEXT NOT NULL DEFAULT '',
  model         TEXT NOT NULL DEFAULT '',
  feature       TEXT NOT NULL DEFAULT '',
  "inputTokens"  INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  cost          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");
