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

echo -e "${YELLOW}Mode: ${DEPLOYMENT_MODE^^}${NC}"
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

echo "Running Prisma migrations..."
if [[ "$DEPLOYMENT_MODE" == "development" ]]; then
    # Development: reset DB completely (deploy.sh already recreated it above)
    # If migrate deploy fails (e.g. 42P07 tables already exist from a previous
    # partial run), fall back to db push which syncs schema without migration tracking
    npx prisma migrate deploy 2>&1 || {
        echo -e "${YELLOW}migrate deploy failed, falling back to db push...${NC}"
        npx prisma db push --force-reset
    }
else
    npx prisma migrate deploy
fi
echo -e "${GREEN}✓ Migrations completed${NC}"

# ==============================================================================
# 8. BUILD APPLICATION
# ==============================================================================
echo -e "\n${YELLOW}[8/8] Building application...${NC}"
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

# Ask to start dev server
if [[ "$DEPLOYMENT_MODE" == "development" ]]; then
    read -p "Start development server now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm run dev
    fi
fi
