#!/bin/bash
# ============================================================
# CareConnect EHR — Frontend + BFF VM Setup
# Run this script on: VM1 (Frontend / Web)
# OS: Ubuntu 22.04 LTS
#
# Architecture: Nginx on VM1 handles routing for BOTH portals.
# DNS points both subdomains to this VM (or the AWS ALB in front
# of it). Nginx serves a different React bundle per subdomain:
#
#   mychart.pseudo-co.com    →  patient.html  (MyChart portal)
#   careconnect.pseudo-co.com →  index.html    (CareConnect clinical)
#
#   Both subdomains proxy:
#     /api/*   →  VM2:3001  (API, private IP)
#     /fhir/*  →  VM2:3001  (FHIR, private IP)
#     /bff/*   →  localhost:3003  (BFF — three-tier APM hop)
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
CLINICAL_HOST="${CLINICAL_HOST:-${FRONTEND_HOST:-careconnect.example.com}}"
PATIENT_HOST="${PATIENT_HOST:-mychart.example.com}"
MOBILE_HOST="${MOBILE_HOST:-mobile.pseudo-co.com}"
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
BFF_APP_DIR="${BFF_APP_DIR:-/opt/careconnect/bff}"

# Comma-separated list of API VM private IPs for the Nginx upstream cluster.
# Accepts API_PRIVATE_IPS (multi-VM) or falls back to extracting the IP from
# the legacy API_PRIVATE_URL single-VM form.
API_PRIVATE_IPS="${API_PRIVATE_IPS:-}"
API_PORT="${API_PORT:-3001}"
# Internal API ALB DNS — when set, Nginx upstreams to the ALB instead of
# individual VM IPs. Required when the API tier sits behind an AWS internal ALB.
API_ALB_DNS="${API_ALB_DNS:-}"
# Internal Nginx port the BFF uses to reach the api_cluster (loopback only)
BFF_UPSTREAM_PORT="${BFF_UPSTREAM_PORT:-8082}"

if [[ -z "$API_PRIVATE_IPS" && -n "${API_PRIVATE_URL:-}" ]]; then
  _raw="${API_PRIVATE_URL#http://}"; _raw="${_raw#https://}"
  API_PRIVATE_IPS="${_raw%%:*}"
fi
BFF_SRC="${BFF_SRC:-}"   # path to bff/ source on this VM (set via env var)

# Splunk Observability Cloud — RUM (Real User Monitoring)
# Get the RUM token from: Splunk O11y Cloud → Settings → Access Tokens (type: RUM)
SPLUNK_RUM_TOKEN="${SPLUNK_RUM_TOKEN:-CHANGE_THIS_RUM_TOKEN}"
SPLUNK_REALM="${SPLUNK_REALM:-us1}"
APP_ENV="${APP_ENV:-production}"
SPLUNK_ACCESS_TOKEN="${SPLUNK_ACCESS_TOKEN:-}"
APP_VERSION="${APP_VERSION:-1.0.0}"
# ───────────────────────────────────────────────────────────

# Derive FRONTEND_HOST from CLINICAL_HOST for backward compat (BFF CORS etc.)
FRONTEND_HOST="${CLINICAL_HOST}"

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
[[ -z "${API_ALB_DNS}" && -z "${API_PRIVATE_IPS}" ]] && \
  err "Set API_ALB_DNS (internal API ALB) or API_PRIVATE_IPS (direct VM IPs) in config.env"
[[ "$SPLUNK_RUM_TOKEN" == "CHANGE_THIS_RUM_TOKEN" ]] && \
  warn "SPLUNK_RUM_TOKEN not set — RUM will be disabled in this build"
[[ -z "${PATIENT_HOST}" ]] && \
  warn "PATIENT_HOST not set — patient portal cross-domain redirect will be disabled"

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
apt-get install -y -qq curl nginx
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

# BUILD_ROOT mirrors the monorepo layout so the Vite alias
# (../packages/ui/src/index.ts) and npm workspace link both resolve correctly.
BUILD_ROOT="/tmp/careconnect-build"
BUILD_TMP="${BUILD_ROOT}/frontend"

rm -rf "${BUILD_ROOT}"
mkdir -p "${BUILD_ROOT}"

rsync -a --exclude 'node_modules' "${FRONTEND_SRC}/" "${BUILD_TMP}/"

# Copy the shared UI package — required by the Vite alias: ../packages/ui
PACKAGES_SRC="$(dirname "${FRONTEND_SRC}")/packages"
if [[ -d "${PACKAGES_SRC}" ]]; then
  rsync -a --exclude 'node_modules' --exclude '.storybook' \
    "${PACKAGES_SRC}/" "${BUILD_ROOT}/packages/"
fi

# Bootstrap workspace root so npm links @careconnect/ui locally instead of
# trying to fetch it from the public registry (it is a private workspace package).
ROOT_PKG="$(dirname "${FRONTEND_SRC}")/package.json"
if [[ -f "${ROOT_PKG}" ]]; then
  cp "${ROOT_PKG}" "${BUILD_ROOT}/package.json"
  cd "${BUILD_ROOT}"
  npm install --quiet
else
  cd "${BUILD_TMP}"
  npm install --quiet
fi

cd "${BUILD_TMP}"

# Splunk RUM vars and portal hostnames are baked into the bundle at build time.
# Written to .env.production so Vite's dotenv loader picks them up reliably.
cat > "${BUILD_TMP}/.env.production" <<EOF
VITE_API_URL=${API_URL}
VITE_SPLUNK_RUM_TOKEN=${SPLUNK_RUM_TOKEN}
VITE_SPLUNK_REALM=${SPLUNK_REALM}
VITE_APP_ENV=${APP_ENV}
VITE_APP_VERSION=${APP_VERSION}
VITE_CLINICAL_HOST=${CLINICAL_HOST}
VITE_PATIENT_HOST=${PATIENT_HOST}
VITE_MOBILE_HOST=${MOBILE_HOST:-}
EOF
npm run build

log "React build complete"

# ── Deploy built files ────────────────────────────────────────
info "Deploying to web root..."
mkdir -p "${WEB_ROOT}"
rsync -a --delete "${BUILD_TMP}/dist/" "${WEB_ROOT}/"

chmod -R 755 "${WEB_ROOT}"
log "Files deployed to ${WEB_ROOT}"

cd /
rm -rf "${BUILD_ROOT}"

# ── Configure Nginx ────────────────────────────────────────────
# Nginx load-balances across the API cluster (upstream api_cluster),
# proxies /bff/* to the local BFF, and serves the React SPA.
# A loopback server on port ${BFF_UPSTREAM_PORT} lets the BFF reach
# the API cluster through the same upstream (no single-IP hardcoding).
info "Configuring Nginx..."

# Build the Nginx upstream.
# With an internal API ALB: point to the ALB DNS — it load-balances across VM2s
# and health-checks them. Nginx just needs a single server entry.
# Without an ALB: iterate API_PRIVATE_IPS directly (dev / simple single-VM setup).
if [[ -n "${API_ALB_DNS}" ]]; then
  UPSTREAM_SERVERS="    server ${API_ALB_DNS}:${API_PORT};"
  log "Nginx upstream: API ALB (${API_ALB_DNS}:${API_PORT})"
else
  [[ -z "${API_PRIVATE_IPS}" ]] && err "Either API_ALB_DNS or API_PRIVATE_IPS must be set"
  IFS=',' read -ra _api_ips <<< "${API_PRIVATE_IPS}"
  UPSTREAM_SERVERS=$(printf "    server %s:${API_PORT};\n" "${_api_ips[@]}")
  warn "API_ALB_DNS not set — Nginx upstream uses direct VM IPs: ${API_PRIVATE_IPS}"
fi

cat > /etc/nginx/sites-available/careconnect <<NGINXEOF
upstream api_cluster {
${UPSTREAM_SERVERS}    keepalive 32;
}

# ── Shared proxy location blocks (included in both server blocks) ──────────
# Defined via variables to avoid duplication in the heredoc.

# ── MyChart Patient Portal  (mychart.pseudo-co.com) ───────────────────────
server {
    listen ${SERVE_PORT};
    server_name ${PATIENT_HOST};

    root ${WEB_ROOT};

    location = /ping {
        access_log off;
        return 200 "pong\n";
        add_header Content-Type text/plain;
    }

    location /api/ {
        proxy_pass http://api_cluster/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /fhir/ {
        proxy_pass http://api_cluster/fhir/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location = /health {
        proxy_pass http://api_cluster/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header Connection "";
    }

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

    # Serve patient.html as the SPA fallback for this subdomain
    location / {
        try_files \$uri \$uri/ /patient.html;
    }
}

# ── CareConnect Clinical Portal  (careconnect.pseudo-co.com) ──────────────
# Also acts as default_server to catch any unmatched hostname.
server {
    listen ${SERVE_PORT} default_server;
    server_name ${CLINICAL_HOST} _;

    root ${WEB_ROOT};

    location = /ping {
        access_log off;
        return 200 "pong\n";
        add_header Content-Type text/plain;
    }

    location /api/ {
        proxy_pass http://api_cluster/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /fhir/ {
        proxy_pass http://api_cluster/fhir/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location = /health {
        proxy_pass http://api_cluster/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header Connection "";
    }

    # BFF creates the three-tier APM hop visible in Splunk service map:
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

    # Serve index.html as the SPA fallback for this subdomain
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}

# ── Haiku Mobile App  (mobile.pseudo-co.com) ──────────────────────────────
server {
    listen ${SERVE_PORT};
    server_name ${MOBILE_HOST};

    root ${WEB_ROOT};

    location = /ping {
        access_log off;
        return 200 "pong\n";
        add_header Content-Type text/plain;
    }

    location /api/ {
        proxy_pass http://api_cluster/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /fhir/ {
        proxy_pass http://api_cluster/fhir/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location = /health {
        proxy_pass http://api_cluster/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header Connection "";
    }

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

    # Serve haiku.html as the SPA fallback for all routes on this subdomain.
    # Intentionally omits $uri/ — the directory check causes Nginx to serve
    # index.html (clinical portal) instead of haiku.html when $uri is /.
    location / {
        try_files \$uri /haiku.html;
    }
}

# ── Internal upstream proxy for BFF → API cluster ───────────────
# BFF calls http://127.0.0.1:${BFF_UPSTREAM_PORT} instead of a
# hardcoded single API IP, so all BFF→API calls are also load-balanced.
server {
    listen 127.0.0.1:${BFF_UPSTREAM_PORT};

    location / {
        proxy_pass http://api_cluster/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header Connection "";
        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
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
  if [[ -n "${API_ALB_DNS:-}" ]]; then
    _BFF_API_URL="http://${API_ALB_DNS}:${API_PORT}"
  else
    _BFF_API_URL="http://127.0.0.1:${BFF_UPSTREAM_PORT}"
  fi
  info "Writing BFF .env (API_URL=${_BFF_API_URL})..."
  cat > "${BFF_APP_DIR}/.env" <<EOF
NODE_ENV=production
BFF_PORT=${BFF_PORT}
API_URL=${_BFF_API_URL}
CORS_ORIGIN=https://${FRONTEND_HOST},https://${MOBILE_HOST}
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
echo "  ── Nginx routing ───────────────────────────────────────"
echo "  ${PATIENT_HOST}   →  /patient.html  (MyChart patient portal)"
echo "  ${CLINICAL_HOST}  →  /index.html    (CareConnect clinical)"
echo "  ${MOBILE_HOST}    →  /haiku.html    (Haiku mobile app)"
echo "  /ping    → 200 OK  (ALB/load-balancer health probe)"
echo "  /api/*   → upstream api_cluster  (${API_PRIVATE_IPS})"
echo "  /fhir/*  → upstream api_cluster"
echo "  /health  → upstream api_cluster"
echo "  /bff/*   → localhost:${BFF_PORT}  (BFF → three-tier APM hop)"
echo "  BFF API_URL → 127.0.0.1:${BFF_UPSTREAM_PORT} → api_cluster"
echo ""
echo "  Test login:"
echo "    patient@careconnect.demo  / Demo123!"
echo "    provider@careconnect.demo / Demo123!"
echo "    admin@careconnect.demo    / Demo123!"
echo ""
