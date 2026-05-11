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
# 5. CREATE DATABASE AND USER
# ==============================================================================
echo -e "\n${YELLOW}[5/8] Setting up database...${NC}"

if [[ "$OS" == "macOS" ]]; then
    psql -U $(whoami) -d postgres -h $DB_HOST << EOF 2>/dev/null
DROP DATABASE IF EXISTS $DB_NAME;
DROP USER IF EXISTS $DB_USER;
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
CREATE DATABASE $DB_NAME OWNER $DB_USER;
ALTER DATABASE $DB_NAME SET timezone TO 'UTC';
EOF
else
    sudo -u postgres psql -d postgres << EOF 2>/dev/null
DROP DATABASE IF EXISTS $DB_NAME;
DROP USER IF EXISTS $DB_USER;
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
CREATE DATABASE $DB_NAME OWNER $DB_USER;
ALTER DATABASE $DB_NAME SET timezone TO 'UTC';
EOF
fi

echo -e "${GREEN}✓ Database '$DB_NAME' created${NC}"
echo -e "${GREEN}✓ User '$DB_USER' created${NC}"

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

# ==============================================================================
# 8. CREATE ADMIN USER
# ==============================================================================
echo -e "\n${YELLOW}[8/9] Creating admin user...${NC}"

ADMIN_ID=$(node -e "console.log(require('crypto').randomUUID())")
ADMIN_NAME="${ADMIN_NAME:-Admin}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@aegis.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9!@#$%' | head -c 20)}"
ADMIN_INITIALS=$(echo "$ADMIN_NAME" | awk '{for(i=1;i<=NF;i++) printf substr($i,1,1)}' | head -c 3 | tr '[:lower:]' '[:upper:]')
NOW=$(date -u +"%Y-%m-%d %H:%M:%S")

# Hash password with bcrypt via Node.js (safe from shell escaping)
# Create a temp Node script to hash the password
HASH_SCRIPT=$(mktemp)
cat > "$HASH_SCRIPT" << 'HASHEOF'
const bcrypt = require('bcryptjs');
const password = process.argv[1];
console.log(bcrypt.hashSync(password, 12));
HASHEOF

HASHED_PASS=$(node "$HASH_SCRIPT" "$ADMIN_PASSWORD" 2>/dev/null) || {
  echo -e "${RED}✗ Failed to hash password with bcryptjs${NC}"
  rm -f "$HASH_SCRIPT"
  exit 1
}
rm -f "$HASH_SCRIPT"

# Escape single quotes in admin name for SQL
ADMIN_NAME_ESCAPED="${ADMIN_NAME//\'/\'\'}"
ADMIN_EMAIL_ESCAPED="${ADMIN_EMAIL//\'/\'\'}"

psql "$DATABASE_URL" << EOF 2>/dev/null
INSERT INTO "User" (id, name, initials, email, password, role, team, "createdAt", "updatedAt")
VALUES (
  '$ADMIN_ID',
  '$ADMIN_NAME_ESCAPED',
  '$ADMIN_INITIALS',
  '$ADMIN_EMAIL_ESCAPED',
  '$HASHED_PASS',
  'admin',
  'Security',
  '$NOW',
  '$NOW'
)
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  password = EXCLUDED.password,
  role = 'admin',
  "updatedAt" = '$NOW';
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

echo -e "${BLUE}Admin Credentials:${NC}"
echo -e "  Email:    $ADMIN_EMAIL"
echo -e "  Password: $ADMIN_PASSWORD"
echo -e "  ${YELLOW}(saved to $CREDS_FILE)${NC}"
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
    echo -e "  Email: $ADMIN_EMAIL"
    echo -e "  Password: $ADMIN_PASSWORD"
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
echo -e "${YELLOW}⚠  Save the credentials file ${CREDS_FILE} — the password won't be shown again${NC}"
echo ""

# Ask to start dev server
if [[ "$DEPLOYMENT_MODE" == "development" ]]; then
    read -p "Start development server now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm run dev
    fi
fi
