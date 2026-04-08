#!/bin/bash
# ============================================================
# CareConnect EHR — Frontend + BFF VM Setup
# Run this script on: VM1 (Frontend / Web)
# OS: Ubuntu 22.04 LTS
#
# Architecture: Nginx on VM1 handles all routing — no external
# load balancer or Cloudflare routing rules required.
#
#   Cloudflare / DNS  →  VM1:80 (Nginx)
#     Nginx /api/*    →  VM2:3001  (API, private IP)
#     Nginx /fhir/*   →  VM2:3001  (FHIR, private IP)
#     Nginx /health   →  VM2:3001  (health check)
#     Nginx /bff/*    →  localhost:3003  (BFF — three-tier APM hop)
#     Nginx /*        →  /var/www/careconnect (static React SPA)
#
# This VM runs two services:
#   1. nginx           — reverse proxy + static file server (port 80)
#   2. careconnect-bff — Node.js proxy tier (port 3003, localhost only)
#
# The BFF creates a distinct 'careconnect-bff' node in Splunk APM's
# service map, giving a three-tier view:
#   browser (RUM) → careconnect-bff → careconnect-api → postgresql
# ============================================================
set -euo pipefail

# ── CONFIGURATION ──────────────────────────────────────────
# Values come from env vars when piped over SSH (see DEPLOYMENT.md).
# You can also edit these defaults and run the script directly.
FRONTEND_HOST="${FRONTEND_HOST:-careconnect-web.example.com}"
WEB_ROOT="${WEB_ROOT:-/var/www/careconnect}"
SERVE_PORT="${SERVE_PORT:-80}"

# Path to the frontend source on the remote VM (set via env var when SSH-piped)
FRONTEND_SRC="${FRONTEND_SRC:-}"

# API base URL baked into the React bundle at build time.
# - With ALB: leave empty — ALB routes /api/* to VM2, relative URLs work
# - Without ALB: set to the API VM's URL, e.g. http://192.168.11.11:3001
API_URL="${API_URL:-}"

# BFF service configuration
BFF_PORT="${BFF_PORT:-3003}"
# Internal URL of the API VM — BFF proxies clinical reads here
API_PRIVATE_URL="${API_PRIVATE_URL:-http://localhost:3001}"
BFF_APP_DIR="${BFF_APP_DIR:-/opt/careconnect/bff}"
BFF_SRC="${BFF_SRC:-}"   # path to bff/ source on this VM (set via env var)

# Splunk Observability Cloud — RUM (Real User Monitoring)
# Get the RUM token from: Splunk O11y Cloud → Settings → Access Tokens (type: RUM)
SPLUNK_RUM_TOKEN="${SPLUNK_RUM_TOKEN:-CHANGE_THIS_RUM_TOKEN}"
SPLUNK_REALM="${SPLUNK_REALM:-us1}"
APP_ENV="${APP_ENV:-production}"
SPLUNK_ACCESS_TOKEN="${SPLUNK_ACCESS_TOKEN:-}"
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
[[ $EUID -ne 0 ]] && err "Run as root: sudo bash 03-setup-frontend.sh"
[[ "$SPLUNK_RUM_TOKEN" == "CHANGE_THIS_RUM_TOKEN" ]] && \
  warn "SPLUNK_RUM_TOKEN not set — RUM will be disabled in this build"

# Resolve frontend source: env var takes precedence, then relative path
if [[ -z "$FRONTEND_SRC" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"
  if [[ -n "$SCRIPT_DIR" && -d "$SCRIPT_DIR/../frontend" ]]; then
    FRONTEND_SRC="$(realpath "$SCRIPT_DIR/../frontend")"
  else
    err "Cannot locate frontend source. Set FRONTEND_SRC env var to the path of the frontend directory on this VM."
  fi
fi
[[ ! -d "$FRONTEND_SRC" ]] && err "FRONTEND_SRC '$FRONTEND_SRC' does not exist"

info "Starting CareConnect frontend VM setup..."
echo ""

# ── System update ─────────────────────────────────────────────
info "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl ufw nginx
log "System packages updated"

# ── Install Node.js 20 ───────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node --version | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  info "Installing Node.js 20..."
  # Force noble suite — NodeSource doesn't yet publish a questing repo
  curl -fsSL https://deb.nodesource.com/setup_20.x | DISTRO=noble bash - 2>/dev/null
  apt-get install -y -qq nodejs
  log "Node.js $(node --version) installed"
fi

# ── Build the React application ───────────────────────────────
info "Building React frontend..."

BUILD_TMP="/tmp/careconnect-frontend-build"

# Wipe any leftover build dir from a previous run
rm -rf "${BUILD_TMP}"

# Copy frontend source to a temp build dir, excluding node_modules
rsync -a --exclude 'node_modules' "${FRONTEND_SRC}/" "${BUILD_TMP}/"
cd "${BUILD_TMP}"

# Install all dependencies (including devDeps needed for build)
npm install --quiet

# Splunk RUM vars are baked into the bundle at build time.
VITE_API_URL="${API_URL}" \
VITE_SPLUNK_RUM_TOKEN="${SPLUNK_RUM_TOKEN}" \
VITE_SPLUNK_REALM="${SPLUNK_REALM}" \
VITE_APP_ENV="${APP_ENV}" \
  npm run build

log "React build complete"

# ── Deploy built files ────────────────────────────────────────
info "Deploying to web root..."
mkdir -p "${WEB_ROOT}"
rsync -a --delete "${BUILD_TMP}/dist/" "${WEB_ROOT}/"

chmod -R 755 "${WEB_ROOT}"
log "Files deployed to ${WEB_ROOT}"

cd /
rm -rf "${BUILD_TMP}"

# ── Configure Nginx ────────────────────────────────────────────
# Nginx proxies /api/* and /fhir/* to the API VM, /bff/* to the local
# BFF, and serves the React SPA for everything else.
# This removes the dependency on an external ALB or Cloudflare routing rules.
info "Configuring Nginx..."

# Private IP of the API VM — set via env var when SSH-piped from deploy.sh
API_PRIVATE_URL="${API_PRIVATE_URL:-http://localhost:3001}"

cat > /etc/nginx/sites-available/careconnect <<NGINXEOF
server {
    listen ${SERVE_PORT} default_server;
    server_name _;

    root ${WEB_ROOT};
    index index.html;

    # ── Proxy: API (/api/*) → VM2:3001 ──────────────────────────
    location /api/ {
        proxy_pass ${API_PRIVATE_URL}/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # ── Proxy: FHIR (/fhir/*) → VM2:3001 ───────────────────────
    location /fhir/ {
        proxy_pass ${API_PRIVATE_URL}/fhir/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # ── Proxy: Health check → VM2:3001 ──────────────────────────
    location = /health {
        proxy_pass ${API_PRIVATE_URL}/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    # ── Proxy: BFF (/bff/*) → localhost:${BFF_PORT} ─────────────
    # Creates the three-tier APM hop visible in Splunk service map:
    #   browser → careconnect-bff → careconnect-api → postgresql
    location /bff/ {
        proxy_pass http://localhost:${BFF_PORT}/bff/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # ── Static SPA — serve index.html for all other routes ──────
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINXEOF

# Enable site, remove default
ln -sf /etc/nginx/sites-available/careconnect /etc/nginx/sites-enabled/careconnect
rm -f /etc/nginx/sites-enabled/default

nginx -t && log "Nginx config valid"
systemctl enable nginx
systemctl restart nginx
sleep 1

if systemctl is-active --quiet nginx; then
  log "Nginx running on port ${SERVE_PORT}"
else
  err "Nginx failed to start — check: journalctl -u nginx -n 50"
fi

# ── Deploy and start the BFF service ────────────────────────
info "Deploying BFF (Backend for Frontend)..."

# Resolve BFF source
if [[ -z "$BFF_SRC" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"
  if [[ -n "$SCRIPT_DIR" && -d "$SCRIPT_DIR/../bff" ]]; then
    BFF_SRC="$(realpath "$SCRIPT_DIR/../bff")"
  else
    warn "Cannot locate bff/ source — skipping BFF setup. Set BFF_SRC env var to enable."
    BFF_SRC=""
  fi
fi

if [[ -n "$BFF_SRC" && -d "$BFF_SRC" ]]; then
  mkdir -p "${BFF_APP_DIR}"

  rsync -a --delete \
    --exclude 'node_modules' \
    --exclude '.env' \
    "${BFF_SRC}/" "${BFF_APP_DIR}/"

  # Write BFF environment file
  cat > "${BFF_APP_DIR}/.env" <<EOF
NODE_ENV=production
BFF_PORT=${BFF_PORT}
API_URL=${API_PRIVATE_URL}
CORS_ORIGIN=https://${FRONTEND_HOST}
LOG_LEVEL=info
SPLUNK_ACCESS_TOKEN=${SPLUNK_ACCESS_TOKEN}
SPLUNK_REALM=${SPLUNK_REALM}
EOF
  chmod 600 "${BFF_APP_DIR}/.env"

  cd "${BFF_APP_DIR}"
  npm install --omit=dev --quiet
  log "BFF dependencies installed"

  # Systemd service for BFF
  cat > /etc/systemd/system/careconnect-bff.service <<EOF
[Unit]
Description=CareConnect BFF (Backend for Frontend proxy)
After=network.target
Wants=network.target

[Service]
Type=simple
WorkingDirectory=${BFF_APP_DIR}
ExecStart=$(which node) src/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=careconnect-bff
EnvironmentFile=${BFF_APP_DIR}/.env

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable careconnect-bff
  systemctl restart careconnect-bff
  sleep 2

  if systemctl is-active --quiet careconnect-bff; then
    log "careconnect-bff service running on port ${BFF_PORT}"
  else
    warn "careconnect-bff failed to start — check: journalctl -u careconnect-bff -n 50"
  fi

  # Health check
  BFF_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${BFF_PORT}/bff/health" || echo "000")
  [[ "$BFF_STATUS" == "200" ]] && \
    log "BFF health check passed (HTTP ${BFF_STATUS})" || \
    warn "BFF health returned HTTP ${BFF_STATUS} — service may still be starting"
else
  warn "BFF source not found — skipping BFF setup"
fi

# ── Firewall (UFW) ─────────────────────────────────────────────
# BFF port is localhost-only (Nginx proxies to it internally).
# Only SSH and HTTP need to be open externally.
info "Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'

ufw --force enable
log "Firewall configured (22, 80 open)"

# ── Smoke tests ───────────────────────────────────────────────
info "Running smoke tests..."
sleep 1

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${SERVE_PORT}/" || echo "000")
[[ "$HTTP_STATUS" == "200" ]] && \
  log "Frontend serving via Nginx (HTTP ${HTTP_STATUS})" || \
  warn "Nginx returned HTTP ${HTTP_STATUS} — check: journalctl -u nginx"

BFF_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${BFF_PORT}/bff/health" || echo "000")
[[ "$BFF_STATUS" == "200" ]] && \
  log "BFF health check passed (HTTP ${BFF_STATUS})" || \
  warn "BFF health returned HTTP ${BFF_STATUS} — may still be starting"

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ Frontend + BFF VM setup complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Static files: ${WEB_ROOT}"
echo "  Proxy:        Nginx (port ${SERVE_PORT})"
echo "  BFF:          careconnect-bff (port ${BFF_PORT}, localhost only)"
echo ""
echo "  Status:       systemctl status nginx"
echo "                systemctl status careconnect-bff"
echo "  Logs:         journalctl -u nginx -f"
echo "                journalctl -u careconnect-bff -f"
echo "  BFF health:   curl http://localhost:${BFF_PORT}/bff/health"
echo ""
echo "  ── Nginx routing (no ALB required) ─────────────────────"
echo "  /api/*   → ${API_PRIVATE_URL}/api/*  (API VM)"
echo "  /fhir/*  → ${API_PRIVATE_URL}/fhir/* (API VM)"
echo "  /health  → ${API_PRIVATE_URL}/health  (API VM)"
echo "  /bff/*   → localhost:${BFF_PORT}       (BFF → three-tier hop)"
echo "  /*       → ${WEB_ROOT}               (React SPA)"
echo ""
echo "  Test login:"
echo "    patient@demo.com  / Demo123!"
echo "    provider@demo.com / Demo123!"
echo "    admin@demo.com    / Demo123!"
echo ""
