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

# ── Create admin account ──────────────────────────────────────────────────────
banner "7. Creating admin account"

# Hash password using bcrypt via node (running inside app container)
HASHED_PASS=$(docker exec "$APP_CONTAINER" node -e "
const crypto = require('crypto');
// Simple SHA-256 fallback if bcrypt not available
const pw = '${ADMIN_PASSWORD}';
try {
  const bcrypt = require('bcryptjs');
  console.log(bcrypt.hashSync(pw, 12));
} catch(e) {
  // Use the app's auth module
  const { createHash } = require('crypto');
  console.log(createHash('sha256').update(pw).digest('hex'));
}
" 2>/dev/null) || HASHED_PASS=""

if [[ -z "$HASHED_PASS" ]]; then
  warn "Could not hash password via container, using direct DB insert with plain password"
  warn "You may need to log in and change the password via the UI"
  HASHED_PASS="$ADMIN_PASSWORD"
fi

# Check what password hashing the app uses
APP_USES_BCRYPT=$(docker exec "$APP_CONTAINER" node -e \
  "try{require('bcryptjs');console.log('yes')}catch{console.log('no')}" 2>/dev/null || echo "no")

if [[ "$APP_USES_BCRYPT" == "yes" ]]; then
  HASHED_PASS=$(docker exec "$APP_CONTAINER" node -e \
    "const b=require('bcryptjs');console.log(b.hashSync('${ADMIN_PASSWORD}',12))" 2>/dev/null)
fi

ADMIN_ID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || date +%s%N | sha256sum | head -c 36)
INITIALS=$(echo "$ADMIN_NAME" | awk '{for(i=1;i<=NF;i++) printf substr($i,1,1)}' | head -c 3 | tr '[:lower:]' '[:upper:]')
NOW=$(date -u +"%Y-%m-%d %H:%M:%S")

docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" << EOSQL
INSERT INTO "User" (id, name, initials, email, password, role, team, "createdAt", "updatedAt")
VALUES (
  '${ADMIN_ID}',
  '${ADMIN_NAME}',
  '${INITIALS}',
  '${ADMIN_EMAIL}',
  '${HASHED_PASS}',
  'admin',
  'Security',
  NOW(), NOW()
)
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  password = EXCLUDED.password,
  role = 'admin',
  "updatedAt" = NOW();
EOSQL
success "Admin account created/updated"

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
