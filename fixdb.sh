#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  AEGIS — fixdb.sh
#
#  Safe re-deploy / schema-fix-up for an EXISTING production install.
#  - Does NOT drop or recreate the database.
#  - Does NOT touch user accounts, findings, projects, reports, or evidence.
#  - Applies every idempotent ALTER / CREATE so a fresh code checkout can run
#    against an older database without manual psql commands.
#
#  Usage:
#      bash fixdb.sh                       # detect connection from .env / DATABASE_URL
#      DATABASE_URL=postgresql://... bash fixdb.sh
#      DOCKER_DB_CONTAINER=aegis-db bash fixdb.sh    # patches inside docker container
#
#  Workflow when redeploying:
#      1) git pull            # get the new code
#      2) bash fixdb.sh       # bring DB schema up to date — KEEPS your data
#      3) npm install         # update dependencies
#      4) npx prisma generate # regenerate Prisma client for the new schema
#      5) npm run build       # rebuild Next.js
#      6) restart the app server (pm2 restart / docker restart / systemctl …)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${BLUE}▶${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC} $*"; }
error()   { echo -e "${RED}✗${NC} $*" >&2; exit 1; }
banner()  { echo -e "\n${BOLD}$*${NC}"; }

banner "🛡️  AEGIS — fixdb.sh (data-preserving schema patch)"

# ── 1. Resolve a working psql connection ────────────────────────────────────
DB_URL="${DATABASE_URL:-}"

# Fall back to .env if DATABASE_URL is not set in the environment
if [[ -z "$DB_URL" && -f .env ]]; then
  DB_URL="$(grep -E '^DATABASE_URL=' .env | head -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")" || true
fi

DOCKER_DB_CONTAINER="${DOCKER_DB_CONTAINER:-}"
USE_DOCKER=0
if [[ -n "$DOCKER_DB_CONTAINER" ]]; then
  USE_DOCKER=1
fi

# Auto-detect a running aegis-db docker container if DOCKER_DB_CONTAINER wasn't set
if [[ $USE_DOCKER -eq 0 && -z "$DB_URL" ]]; then
  if command -v docker &>/dev/null; then
    if docker ps --format '{{.Names}}' | grep -q '^aegis-db$'; then
      DOCKER_DB_CONTAINER="aegis-db"
      USE_DOCKER=1
      info "Auto-detected docker container: ${DOCKER_DB_CONTAINER}"
    fi
  fi
fi

if [[ $USE_DOCKER -eq 0 && -z "$DB_URL" ]]; then
  error "No DATABASE_URL found in environment or .env, and no aegis-db docker container detected. Set DATABASE_URL or DOCKER_DB_CONTAINER and re-run."
fi

if [[ $USE_DOCKER -eq 1 ]]; then
  if ! docker ps --format '{{.Names}}' | grep -q "^${DOCKER_DB_CONTAINER}$"; then
    error "Docker container ${DOCKER_DB_CONTAINER} is not running."
  fi
  # Derive credentials from the running container's env
  DB_USER="$(docker exec "${DOCKER_DB_CONTAINER}" printenv POSTGRES_USER 2>/dev/null || true)"
  DB_NAME="$(docker exec "${DOCKER_DB_CONTAINER}" printenv POSTGRES_DB 2>/dev/null || true)"
  if [[ -z "$DB_USER" || -z "$DB_NAME" ]]; then
    error "Could not read POSTGRES_USER / POSTGRES_DB from container ${DOCKER_DB_CONTAINER}."
  fi
  success "Will patch via docker container ${DOCKER_DB_CONTAINER} as ${DB_USER}@${DB_NAME}"
  run_sql() {
    docker exec -i "${DOCKER_DB_CONTAINER}" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" "$@"
  }
else
  if ! command -v psql &>/dev/null; then
    error "psql is not installed locally. Either install postgresql-client or set DOCKER_DB_CONTAINER to patch via Docker."
  fi
  success "Will patch directly via psql: ${DB_URL%%\?*}"
  run_sql() {
    PGPASSWORD_FROM_URL=""
    # psql understands DATABASE_URL directly
    psql -v ON_ERROR_STOP=1 "$DB_URL" "$@"
  }
fi

# ── 2. Show pre-patch row counts (useful confirmation we're not wiping data) ─
banner "Before — current row counts"
run_sql -At <<'SQL' || true
SELECT 'User'           AS table_name, COUNT(*)::text FROM "User"
UNION ALL SELECT 'Project',         COUNT(*)::text FROM "Project"
UNION ALL SELECT 'Finding',         COUNT(*)::text FROM "Finding"
UNION ALL SELECT 'Report',          COUNT(*)::text FROM "Report"
UNION ALL SELECT 'Evidence',        COUNT(*)::text FROM "Evidence"
UNION ALL SELECT 'Activity',        COUNT(*)::text FROM "Activity"
UNION ALL SELECT 'FindingComment',  COUNT(*)::text FROM "FindingComment"
UNION ALL SELECT 'AuditLog',        COUNT(*)::text FROM "AuditLog";
SQL

# ── 3. Apply every idempotent schema patch we ship ──────────────────────────
banner "Applying schema patches (idempotent — safe to re-run)"
run_sql <<'SQL'
-- v1.4 / multi-engagement support
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "notes"                TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "assetOwner"           TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "assetOwners"          TEXT    NOT NULL DEFAULT '[]';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "targetCode"           TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "engagementYear"       TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "previousEngagementId" TEXT    DEFAULT NULL;

-- v1.5 / activity feed
CREATE TABLE IF NOT EXISTS "Activity" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "findingId" TEXT REFERENCES "Finding"(id) ON DELETE CASCADE,
  "projectId" TEXT REFERENCES "Project"(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  badge  TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Activity_findingId_idx" ON "Activity"("findingId");
CREATE INDEX IF NOT EXISTS "Activity_projectId_idx" ON "Activity"("projectId");

-- v1.5 / comments + @mentions
CREATE TABLE IF NOT EXISTS "FindingComment" (
  id TEXT PRIMARY KEY,
  "findingId" TEXT NOT NULL REFERENCES "Finding"(id) ON DELETE CASCADE,
  "userId"    TEXT NOT NULL REFERENCES "User"(id)    ON DELETE CASCADE,
  content     TEXT NOT NULL,
  mentions    TEXT NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "FindingComment_findingId_idx" ON "FindingComment"("findingId");

-- v1.8 / drag-to-reorder findings
ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 999999;
CREATE INDEX IF NOT EXISTS "Finding_projectId_sortOrder_idx" ON "Finding"("projectId", "sortOrder");

-- v2.0 / data classification + asset criticality (drives CVSS environmental adj)
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "dataClassification" TEXT NOT NULL DEFAULT 'C3';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "criticality"        TEXT NOT NULL DEFAULT 'silver';

-- v2.1 / per-finding lock to bypass env-aware CVSS adjustment
ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "cvssLocked" BOOLEAN NOT NULL DEFAULT false;

-- v2.2 / SLA tracking — projects flagged internal vs external, each with own SLA matrix
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "engagementType" TEXT NOT NULL DEFAULT 'external';

-- v2.2 / mention + watcher notifications
CREATE TABLE IF NOT EXISTS "Notification" (
  id TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  link        TEXT NOT NULL DEFAULT '',
  "actorId"   TEXT REFERENCES "User"(id) ON DELETE SET NULL,
  "findingId" TEXT REFERENCES "Finding"(id) ON DELETE CASCADE,
  read        BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Notification_userId_read_idx" ON "Notification"("userId", read);
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx"   ON "Notification"("createdAt");

CREATE TABLE IF NOT EXISTS "FindingWatcher" (
  "findingId" TEXT NOT NULL REFERENCES "Finding"(id) ON DELETE CASCADE,
  "userId"    TEXT NOT NULL REFERENCES "User"(id)    ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("findingId", "userId")
);

-- v2.3 / Report Content — Strengths, Areas for Improvement, Recommendations
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "keySecurityStrengths"      TEXT NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "keyAreasForImprovement"    TEXT NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "immediateActions"          TEXT NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "shortTermImprovements"     TEXT NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "longTermRecommendations"   TEXT NOT NULL DEFAULT '';

-- ══ Burp Bridge + AI chat + perf (v3.0+) — idempotent, NEVER drops data ══

-- AI chat (per-user private conversations, optionally scoped to a finding)
CREATE TABLE IF NOT EXISTS "Chat" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "findingId" TEXT REFERENCES "Finding"(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL DEFAULT 'New chat',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Chat_userId_idx" ON "Chat"("userId");
CREATE INDEX IF NOT EXISTS "Chat_findingId_idx" ON "Chat"("findingId");

CREATE TABLE IF NOT EXISTS "ChatMessage" (
  id TEXT PRIMARY KEY,
  "chatId" TEXT NOT NULL REFERENCES "Chat"(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ChatMessage_chatId_idx" ON "ChatMessage"("chatId");

CREATE TABLE IF NOT EXISTS "AiUsageLog" (
  id TEXT PRIMARY KEY,
  "userId" TEXT,
  provider TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  feature TEXT NOT NULL DEFAULT '',
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");

-- Burp Bridge project settings
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "burpScope" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "burpRetentionDays" INTEGER NOT NULL DEFAULT 90;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "burpCaptureRules" TEXT NOT NULL DEFAULT '{}';

-- Engagement keys (Burp extension auth — hash-only storage)
CREATE TABLE IF NOT EXISTS "EngagementKey" (
  id TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  "keyHash" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT 'Burp extension',
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "EngagementKey_projectId_idx" ON "EngagementKey"("projectId");
CREATE INDEX IF NOT EXISTS "EngagementKey_keyHash_idx" ON "EngagementKey"("keyHash");

-- Captured traffic (raw headers incl. cookies — replay + session flows)
CREATE TABLE IF NOT EXISTS "BurpTraffic" (
  id TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  sha256 TEXT NOT NULL,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  host TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '',
  "pathNoQuery" TEXT NOT NULL DEFAULT '',
  query TEXT NOT NULL DEFAULT '',
  "statusCode" INTEGER NOT NULL DEFAULT 0,
  "contentType" TEXT NOT NULL DEFAULT '',
  "requestHeaders" TEXT NOT NULL DEFAULT '',
  "requestBody" TEXT NOT NULL DEFAULT '',
  "responseHeaders" TEXT NOT NULL DEFAULT '',
  "responseBody" TEXT NOT NULL DEFAULT '',
  tool TEXT NOT NULL DEFAULT 'proxy',
  "sizeBytes" INTEGER NOT NULL DEFAULT 0,
  truncated BOOLEAN NOT NULL DEFAULT false,
  "scopeOk" BOOLEAN NOT NULL DEFAULT true,
  "isSession" BOOLEAN NOT NULL DEFAULT false,
  anomalies TEXT NOT NULL DEFAULT '[]',
  secrets TEXT NOT NULL DEFAULT '[]',
  "findingId" TEXT REFERENCES "Finding"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "BurpTraffic_projectId_sha256_key" ON "BurpTraffic"("projectId", sha256);
CREATE INDEX IF NOT EXISTS "BurpTraffic_projectId_createdAt_idx" ON "BurpTraffic"("projectId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "BurpTraffic_projectId_findingId_idx" ON "BurpTraffic"("projectId", "findingId");
CREATE INDEX IF NOT EXISTS "BurpTraffic_host_pathNoQuery_idx" ON "BurpTraffic"(host, "pathNoQuery");
CREATE INDEX IF NOT EXISTS "BurpTraffic_projectId_host_method_created_idx" ON "BurpTraffic"("projectId", host, method, "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "BurpTraffic_projectId_contentType_idx" ON "BurpTraffic"("projectId", "contentType");
CREATE INDEX IF NOT EXISTS "BurpTraffic_projectId_isSession_idx" ON "BurpTraffic"("projectId", "isSession");

-- Fast ILIKE search at scale (pg_trgm GIN indexes)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "BurpTraffic_url_trgm" ON "BurpTraffic" USING gin (url gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "BurpTraffic_path_trgm" ON "BurpTraffic" USING gin ("pathNoQuery" gin_trgm_ops);

-- Normalized endpoint inventory
CREATE TABLE IF NOT EXISTS "BurpEndpoint" (
  id TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  host TEXT NOT NULL,
  path TEXT NOT NULL,
  "sampleUrl" TEXT NOT NULL DEFAULT '',
  "hitCount" INTEGER NOT NULL DEFAULT 0,
  "statusCodes" TEXT NOT NULL DEFAULT '[]',
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isJsAsset" BOOLEAN NOT NULL DEFAULT false,
  anomalies TEXT NOT NULL DEFAULT '[]',
  "testedCount" INTEGER NOT NULL DEFAULT 0,
  "succeededCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "BurpEndpoint_projectId_method_host_path_key" ON "BurpEndpoint"("projectId", method, host, path);
CREATE INDEX IF NOT EXISTS "BurpEndpoint_projectId_lastSeenAt_idx" ON "BurpEndpoint"("projectId", "lastSeenAt" DESC);

-- AI attack checklist (evidence-based, auto-confirmed, bypass playbook)
CREATE TABLE IF NOT EXISTS "BurpChecklistItem" (
  id TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  "endpointId" TEXT REFERENCES "BurpEndpoint"(id) ON DELETE CASCADE,
  "parentId" TEXT REFERENCES "BurpChecklistItem"(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  technique TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'untested',
  "resultNote" TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'ai',
  "autoMarkedBy" TEXT NOT NULL DEFAULT '',
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BurpChecklistItem_projectId_status_idx" ON "BurpChecklistItem"("projectId", status);
CREATE INDEX IF NOT EXISTS "BurpChecklistItem_projectId_category_idx" ON "BurpChecklistItem"("projectId", category);
CREATE INDEX IF NOT EXISTS "BurpChecklistItem_projectId_source_idx" ON "BurpChecklistItem"("projectId", source);

-- Interesting rail pins (reference a traffic row OR a checklist item)
CREATE TABLE IF NOT EXISTS "BurpPin" (
  id TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  "trafficId" TEXT REFERENCES "BurpTraffic"(id) ON DELETE CASCADE,
  "checklistItemId" TEXT REFERENCES "BurpChecklistItem"(id) ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BurpPin_projectId_idx" ON "BurpPin"("projectId");
CREATE INDEX IF NOT EXISTS "BurpPin_checklistItemId_idx" ON "BurpPin"("checklistItemId");

-- WebSocket capture
CREATE TABLE IF NOT EXISTS "BurpWebSocketMessage" (
  id TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  host TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  direction TEXT NOT NULL DEFAULT 'sent',
  content TEXT NOT NULL DEFAULT '',
  tool TEXT NOT NULL DEFAULT 'proxy',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BurpWebSocketMessage_projectId_createdAt_idx" ON "BurpWebSocketMessage"("projectId", "createdAt" DESC);

-- AI analysis jobs (JS deep-reads: secrets / endpoints / internal URLs)
CREATE TABLE IF NOT EXISTS "BurpAnalysisJob" (
  id TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  "trafficId" TEXT REFERENCES "BurpTraffic"(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'js',
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BurpAnalysisJob_projectId_status_idx" ON "BurpAnalysisJob"("projectId", status);

-- Replay pool — the Burp extension pulls these and fires them locally
CREATE TABLE IF NOT EXISTS "BurpReplayTask" (
  id TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  "trafficId" TEXT REFERENCES "BurpTraffic"(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  "requestHeaders" TEXT NOT NULL DEFAULT '{}',
  "requestBody" TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT NOT NULL DEFAULT '',
  "sentVia" TEXT NOT NULL DEFAULT 'burp',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BurpReplayTask_projectId_status_idx" ON "BurpReplayTask"("projectId", status);

-- One-time extension pairing codes (auto-provisioning)
CREATE TABLE IF NOT EXISTS "BurpPairing" (
  id TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BurpPairing_codeHash_idx" ON "BurpPairing"("codeHash");

-- Findings list perf (severity + recency)
CREATE INDEX IF NOT EXISTS "Finding_severity_createdAt_idx" ON "Finding"(severity, "createdAt" DESC);

-- Refresh planner statistics after the schema changes
ANALYZE "BurpTraffic";
ANALYZE "BurpEndpoint";
ANALYZE "BurpChecklistItem";

-- Future idempotent patches — append here, never DROP existing tables/columns
SQL
success "All schema patches applied"

# ── 4. Show post-patch counts (sanity confirmation) ─────────────────────────
banner "After — row counts (should match before)"
run_sql -At <<'SQL'
SELECT 'User'           AS table_name, COUNT(*)::text FROM "User"
UNION ALL SELECT 'Project',         COUNT(*)::text FROM "Project"
UNION ALL SELECT 'Finding',         COUNT(*)::text FROM "Finding"
UNION ALL SELECT 'Report',          COUNT(*)::text FROM "Report"
UNION ALL SELECT 'Evidence',        COUNT(*)::text FROM "Evidence"
UNION ALL SELECT 'Activity',        COUNT(*)::text FROM "Activity"
UNION ALL SELECT 'FindingComment',  COUNT(*)::text FROM "FindingComment"
UNION ALL SELECT 'AuditLog',        COUNT(*)::text FROM "AuditLog";
SQL

# ── 5. v2.0 backfill: default every project to C3/silver, recompute all CVSS ─
# Idempotent: existing non-default values are left alone; only NULL / empty
# columns get the default. Skipped silently if the column already has data.
banner "Backfilling v2.0 environmental defaults (only where empty)"
run_sql <<'SQL' || true
UPDATE "Project"
   SET "dataClassification" = 'C3'
 WHERE "dataClassification" IS NULL OR "dataClassification" = '';
UPDATE "Project"
   SET "criticality" = 'silver'
 WHERE "criticality" IS NULL OR "criticality" = '';
SQL
success "Backfill complete"

# ── 6. Suggest the rest of the redeploy flow ────────────────────────────────
banner "🎉 Database is up-to-date. Existing data is untouched."
echo ""
echo -e "${BOLD}Now finish the redeploy:${NC}"
echo -e "  ${YELLOW}npm install${NC}              # update dependencies"
echo -e "  ${YELLOW}npx prisma generate${NC}      # regenerate Prisma client for new schema"
echo -e "  ${YELLOW}npm run build${NC}            # rebuild Next.js"
echo ""
echo -e "  Then restart the app server:"
echo -e "  ${YELLOW}pm2 restart aegis${NC}          # if using pm2"
echo -e "  ${YELLOW}docker restart aegis-app${NC}    # if using docker"
echo -e "  ${YELLOW}systemctl restart aegis${NC}     # if using systemd"
echo ""
echo -e "${BOLD}One-time v2.0 step (optional but recommended):${NC}"
echo -e "  After restart, open each project, click ${YELLOW}Edit${NC}, confirm or change"
echo -e "  ${YELLOW}Data Classification${NC} and ${YELLOW}Asset Criticality${NC}, then save."
echo -e "  Existing findings will be automatically re-scored against the new"
echo -e "  environmental matrix. Until then, all projects default to"
echo -e "  ${YELLOW}C3 (Confidential) · Silver${NC} — a neutral starting point that doesn't"
echo -e "  adjust existing CVSS scores."
echo ""
