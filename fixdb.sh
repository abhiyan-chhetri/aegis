#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  AEGIS — Schema patch script
#  Applies missing columns to an already-deployed database.
#  Safe to re-run: every ALTER TABLE uses IF NOT EXISTS.
#
#  Usage (auto-detect):
#    ./fixdb.sh
#
#  Usage (local psql with explicit URL):
#    DATABASE_URL="postgresql://user:pass@host:5432/db" ./fixdb.sh
#
#  Usage (Docker):
#    DOCKER=1 ./fixdb.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${BLUE}▶${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC} $*"; }
error()   { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

echo -e "\n${BOLD}🛡️  AEGIS — Database Schema Patch${NC}\n"

# ── SQL patches (all idempotent) ──────────────────────────────────────────────
PATCHES=$(cat << 'SQL'
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "notes"                TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "assetOwner"           TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "assetOwners"          TEXT    NOT NULL DEFAULT '[]';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "targetCode"           TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "engagementYear"       TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "previousEngagementId" TEXT    DEFAULT NULL;
SQL
)

# ── Detect mode ───────────────────────────────────────────────────────────────

# Mode 1: Docker — look for running aegis-db container
if [[ "${DOCKER:-}" == "1" ]] || docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^aegis-db$"; then
  DB_CONTAINER="${DB_CONTAINER:-aegis-db}"
  DB_USER="${DB_USER:-aegis}"
  DB_NAME="${DB_NAME:-aegis}"

  if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    error "Docker container '${DB_CONTAINER}' is not running. Start it first: docker start ${DB_CONTAINER}"
  fi

  info "Detected Docker container: ${DB_CONTAINER}"
  info "Applying patches to ${DB_NAME} as ${DB_USER}..."

  echo "$PATCHES" | docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
    2>&1 | grep -v "^$\|^ALTER\|^NOTICE" || true

  success "All schema patches applied via Docker"

# Mode 2: Local DATABASE_URL (from .env or environment)
elif [[ -n "${DATABASE_URL:-}" ]]; then
  info "Using DATABASE_URL from environment"
  info "Applying patches..."

  echo "$PATCHES" | psql "$DATABASE_URL" 2>&1 | grep -v "^$\|^ALTER\|^NOTICE" || true

  success "All schema patches applied"

# Mode 3: Load DATABASE_URL from .env file
elif [[ -f ".env" ]]; then
  # Extract DATABASE_URL from .env (handles quotes)
  DB_URL=$(grep '^DATABASE_URL=' .env | head -1 | sed 's/DATABASE_URL=//' | tr -d '"'"'" | tr -d "'")

  if [[ -z "$DB_URL" ]]; then
    error "DATABASE_URL not found in .env"
  fi

  info "Loaded DATABASE_URL from .env"
  info "Applying patches..."

  echo "$PATCHES" | psql "$DB_URL" 2>&1 | grep -v "^$\|^ALTER\|^NOTICE" || true

  success "All schema patches applied"

# Mode 4: Fallback — try default dev credentials
else
  warn "No DATABASE_URL or Docker container found. Trying default dev credentials..."
  DB_URL="postgresql://pentest_user:pentest_password@localhost:5432/pentest_dev"

  if ! psql "$DB_URL" -c '\q' &>/dev/null; then
    echo ""
    echo -e "${RED}Cannot connect to database.${NC} Supply credentials one of these ways:"
    echo ""
    echo "  # Via environment variable:"
    echo "  DATABASE_URL='postgresql://user:pass@host:5432/db' ./fixdb.sh"
    echo ""
    echo "  # Via Docker (auto-detects aegis-db container):"
    echo "  DOCKER=1 ./fixdb.sh"
    echo ""
    echo "  # Or put DATABASE_URL in .env and re-run:"
    echo "  ./fixdb.sh"
    echo ""
    exit 1
  fi

  info "Applying patches to dev database..."
  echo "$PATCHES" | psql "$DB_URL" 2>&1 | grep -v "^$\|^ALTER\|^NOTICE" || true
  success "All schema patches applied"
fi

# ── Verify columns exist ──────────────────────────────────────────────────────
echo ""
info "Verifying columns..."

run_query() {
  if [[ "${DOCKER:-}" == "1" ]] || docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^aegis-db$"; then
    docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc "$1" 2>/dev/null
  elif [[ -n "${DATABASE_URL:-}" ]]; then
    psql "$DATABASE_URL" -tAc "$1" 2>/dev/null
  elif [[ -f ".env" ]]; then
    local url; url=$(grep '^DATABASE_URL=' .env | head -1 | sed 's/DATABASE_URL=//' | tr -d '"'"'")
    psql "$url" -tAc "$1" 2>/dev/null
  else
    psql "postgresql://pentest_user:pentest_password@localhost:5432/pentest_dev" -tAc "$1" 2>/dev/null
  fi
}

ALL_OK=true
while IFS='|' read -r label table col; do
  count=$(run_query "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='${table}' AND column_name='${col}'" | tr -d '[:space:]')
  if [[ "$count" == "1" ]]; then
    success "${label} ✓"
  else
    warn "${label} MISSING"
    ALL_OK=false
  fi
done << 'COLS'
Project.notes|Project|notes
Project.assetOwners|Project|assetOwners
Project.targetCode|Project|targetCode
Project.engagementYear|Project|engagementYear
Project.previousEngagementId|Project|previousEngagementId
Finding.assetOwner|Finding|assetOwner
COLS

echo ""
if [[ "$ALL_OK" == "true" ]]; then
  echo -e "${GREEN}${BOLD}All columns verified. Database is up to date.${NC}"
  echo ""
  echo -e "  ${YELLOW}Restart your app server to pick up changes:${NC}"
  echo -e "    Local:  ${BOLD}npm run dev${NC}  or  ${BOLD}npm start${NC}"
  echo -e "    Docker: ${BOLD}docker restart aegis-app${NC}"
else
  echo -e "${RED}${BOLD}Some columns are still missing — check the error output above.${NC}"
  exit 1
fi
echo ""
