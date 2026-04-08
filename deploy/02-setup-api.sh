#!/bin/bash
# ============================================================
# CareConnect EHR — API VM Setup
# Run this script on: VM2 (Backend API)
# OS: Ubuntu 22.04 LTS
# ============================================================
set -euo pipefail

# ── CONFIGURATION ──────────────────────────────────────────
# Values come from env vars when piped over SSH (see DEPLOYMENT.md).
# You can also edit these defaults and run the script directly.
DB_HOST="${DB_HOST:-careconnect-db.example.com}"
DB_NAME="${DB_NAME:-careconnect}"
DB_USER="${DB_USER:-careconnect}"
DB_PASSWORD="${DB_PASSWORD:-CHANGE_THIS_STRONG_PASSWORD}"
JWT_SECRET="${JWT_SECRET:-CHANGE_THIS_JWT_SECRET}"
FRONTEND_PRIVATE_IP="${FRONTEND_PRIVATE_IP:-10.0.1.10}"
FRONTEND_HOST="${FRONTEND_HOST:-}"   # Public hostname of VM1 — used for CORS
SPLUNK_ACCESS_TOKEN="${SPLUNK_ACCESS_TOKEN:-}"
SPLUNK_REALM="${SPLUNK_REALM:-us1}"
APP_DIR="${APP_DIR:-/opt/careconnect/api}"
APP_USER="${APP_USER:-careconnect}"
PORT="${PORT:-3001}"

# Path to the backend source on the remote VM (set via env var when SSH-piped)
BACKEND_SRC="${BACKEND_SRC:-}"

# AI Assistant — get from console.anthropic.com → API Keys
# Leave blank to disable the AI Assistant (app still runs without it)
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"

# Mock External Services (VM4) — set to the private IP of the mock VM
# Use localhost only if mock is co-located on this VM
MOCK_HOST="${MOCK_HOST:-}"
MOCK_PORT="${MOCK_PORT:-3002}"
[[ -z "$MOCK_HOST" ]] && warn "MOCK_HOST not set — integration URLs will point to localhost. Set MOCK_HOST to the VM4 private IP."
MOCK_BASE="http://${MOCK_HOST:-localhost}:${MOCK_PORT}"
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

# ── Preflight checks ─────────────────────────────────────────
[[ $EUID -ne 0 ]] && err "Run as root: sudo bash 02-setup-api.sh"
[[ "$DB_PASSWORD" == "CHANGE_THIS_STRONG_PASSWORD" ]] && \
  err "Set DB_PASSWORD before running (env var or edit script)"
[[ "$JWT_SECRET" == "CHANGE_THIS_JWT_SECRET" ]] && \
  err "Set JWT_SECRET before running (env var or edit script)"

# Resolve backend source: env var takes precedence, then relative path
if [[ -z "$BACKEND_SRC" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"
  if [[ -n "$SCRIPT_DIR" && -d "$SCRIPT_DIR/../backend" ]]; then
    BACKEND_SRC="$(realpath "$SCRIPT_DIR/../backend")"
  else
    err "Cannot locate backend source. Set BACKEND_SRC env var to the path of the backend directory on this VM."
  fi
fi
[[ ! -d "$BACKEND_SRC" ]] && err "BACKEND_SRC '$BACKEND_SRC' does not exist"

info "Starting CareConnect API VM setup..."
echo ""

# ── System update ─────────────────────────────────────────────
info "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl gnupg lsb-release ufw

# Add the official PostgreSQL apt repository if postgresql-client-17 isn't available
if ! apt-cache show postgresql-client-17 &>/dev/null; then
  info "Adding PostgreSQL apt repository..."
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg
  echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] \
https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -qq
fi

apt-get install -y -qq postgresql-client-17
log "System updated"

# ── Install Node.js 20 ────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node --version | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  info "Installing Node.js 20..."
  # Force noble suite — NodeSource doesn't yet publish a questing repo
  curl -fsSL https://deb.nodesource.com/setup_20.x | DISTRO=noble bash - 2>/dev/null
  apt-get install -y -qq nodejs
  log "Node.js $(node --version) installed"
else
  log "Node.js $(node --version) already installed"
fi

# ── Install PM2 ───────────────────────────────────────────────
info "Installing PM2 process manager..."
npm install -g pm2 --quiet
log "PM2 $(pm2 --version) installed"

# ── Create app user ───────────────────────────────────────────
if ! id "${APP_USER}" &>/dev/null; then
  info "Creating application user '${APP_USER}'..."
  useradd --system --shell /bin/bash --home "${APP_DIR}" --create-home "${APP_USER}"
  log "User '${APP_USER}' created"
fi

# ── Deploy application files ──────────────────────────────────
info "Deploying backend application..."
mkdir -p "${APP_DIR}"

rsync -a --delete \
  --exclude 'node_modules' \
  --exclude '.env' \
  "${BACKEND_SRC}/" "${APP_DIR}/"

log "Application files deployed to ${APP_DIR}"

# ── Write environment file ────────────────────────────────────
info "Writing environment configuration..."
cat > "${APP_DIR}/.env" <<EOF
NODE_ENV=production
PORT=${PORT}
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:5432/${DB_NAME}
JWT_SECRET=${JWT_SECRET}
CORS_ORIGIN=https://${FRONTEND_HOST:-$HOSTNAME}
LOG_LEVEL=info
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
SPLUNK_ACCESS_TOKEN=${SPLUNK_ACCESS_TOKEN}
SPLUNK_REALM=${SPLUNK_REALM}

# Mock External Services — all integration routes call these URLs
SURESCRIPTS_URL=${MOCK_BASE}/surescripts
QUEST_LIS_URL=${MOCK_BASE}/quest
LABCORP_LIS_URL=${MOCK_BASE}/labcorp
TWILIO_API_URL=${MOCK_BASE}/twilio
SENDGRID_API_URL=${MOCK_BASE}/sendgrid

# FHIR base URL — shown on the Integration Health page
FHIR_BASE_URL=https://${FRONTEND_HOST:-$HOSTNAME}/fhir

# Lab result simulator — results pending labs on a background interval
LAB_RESULT_INTERVAL_MS=${LAB_RESULT_INTERVAL_MS:-900000}
LAB_MIN_AGE_MS=${LAB_MIN_AGE_MS:-${LAB_RESULT_INTERVAL_MS:-900000}}
EOF
chmod 600 "${APP_DIR}/.env"
log "Environment file written"

# ── Install Node.js dependencies ──────────────────────────────
info "Installing Node.js dependencies..."
cd "${APP_DIR}"
npm install --omit=dev --quiet
log "Dependencies installed"

# ── Verify database connectivity ──────────────────────────────
info "Verifying database connection..."
PGPASSWORD="${DB_PASSWORD}" psql \
  "postgresql://${DB_USER}@${DB_HOST}:5432/${DB_NAME}" \
  -c "SELECT 1;" > /dev/null 2>&1 && \
  log "Database connection successful" || \
  err "Cannot connect to database at ${DB_HOST}. Check: 1) DB VM is running, 2) firewall rules allow API VM's IP, 3) credentials are correct"

# ── Run database seed ─────────────────────────────────────────
info "Running database schema and seed..."
cd "${APP_DIR}"
node src/db/seed.js && log "Database seeded successfully" || \
  warn "Seed may have failed — check if DB was already seeded (safe to ignore)"

# ── Fix file ownership ────────────────────────────────────────
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

# ── Configure PM2 ────────────────────────────────────────────
info "Configuring PM2..."
cat > "${APP_DIR}/ecosystem.config.js" <<EOF
module.exports = {
  apps: [{
    name: 'careconnect-api',
    script: 'src/index.js',
    cwd: '${APP_DIR}',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
    },
    env_file: '${APP_DIR}/.env',
    max_memory_restart: '512M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: '/var/log/careconnect/api-error.log',
    out_file: '/var/log/careconnect/api-out.log',
    merge_logs: true,
    restart_delay: 3000,
    max_restarts: 10,
  }]
};
EOF

# ── Create log directory ──────────────────────────────────────
mkdir -p /var/log/careconnect
chown "${APP_USER}:${APP_USER}" /var/log/careconnect

# ── Write systemd service for PM2 ─────────────────────────────
info "Configuring systemd service..."
cat > /etc/systemd/system/careconnect-api.service <<EOF
[Unit]
Description=CareConnect EHR API (PM2)
Documentation=https://pm2.keymetrics.io
After=network.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/pm2-runtime start ${APP_DIR}/ecosystem.config.js --env production
ExecReload=/usr/bin/pm2 reload careconnect-api
ExecStop=/usr/bin/pm2 stop careconnect-api
Restart=on-failure
RestartSec=10s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=careconnect-api
EnvironmentFile=${APP_DIR}/.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable careconnect-api
systemctl start careconnect-api
log "PM2 service configured and started"

# ── Firewall (UFW) ─────────────────────────────────────────────
info "Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# SSH from anywhere (restrict to bastion IP in production)
ufw allow 22/tcp comment 'SSH'

# API port — Frontend VM private IP
ufw allow from "${FRONTEND_PRIVATE_IP}" to any port ${PORT} comment 'API - Frontend VM only'

# API port — Cloudflare IP ranges (for Cloudflare Tunnel / proxy)
info "Adding Cloudflare IP ranges to firewall..."
for ip in $(curl -sf https://www.cloudflare.com/ips-v4); do
  ufw allow from "$ip" to any port ${PORT} comment 'Cloudflare' 2>/dev/null
done
for ip in $(curl -sf https://www.cloudflare.com/ips-v6); do
  ufw allow from "$ip" to any port ${PORT} comment 'Cloudflare' 2>/dev/null
done
log "Cloudflare IP ranges added"

ufw --force enable
log "Firewall configured"

# ── Health check ──────────────────────────────────────────────
info "Verifying API is responding..."
sleep 3
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}/health" || echo "000")
if [[ "$HTTP_STATUS" == "200" ]]; then
  log "API health check passed (HTTP 200)"
else
  warn "Health check returned HTTP ${HTTP_STATUS} — service may still be starting"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ API VM setup complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Host:         $(hostname)"
echo "  API port:     ${PORT}"
echo "  App dir:      ${APP_DIR}"
echo "  Logs:         /var/log/careconnect/"
echo "  PM2 status:   sudo -u ${APP_USER} pm2 status"
echo ""
echo "  Health check: curl http://$(hostname):${PORT}/health"
echo ""
echo "  Next: Run 03-setup-frontend.sh on the Frontend VM"
echo ""
