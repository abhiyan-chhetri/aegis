#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  AEGIS — One-command Docker production deployment
#  Usage: ./docker-deploy.sh
#  Creates: PostgreSQL + Aegis app containers, seeds 1 admin account
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${BLUE}▶${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC} $*"; }
error()   { echo -e "${RED}✗${NC} $*" >&2; exit 1; }
banner()  { echo -e "\n${BOLD}$*${NC}"; }

# ── Config (override via env) ─────────────────────────────────────────────────
APP_PORT="${APP_PORT:-3000}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-aegis}"
DB_USER="${DB_USER:-aegis}"
DB_PASS="${DB_PASS:-$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 32)}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 64)}"
NETWORK="aegis-net"
DB_CONTAINER="aegis-db"
APP_CONTAINER="aegis-app"
IMAGE_NAME="aegis-app"

# ── Admin account (change before deploying!) ──────────────────────────────────
ADMIN_NAME="${ADMIN_NAME:-Admin}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@aegis.internal}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9!@#$%' | head -c 20)}"

banner "🛡️  AEGIS — Docker Production Deploy"
echo -e "   App port   : ${BOLD}${APP_PORT}${NC}"
echo -e "   DB container: ${BOLD}${DB_CONTAINER}${NC}"
echo ""

# ── Prerequisites ─────────────────────────────────────────────────────────────
command -v docker &>/dev/null || error "Docker not found. Install Docker first."
command -v node  &>/dev/null || warn "Node.js not found locally (only needed for build)"

# ── Stop & remove existing containers ────────────────────────────────────────
banner "1. Cleaning up existing containers"
for c in "$APP_CONTAINER" "$DB_CONTAINER"; do
  if docker ps -a --format '{{.Names}}' | grep -q "^${c}$"; then
    info "Stopping and removing: $c"
    docker stop "$c" &>/dev/null || true
    docker rm   "$c" &>/dev/null || true
    success "Removed $c"
  fi
done

# ── Docker network ────────────────────────────────────────────────────────────
banner "2. Creating Docker network"
if ! docker network ls --format '{{.Name}}' | grep -q "^${NETWORK}$"; then
  docker network create "$NETWORK"
  success "Created network: $NETWORK"
else
  success "Network already exists: $NETWORK"
fi

# ── PostgreSQL container ──────────────────────────────────────────────────────
banner "3. Starting PostgreSQL"
docker run -d \
  --name "$DB_CONTAINER" \
  --network "$NETWORK" \
  -e POSTGRES_DB="$DB_NAME" \
  -e POSTGRES_USER="$DB_USER" \
  -e POSTGRES_PASSWORD="$DB_PASS" \
  -p "${DB_PORT}:5432" \
  -v aegis-pgdata:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16-alpine
success "PostgreSQL started"

# ── Wait for DB to be ready ───────────────────────────────────────────────────
info "Waiting for PostgreSQL to be ready..."
for i in $(seq 1 30); do
  if docker exec "$DB_CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" &>/dev/null; then
    success "PostgreSQL is ready"
    break
  fi
  if [ "$i" -eq 30 ]; then error "PostgreSQL did not become ready in time"; fi
  sleep 2
done

# ── Run database migrations BEFORE build (idempotent, safe to re-run) ────────
banner "4. Running database migrations"
for migration_dir in $(ls -d prisma/migrations/*/ 2>/dev/null | sort); do
  sql_file="${migration_dir}migration.sql"
  [[ ! -f "$sql_file" ]] && continue
  info "Applying: $(basename "$migration_dir")"
  docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
    < "$sql_file" 2>&1 | grep -iv "^$\|already exists\|does not exist\|^NOTICE" | head -5 || true
done
success "Migrations completed"

info "Applying schema patches (idempotent)..."
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" << 'PATCHES'
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "notes"                TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "assetOwner"           TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "assetOwners"          TEXT    NOT NULL DEFAULT '[]';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "targetCode"           TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "engagementYear"       TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "previousEngagementId" TEXT    DEFAULT NULL;
-- v2.0 environmental CVSS columns (schema-declared)
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "dataClassification"   TEXT    NOT NULL DEFAULT 'C3';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "criticality"          TEXT    NOT NULL DEFAULT 'silver';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "engagementType"       TEXT    NOT NULL DEFAULT 'external';
ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "cvssLocked"           BOOLEAN NOT NULL DEFAULT false;
-- v2.3 report content sections
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "keySecurityStrengths"      TEXT NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "keyAreasForImprovement"    TEXT NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "immediateActions"          TEXT NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "shortTermImprovements"     TEXT NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "longTermRecommendations"   TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS "Activity" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "findingId" TEXT REFERENCES "Finding"(id) ON DELETE CASCADE,
  "projectId" TEXT REFERENCES "Project"(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  badge TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Activity_findingId_idx" ON "Activity"("findingId");
CREATE INDEX IF NOT EXISTS "Activity_projectId_idx" ON "Activity"("projectId");
CREATE TABLE IF NOT EXISTS "FindingComment" (
  id TEXT PRIMARY KEY,
  "findingId" TEXT NOT NULL REFERENCES "Finding"(id) ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  mentions TEXT NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "FindingComment_findingId_idx" ON "FindingComment"("findingId");
-- v2.2 notifications + watchers
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
CREATE TABLE IF NOT EXISTS "FindingWatcher" (
  "findingId" TEXT NOT NULL REFERENCES "Finding"(id) ON DELETE CASCADE,
  "userId"    TEXT NOT NULL REFERENCES "User"(id)    ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("findingId", "userId")
);
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

PATCHES
success "Schema patches applied"

# ── Build app image ───────────────────────────────────────────────────────────
banner "5. Building app image"
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_CONTAINER}:5432/${DB_NAME}"

# Write Dockerfile if it doesn't exist
cat > /tmp/aegis.Dockerfile << 'DOCKERFILE'
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
DOCKERFILE

docker build -f /tmp/aegis.Dockerfile -t "$IMAGE_NAME" . || {
  warn "Standalone build failed, trying standard build..."
  cat > /tmp/aegis-simple.Dockerfile << 'DOCKERFILE2'
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
DOCKERFILE2
  docker build -f /tmp/aegis-simple.Dockerfile -t "$IMAGE_NAME" .
}
success "App image built: $IMAGE_NAME"

# ── Start app container ───────────────────────────────────────────────────────
banner "6. Starting app container"
docker run -d \
  --name "$APP_CONTAINER" \
  --network "$NETWORK" \
  -p "${APP_PORT}:3000" \
  -e DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_CONTAINER}:5432/${DB_NAME}" \
  -e JWT_SECRET="$JWT_SECRET" \
  -e NODE_ENV="production" \
  -e NEXT_TELEMETRY_DISABLED="1" \
  -v aegis-reports:/app/public/reports \
  --restart unless-stopped \
  "$IMAGE_NAME"
success "App container started"

# ── Wait for app to be ready ──────────────────────────────────────────────────
info "Waiting for app to be ready..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${APP_PORT}/api/health" &>/dev/null || \
     curl -sf "http://localhost:${APP_PORT}/login" &>/dev/null; then
    success "App is ready"
    break
  fi
  if [ "$i" -eq 30 ]; then warn "App health check timed out — may still be starting"; fi
  sleep 3
done

# ── Create admin account (hardcoded credentials) ─────────────────────────────
banner "7. Creating admin account"

# Hardcoded admin credentials (change password via Settings after login)
ADMIN_ID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || date +%s%N | sha256sum | head -c 36)
ADMIN_EMAIL="admin@aegis.local"
ADMIN_NAME="Admin"
INITIALS="AD"
# Pre-hashed password: bcryptjs.hashSync('admin123456', 12)
HASHED_PASS='$2b$12$kkan6o1kWR8Jz6SG6j845eklaXV71QNwAsoEs8dwH8sNzxnOQjMB2'

docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" << EOSQL
INSERT INTO "User" (id, name, initials, email, password, role, team, "createdAt")
VALUES (
  '${ADMIN_ID}',
  '${ADMIN_NAME}',
  '${INITIALS}',
  '${ADMIN_EMAIL}',
  '${HASHED_PASS}',
  'admin',
  'Security',
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  name = '${ADMIN_NAME}',
  password = '${HASHED_PASS}',
  role = 'admin';
EOSQL
success "Admin account created: admin@aegis.local / admin123456"

# ── Summary ───────────────────────────────────────────────────────────────────
banner "🎉 Deployment Complete!"
echo ""
echo -e "  ${BOLD}App URL${NC}        : http://localhost:${APP_PORT}"
echo -e "  ${BOLD}Admin email${NC}    : ${GREEN}${ADMIN_EMAIL}${NC}"
echo -e "  ${BOLD}Admin password${NC} : ${GREEN}${ADMIN_PASSWORD}${NC}"
echo ""
echo -e "  ${YELLOW}⚠  Save these credentials — the password won't be shown again${NC}"
echo ""
echo -e "  ${BOLD}Containers${NC}:"
echo -e "    docker ps                        # check status"
echo -e "    docker logs ${APP_CONTAINER}     # app logs"
echo -e "    docker logs ${DB_CONTAINER}      # DB logs"
echo ""
echo -e "  ${BOLD}Stop everything${NC}:"
echo -e "    docker stop ${APP_CONTAINER} ${DB_CONTAINER}"
echo ""

# Save credentials to file (mode 600)
CREDS_FILE="./aegis-credentials.txt"
cat > "$CREDS_FILE" << CREDS
AEGIS Production Credentials
Generated: $(date)
==============================
App URL    : http://localhost:${APP_PORT}
Admin Email: ${ADMIN_EMAIL}
Password   : ${ADMIN_PASSWORD}
DB Password: ${DB_PASS}
JWT Secret : ${JWT_SECRET}
==============================
CREDS
chmod 600 "$CREDS_FILE"
success "Credentials saved to ${CREDS_FILE} (chmod 600)"
