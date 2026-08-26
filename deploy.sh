#!/bin/bash

# ==============================================================================
# AEGIS - Pentest Report Platform - Deploy Script
# ==============================================================================
# One unified script for local development and production deployment
# - Installs PostgreSQL if needed
# - Sets up database and credentials
# - Configures environment
# - Installs dependencies
# - Runs migrations
# - Builds application
# ==============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default configuration
DEPLOYMENT_MODE="${1:-development}"  # development or production
DB_HOST="localhost"
DB_PORT="5432"

if [[ "$DEPLOYMENT_MODE" == "development" ]]; then
    DB_NAME="pentest_dev"
    DB_USER="pentest_user"
    DB_PASSWORD="pentest_password"
    NODE_ENV="development"
elif [[ "$DEPLOYMENT_MODE" == "production" ]]; then
    DB_NAME="pentest_db"
    DB_USER="pentest_user"
    DB_PASSWORD="pentest_password_$(date +%s)"
    NODE_ENV="production"
    DB_HOST="${DB_HOST_PROD:-localhost}"
else
    echo -e "${RED}Usage: bash deploy.sh [development|production]${NC}"
    exit 1
fi

# ==============================================================================
# HEADER
# ==============================================================================
echo -e "${BLUE}"
cat << "EOF"
  ╔═══════════════════════════════════════╗
  ║  AEGIS - Pentest Report Platform      ║
  ║  Deployment Script                    ║
  ╚═══════════════════════════════════════╝
EOF
echo -e "${NC}\n"

echo -e "${YELLOW}Mode: ${DEPLOYMENT_MODE}${NC}"
echo -e "${YELLOW}Node Environment: ${NODE_ENV}${NC}\n"

# ==============================================================================
# 1. DETECT OS
# ==============================================================================
echo -e "${YELLOW}[1/8] Detecting OS...${NC}"
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macOS"
    echo -e "${GREEN}✓ macOS detected${NC}"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="Linux"
    echo -e "${GREEN}✓ Linux detected${NC}"
else
    echo -e "${RED}✗ Unsupported OS: $OSTYPE${NC}"
    exit 1
fi

# ==============================================================================
# 2. CHECK/INSTALL NODE.JS
# ==============================================================================
echo -e "\n${YELLOW}[2/8] Checking Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js not installed${NC}"
    echo "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi
NODE_VERSION=$(node --version)
echo -e "${GREEN}✓ Node.js $NODE_VERSION found${NC}"

# ==============================================================================
# 3. CHECK/INSTALL POSTGRESQL
# ==============================================================================
echo -e "\n${YELLOW}[3/8] Checking PostgreSQL...${NC}"
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}PostgreSQL not found. Installing...${NC}"

    if [[ "$OS" == "macOS" ]]; then
        if ! command -v brew &> /dev/null; then
            echo "Installing Homebrew..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        fi
        brew install postgresql@15
        brew services start postgresql@15
        echo -e "${GREEN}✓ PostgreSQL installed via Homebrew${NC}"
    elif [[ "$OS" == "Linux" ]]; then
        if [ -f /etc/debian_version ]; then
            sudo apt-get update
            sudo apt-get install -y postgresql postgresql-contrib
            sudo systemctl start postgresql
            sudo systemctl enable postgresql
        elif [ -f /etc/redhat-release ]; then
            sudo yum install -y postgresql-server postgresql-contrib
            sudo systemctl start postgresql
            sudo systemctl enable postgresql
        fi
        echo -e "${GREEN}✓ PostgreSQL installed${NC}"
    fi
else
    PG_VERSION=$(psql --version | head -c 20)
    echo -e "${GREEN}✓ PostgreSQL installed ($PG_VERSION)${NC}"
fi

# ==============================================================================
# 4. START POSTGRESQL SERVICE
# ==============================================================================
echo -e "\n${YELLOW}[4/8] Starting PostgreSQL service...${NC}"
if [[ "$OS" == "macOS" ]]; then
    brew services start postgresql@15 2>/dev/null || true
else
    sudo systemctl start postgresql 2>/dev/null || true
fi
sleep 2

# Verify service
if ! pg_isready -h $DB_HOST -p $DB_PORT &> /dev/null; then
    echo -e "${RED}✗ PostgreSQL service failed to start${NC}"
    exit 1
fi
echo -e "${GREEN}✓ PostgreSQL service running${NC}"

# ==============================================================================
# 5. CREATE DATABASE AND USER (NON-DESTRUCTIVE)
# ==============================================================================
# NEVER drop an existing database — a re-deploy against an existing instance
# must keep all its data. The role/database are created only if missing, and
# the timezone is re-asserted (idempotent).
echo -e "\n${YELLOW}[5/8] Setting up database (keeping existing data)...${NC}"

if [[ "$OS" == "macOS" ]]; then
    psql -U $(whoami) -d postgres -h $DB_HOST << EOF 2>/dev/null
SELECT 'CREATE ROLE "$DB_USER" LOGIN PASSWORD ''$DB_PASSWORD'''
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER')\gexec
SELECT 'CREATE DATABASE "$DB_NAME" OWNER "$DB_USER"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec
ALTER DATABASE "$DB_NAME" SET timezone TO 'UTC';
EOF
else
    sudo -u postgres psql -d postgres << EOF 2>/dev/null
SELECT 'CREATE ROLE "$DB_USER" LOGIN PASSWORD ''$DB_PASSWORD'''
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER')\gexec
SELECT 'CREATE DATABASE "$DB_NAME" OWNER "$DB_USER"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec
ALTER DATABASE "$DB_NAME" SET timezone TO 'UTC';
EOF
fi

echo -e "${GREEN}✓ Database '$DB_NAME' ready (existing data preserved)${NC}"
echo -e "${GREEN}✓ User '$DB_USER' ready${NC}"

# ==============================================================================
# 6. CONFIGURE ENVIRONMENT
# ==============================================================================
echo -e "\n${YELLOW}[6/8] Configuring environment...${NC}"

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

if [[ "$DEPLOYMENT_MODE" == "production" ]]; then
    NEXTAUTH_URL="${NEXTAUTH_URL_PROD:-http://localhost:3000}"
else
    NEXTAUTH_URL="http://localhost:3000"
fi

cat > .env << EOF
# Database Configuration
DATABASE_URL="$DATABASE_URL"

# Node Environment
NODE_ENV="$NODE_ENV"

# Authentication
NEXTAUTH_SECRET="$(openssl rand -base64 32 2>/dev/null || python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
NEXTAUTH_URL="$NEXTAUTH_URL"

# Encryption
ENCRYPTION_KEY="$(openssl rand -hex 16 2>/dev/null || python3 -c 'import secrets; print(secrets.token_hex(16))')"

# Teams Integration (optional)
# TEAMS_WEBHOOK_URL="https://outlook.webhook.office.com/..."
EOF

echo -e "${GREEN}✓ Environment configured${NC}"
echo -e "  Database: $DB_NAME"
echo -e "  User: $DB_USER"
echo -e "  Host: $DB_HOST:$DB_PORT"

# ==============================================================================
# 7. INSTALL DEPENDENCIES & MIGRATIONS
# ==============================================================================
echo -e "\n${YELLOW}[7/8] Installing dependencies and running migrations...${NC}"

echo "Installing npm packages..."
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"

echo "Generating Prisma client..."
npx prisma generate
echo -e "${GREEN}✓ Prisma client generated${NC}"

echo "Running database migrations..."
# Prisma 7 removed url from schema — run all SQL migrations directly via psql
for migration_dir in prisma/migrations/*/; do
    sql_file="${migration_dir}migration.sql"
    [[ ! -f "$sql_file" ]] && continue
    echo "  Applying: $(basename "$migration_dir")"
    psql "$DATABASE_URL" -f "$sql_file" 2>&1 | grep -v "^$" | grep -v "already exists" | grep -v "does not exist" | grep -v "^NOTICE" | head -10 || true
done
echo -e "${GREEN}✓ Migrations completed${NC}"

echo "Applying schema patches (idempotent)..."
psql "$DATABASE_URL" << 'PATCHES'
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "notes"                TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "assetOwner"           TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "assetOwners"          TEXT    NOT NULL DEFAULT '[]';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "targetCode"           TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "engagementYear"       TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "previousEngagementId" TEXT    DEFAULT NULL;
-- v2.0 environmental CVSS columns (schema-declared; without these the Prisma
-- client's SELECTs fail with "column does not exist" on a partially-migrated DB)
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
-- v2.2 notifications + watchers (runtime ensureEnvColumns also creates these,
-- but the deploy should be self-sufficient)
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
echo -e "${GREEN}✓ Schema patches applied${NC}"

# ==============================================================================
# 8. CREATE ADMIN USER
# ==============================================================================
echo -e "\n${YELLOW}[8/9] Creating admin user...${NC}"

# Hardcoded admin credentials (change password via Settings after login)
ADMIN_ID=$(node -e "console.log(require('crypto').randomUUID())")
ADMIN_NAME="Admin"
ADMIN_EMAIL="admin@aegis.local"
ADMIN_PASSWORD="admin123456"
ADMIN_INITIALS="AD"
# Pre-hashed password: bcryptjs.hashSync('admin123456', 12)
HASHED_PASS='$2b$12$kkan6o1kWR8Jz6SG6j845eklaXV71QNwAsoEs8dwH8sNzxnOQjMB2'

psql "$DATABASE_URL" << EOF 2>/dev/null
INSERT INTO "User" (id, name, initials, email, password, role, team, "createdAt")
VALUES (
  '$ADMIN_ID',
  '$ADMIN_NAME',
  '$ADMIN_INITIALS',
  '$ADMIN_EMAIL',
  '$HASHED_PASS',
  'admin',
  'Security',
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  name = '$ADMIN_NAME',
  password = '$HASHED_PASS',
  role = 'admin';
EOF

echo -e "${GREEN}✓ Admin user created${NC}"

# Save credentials to file
CREDS_FILE="./aegis-credentials.txt"
cat > "$CREDS_FILE" << CREDS
AEGIS Admin Credentials
Generated: $(date)
==============================
App URL    : http://localhost:3000
Admin Email: $ADMIN_EMAIL
Password   : $ADMIN_PASSWORD
  (⚠ Change this in Settings after first login!)
DB Host    : $DB_HOST:$DB_PORT
DB Name    : $DB_NAME
DB User    : $DB_USER
DB Password: $DB_PASSWORD
==============================
CREDS
chmod 600 "$CREDS_FILE"
echo -e "${GREEN}✓ Credentials saved to $CREDS_FILE${NC}"

# ==============================================================================
# 9. BUILD APPLICATION
# ==============================================================================
echo -e "\n${YELLOW}[9/10] Building application...${NC}"
npm run build
echo -e "${GREEN}✓ Application built${NC}"

# ==============================================================================
# SUCCESS - NEXT STEPS
# ==============================================================================
echo -e "\n${GREEN}"
cat << "EOF"
╔═══════════════════════════════════════╗
║  ✓ DEPLOYMENT COMPLETE!               ║
║  AEGIS is ready to run                ║
╚═══════════════════════════════════════╝
EOF
echo -e "${NC}\n"

echo -e "${BLUE}Admin Credentials (hardcoded):${NC}"
echo -e "  Email:    admin@aegis.local"
echo -e "  Password: admin123456"
echo -e "  ${YELLOW}Change this in Settings after login!${NC}"
echo ""

echo -e "${BLUE}Database Credentials:${NC}"
echo -e "  Host:     $DB_HOST:$DB_PORT"
echo -e "  Database: $DB_NAME"
echo -e "  User:     $DB_USER"
echo -e "  Password: $DB_PASSWORD"
echo ""

if [[ "$DEPLOYMENT_MODE" == "development" ]]; then
    echo -e "${BLUE}Start Development:${NC}"
    echo -e "  ${YELLOW}npm run dev${NC}"
    echo ""
    echo -e "${BLUE}Login:${NC}"
    echo -e "  Open http://localhost:3000"
    echo -e "  Email:    admin@aegis.local"
    echo -e "  Password: admin123456"
    echo ""
    echo -e "${BLUE}View Database:${NC}"
    echo -e "  ${YELLOW}npx prisma studio${NC}"
else
    echo -e "${BLUE}Start Production:${NC}"
    echo -e "  ${YELLOW}npm run start${NC}"
fi

echo ""
echo -e "${BLUE}Useful Commands:${NC}"
echo -e "  ${YELLOW}npx prisma studio${NC}     - View database UI"
echo -e "  ${YELLOW}npx prisma migrate reset${NC} - Reset database (⚠️ loses data)"
echo -e "  ${YELLOW}npm run build${NC}          - Build application"
echo ""
echo -e "${YELLOW}✓ All credentials saved to ${CREDS_FILE}${NC}"
echo ""

# Ask to start dev server
if [[ "$DEPLOYMENT_MODE" == "development" ]]; then
    read -p "Start development server now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm run dev
    fi
fi
