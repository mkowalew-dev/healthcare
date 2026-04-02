#!/bin/bash
# ============================================================
# CareConnect EHR — Database VM Setup
# Run this script on: VM3 (Database)
# OS: Ubuntu 22.04 LTS
# ============================================================
set -euo pipefail

# ── CONFIGURATION ──────────────────────────────────────────
# Values come from env vars when piped over SSH (see DEPLOYMENT.md).
# You can also edit these defaults and run the script directly.
DB_NAME="${DB_NAME:-careconnect}"
DB_USER="${DB_USER:-careconnect}"
DB_PASSWORD="${DB_PASSWORD:-CHANGE_THIS_STRONG_PASSWORD}"
API_PRIVATE_IP="${API_PRIVATE_IP:-10.0.1.20}"
# ───────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓ $1${NC}"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠ $1${NC}"; }
err()  { echo -e "${RED}[$(date '+%H:%M:%S')] ✗ $1${NC}"; exit 1; }
info() { echo -e "${BLUE}[$(date '+%H:%M:%S')] → $1${NC}"; }

# ── Preflight checks ────────────────────────────────────────
[[ $EUID -ne 0 ]] && err "Run as root: sudo bash 01-setup-db.sh"
[[ "$DB_PASSWORD" == "CHANGE_THIS_STRONG_PASSWORD" ]] && \
  err "Set DB_PASSWORD in the script before running"

info "Starting CareConnect database VM setup..."
echo ""

# ── System update ───────────────────────────────────────────
info "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
log "System updated"

# ── Install PostgreSQL 15 ────────────────────────────────────
info "Installing PostgreSQL 15..."
apt-get install -y -qq gnupg curl lsb-release

# Add PostgreSQL official apt repo
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | \
  gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg

# Hardcode 'noble' — PGDG doesn't yet publish a 'questing' suite;
# the noble packages run fine on Ubuntu 25.10.
echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] \
  https://apt.postgresql.org/pub/repos/apt noble-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list

apt-get update -qq
apt-get install -y -qq postgresql-17 postgresql-client-17
log "PostgreSQL 17 installed"

# ── Start PostgreSQL ─────────────────────────────────────────
systemctl enable postgresql
systemctl start postgresql
log "PostgreSQL service started"

# ── Create database and user ─────────────────────────────────
info "Creating database user and schema..."

sudo -u postgres psql <<EOF
-- Create user if not exists
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;

-- Create database
SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USER};
EOF

log "Database '${DB_NAME}' and user '${DB_USER}' created"

# ── Configure PostgreSQL networking ──────────────────────────
info "Configuring PostgreSQL to accept API VM connections..."

PG_CONF="/etc/postgresql/17/main/postgresql.conf"
PG_HBA="/etc/postgresql/17/main/pg_hba.conf"

# Allow PostgreSQL to listen on all interfaces
# (firewall restricts access — only API VM's port 5432 will be open)
sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" "$PG_CONF"

# Set connection limits and logging for Splunk visibility
cat >> "$PG_CONF" <<EOF

# CareConnect EHR settings
log_connections = on
log_disconnections = on
log_duration = off
log_min_duration_statement = 1000    # Log queries slower than 1s
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_destination = 'stderr'
logging_collector = on
log_directory = 'pg_log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
max_connections = 100
shared_buffers = 256MB
EOF

# Add pg_hba entry for API VM
cat >> "$PG_HBA" <<EOF

# CareConnect API VM access
host    ${DB_NAME}    ${DB_USER}    ${API_PRIVATE_IP}/32    scram-sha-256
EOF

log "PostgreSQL network configuration complete"

# ── Restart PostgreSQL to apply changes ──────────────────────
systemctl restart postgresql
log "PostgreSQL restarted"

# ── Firewall (UFW) ───────────────────────────────────────────
info "Configuring firewall..."
apt-get install -y -qq ufw

ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# SSH from anywhere (restrict to bastion IP in production)
ufw allow 22/tcp comment 'SSH'

# PostgreSQL only from API VM private IP
ufw allow from "${API_PRIVATE_IP}" to any port 5432 comment 'PostgreSQL - API VM only'

ufw --force enable
log "Firewall configured (UFW)"

# ── Verify ───────────────────────────────────────────────────
info "Verifying setup..."
PGPASSWORD="${DB_PASSWORD}" psql -h 127.0.0.1 -U "${DB_USER}" -d "${DB_NAME}" \
  -c "SELECT version();" > /dev/null 2>&1 && \
  log "Database connection verified" || \
  warn "Could not verify DB connection — check credentials"

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ Database VM setup complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Host:     $(hostname) / $(hostname -I | awk '{print $1}')"
echo "  Database: ${DB_NAME}"
echo "  User:     ${DB_USER}"
echo "  Port:     5432"
echo ""
echo "  Next: Run 02-setup-api.sh on the API VM"
echo ""
