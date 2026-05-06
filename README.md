# 🔐 AEGIS - Penetration Testing Report Platform

A modern, feature-rich platform for managing penetration testing findings, generating reports, and collaborating with your security team.

## 🚀 Quick Start

### One-Command Deployment

```bash
# Development (with local PostgreSQL)
bash deploy.sh development

# Production
bash deploy.sh production
```

That's it! The script handles everything:
- ✅ Detects OS (macOS/Linux)
- ✅ Installs PostgreSQL if needed
- ✅ Creates database and user
- ✅ Configures environment
- ✅ Installs dependencies
- ✅ Runs database migrations
- ✅ Builds the application

---

## 📋 System Requirements

- **Node.js**: 18+
- **PostgreSQL**: 14+
- **OS**: macOS 10.15+ or Linux (Ubuntu 20.04+, CentOS 8+, Debian 11+)
- **RAM**: 2GB minimum
- **Disk**: 5GB free space

## 🔧 Installation

### Step 1: Clone Repository
```bash
git clone https://github.com/abhiyan-chhetri/aegis.git
cd aegis
```

### Step 2: Run Deployment Script
```bash
# For local development
bash deploy.sh development

# For production deployment
bash deploy.sh production
```

The script will:
1. Check/install PostgreSQL
2. Create database `pentest_dev` or `pentest_db`
3. Create user `pentest_user`
4. Generate `.env` with database credentials
5. Install npm dependencies
6. Run Prisma migrations
7. Build the application
8. Optionally start development server

### Step 3: Start Application

**Development:**
```bash
npm run dev
```
App will be available at `http://localhost:3000`

**Production:**
```bash
npm run start
```

---

## 🎯 Features

### Finding Management
- ✅ Create, edit, delete security findings
- ✅ CVSS 3.1 scoring with automatic severity calculation
- ✅ CWE/OWASP classification
- ✅ Asset mapping and categorization
- ✅ Status tracking (open, in-progress, resolved, accepted)

### Evidence & Annotation
- ✅ Screenshot upload and management
- ✅ **In-browser screenshot annotation tool**:
  - Draw rectangles, circles, arrows
  - Add text labels
  - Highlight and redact sensitive data
  - Resize and move shapes
  - Delete individual annotations
  - Transparency/opacity control
  - Undo/redo functionality

### Collaboration
- ✅ Team member @mentions in comments
- ✅ Real-time presence tracking
- ✅ Activity feed with detailed audit trail
- ✅ Comment threads on findings
- ✅ Auto-save functionality

### Reporting
- ✅ Professional PDF report generation
- ✅ Multiple report templates
- ✅ Executive summary sections
- ✅ Dynamic finding inclusion/exclusion
- ✅ Customizable report sections

### Security Features
- ✅ Role-based access control
- ✅ Encrypted sensitive configuration
- ✅ Audit logging of all changes
- ✅ Teams webhook notifications
- ✅ Secure password hashing

### AI Integration
- ✅ AI-powered finding title generation
- ✅ Auto-fill descriptions from AI
- ✅ Smart severity suggestions

### Projects
- ✅ Multi-project support
- ✅ Project status tracking
- ✅ Team member assignment
- ✅ Engagement scope management

---

## 📚 Usage Guide

### Create a Finding

1. Navigate to Projects → Select Project
2. Click "New Finding"
3. Fill in:
   - Title
   - Severity (or use AI to generate)
   - CVSS Score (calculated automatically)
   - Description, Reproduction Steps, Impact, Remediation
   - Add evidence (screenshots)
4. Save

### Annotate Screenshots

1. Upload screenshot to finding
2. Hover thumbnail, click the **pen icon**
3. Use tools:
   - **✋ Move** - Reposition/resize shapes
   - **▭ Rectangle** - Draw outlined boxes
   - **● Circle** - Draw circles/ellipses
   - **→ Arrow** - Draw arrows with heads
   - **T Text** - Add text labels
   - **▬ Highlight** - Semi-transparent overlays
   - **👁 Redact** - Solid colored redaction
   - **✎ Freehand** - Free-draw
   - **✕ Delete** - Remove shape
4. Adjust colors, stroke width, opacity
5. Click **Save annotation**

### Add Team Mentions

1. In finding comments, type `@`
2. Select team member from dropdown
3. They'll be notified
4. Use "Mark as Done" to dismiss

### Generate Reports

1. Go to Project → Reports
2. Click "Generate Report"
3. Choose template
4. Select findings to include
5. Review executive summary
6. Export as PDF

### Configure Settings

1. Go to Settings
2. Configure:
   - **Integrations**: Teams webhook URL
   - **AI Settings**: API key for generation
   - **Branding**: Custom logo, colors
   - **Security**: Encryption keys

---

## 🛠️ Development

### Tech Stack
- **Frontend**: Next.js 15, React, TypeScript, TailwindCSS
- **Backend**: Next.js API Routes, Node.js
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Auth**: NextAuth.js
- **Encryption**: Node.js crypto

### Project Structure
```
aegis/
├── src/
│   ├── app/              # Next.js pages and routes
│   ├── components/       # React components
│   ├── lib/              # Utilities (auth, db, crypto, ai)
│   └── styles/           # Global styles
├── prisma/
│   └── schema.prisma     # Database schema
├── public/               # Static files
├── deploy.sh             # Deployment script
└── README.md             # This file
```

### Common Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# View database UI
npx prisma studio

# Run migrations
npx prisma migrate dev

# Reset database (⚠️ loses data)
npx prisma migrate reset

# Type checking
npm run type-check

# Linting
npm run lint
```

### Environment Variables

Located in `.env` (auto-generated by deploy script):

```env
DATABASE_URL="postgresql://..."  # Database connection
NODE_ENV="development"            # Environment
NEXTAUTH_SECRET="..."            # Auth signing key
NEXTAUTH_URL="..."               # App URL
ENCRYPTION_KEY="..."             # Sensitive data encryption
TEAMS_WEBHOOK_URL="..."          # Teams notifications (optional)
```

---

## 🗄️ Database

### PostgreSQL Setup

The deploy script automatically:
1. Installs PostgreSQL if needed
2. Starts the service
3. Creates database and user
4. Runs migrations

**Development Database:**
- Name: `pentest_dev`
- User: `pentest_user`
- Password: `pentest_password`
- Host: `localhost:5432`

### Useful Database Commands

```bash
# View database UI
npx prisma studio

# Create migration after schema change
npx prisma migrate dev --name migration_name

# Deploy migrations to production
npx prisma migrate deploy

# Reset database (loses all data)
npx prisma migrate reset

# Connect with psql
psql -U pentest_user -h localhost -d pentest_dev
# Password: pentest_password
```

### Backup & Restore

```bash
# Backup
pg_dump -U pentest_user -h localhost pentest_dev > backup.sql

# Restore
psql -U pentest_user -h localhost pentest_dev < backup.sql
```

---

## 🚨 Troubleshooting

### PostgreSQL Not Starting
```bash
# macOS
brew services start postgresql@15

# Linux
sudo systemctl start postgresql
```

### Port 5432 Already in Use
```bash
# Kill existing PostgreSQL
brew services stop postgresql@15  # macOS
sudo systemctl stop postgresql     # Linux
```

### Migration Failed
```bash
# Try direct push
npx prisma db push

# Or reset and start fresh
npx prisma migrate reset
```

### Node Modules Issues
```bash
rm -rf node_modules package-lock.json
npm install
```

### Build Errors
```bash
# Type check
npm run type-check

# Lint
npm run lint

# Clean build
rm -rf .next
npm run build
```

### Port 3000 Already in Use
```bash
# Use different port
PORT=3001 npm run dev
```

---

## 📦 Production Deployment

### Option 1: VPS (Self-Hosted)
1. SSH into server
2. Clone repository
3. Run `bash deploy.sh production`
4. Use process manager (PM2, systemd)
5. Set up reverse proxy (Nginx, Apache)
6. Configure HTTPS/SSL

### Option 2: Platform-as-a-Service
1. **Vercel**: Deploy Next.js frontend
2. **Heroku/Railway/Render**: Deploy backend + migrations
3. **AWS RDS/Azure/GCP**: Managed PostgreSQL

### Environment Variables (Production)
```env
DATABASE_URL="postgresql://user:password@prod-host:5432/pentest_db"
NODE_ENV="production"
NEXTAUTH_URL="https://yourdomain.com"
NEXTAUTH_SECRET="(generate secure key)"
ENCRYPTION_KEY="(generate secure key)"
```

### Security Checklist
- ✅ Use strong database password
- ✅ Enable HTTPS/SSL
- ✅ Set NEXTAUTH_URL to production domain
- ✅ Generate new NEXTAUTH_SECRET
- ✅ Generate new ENCRYPTION_KEY
- ✅ Disable debug logging
- ✅ Set NODE_ENV="production"
- ✅ Enable database backups
- ✅ Use managed PostgreSQL service
- ✅ Set up firewall rules

---

## 🔒 Security

### Encrypted Configuration
Sensitive settings (API keys, webhook URLs) are:
- ✅ AES-256 encrypted in database
- ✅ Masked in UI (shows only first 4 chars)
- ✅ Logged to audit trail
- ✅ Updated via secure PATCH endpoint

### Audit Trail
All changes logged with:
- User who made change
- What changed
- When changed
- Action type

### Password Security
- ✅ Bcrypt hashing
- ✅ Salted passwords
- ✅ No plaintext storage

---

## 📝 License

Internal use only. All rights reserved.

---

## 🤝 Contributing

Team members can contribute by:
1. Creating findings
2. Adding evidence
3. Writing annotations
4. Generating reports
5. Collaborating in comments

---

## 📞 Support

For issues:
1. Check the Troubleshooting section
2. Review logs: `npm run dev` (shows detailed errors)
3. View database: `npx prisma studio`
4. Check PostgreSQL: `pg_isready -h localhost`

---

## 📊 What's Included

### Current Features ✅
- Finding management (create, edit, delete)
- Evidence/screenshot handling with annotation tool
- Team collaboration with @mentions
- Real-time presence tracking
- Activity/audit trail
- CVSS scoring
- Professional reports
- Teams webhook integration
- AI finding generation
- Secure configuration management
- Project management
- Dashboard with stats
- Multi-user support

### Coming Soon 🚀
- Advanced search & filtering
- Bulk operations
- Remediation tracking integration
- Risk management matrix
- Compliance framework mapping
- Methodology checklists
- Knowledge base / templates
- Client portal
- Enhanced analytics

---

## 🎓 Getting Started

1. **First Time**:
   ```bash
   bash deploy.sh development
   npm run dev
   ```

2. **Create Account**:
   - Sign up at `http://localhost:3000`
   - Fill in email, name, password

3. **Create Project**:
   - Click "New Project"
   - Enter project details
   - Add team members

4. **Add Findings**:
   - Click "New Finding"
   - Fill in vulnerability details
   - Upload evidence
   - Annotate screenshots
   - Save

5. **Generate Report**:
   - Go to Reports
   - Click "Generate"
   - Select findings
   - Export PDF

---

**Version**: 1.0.0  
**Last Updated**: May 2026  
**Database**: PostgreSQL 14+  
**Node.js**: 18+  
**Status**: ✅ Production Ready

Made for security teams. Built for collaboration.
