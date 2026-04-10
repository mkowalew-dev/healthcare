#!/bin/bash
# ============================================================
# CareConnect EHR — Application Update Script
# Run this when you deploy code changes
#
# Usage:
#   On API VM:      sudo bash 04-update.sh api
#   On Frontend VM: sudo bash 04-update.sh frontend
#   On Frontend VM: sudo bash 04-update.sh bff
#   On Mock VM:     sudo bash 04-update.sh mock
# ============================================================
set -euo pipefail

# ── CONFIGURATION ──────────────────────────────────────────
APP_DIR="/opt/careconnect/api"
APP_USER="careconnect"
WEB_ROOT="/var/www/careconnect"
MOCK_DIR="/opt/careconnect/mock"
BFF_DIR="/opt/careconnect/bff"

# Splunk RUM vars — baked into the React bundle at build time.
# Passed in via deploy/deploy.sh from config.env; fall back to placeholders
# if running this script manually on the VM.
SPLUNK_RUM_TOKEN="${SPLUNK_RUM_TOKEN:-CHANGE_THIS_RUM_TOKEN}"
SPLUNK_REALM="${SPLUNK_REALM:-us1}"
APP_ENV="${APP_ENV:-production}"
# ───────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓ $1${NC}"; }
info() { echo -e "${BLUE}[$(date '+%H:%M:%S')] → $1${NC}"; }
err()  { echo -e "${RED}[$(date '+%H:%M:%S')] ✗ $1${NC}"; exit 1; }

ROLE="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "$ROLE" in
  api)
    info "Updating API VM..."
    [[ $EUID -ne 0 ]] && err "Run as root"

    # Sync new code (preserves .env)
    rsync -a --delete \
      --exclude 'node_modules' \
      --exclude '.env' \
      --exclude 'ecosystem.config.js' \
      "${SCRIPT_DIR}/../backend/" "${APP_DIR}/"

    cd "${APP_DIR}"
    npm install --omit=dev --quiet
    chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

    # Regenerate PM2 ecosystem config (ports and service names are stable; APP_DIR is VM-specific)
    info "Regenerating PM2 ecosystem config..."
    cat > "${APP_DIR}/ecosystem.config.js" <<'ECOEOF'
// CareConnect API — PM2 ecosystem
// One process per domain service. Each carries its own OTEL_SERVICE_NAME so
// Splunk APM shows a distinct node in the service map for every service.
// The gateway (careconnect-api) proxies all inbound traffic to these services.
ECOEOF
    cat >> "${APP_DIR}/ecosystem.config.js" <<ECOEOF
const BASE = '${APP_DIR}';
const common = {
  cwd: BASE,
  env_file: BASE + '/.env',
  max_memory_restart: '256M',
  log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  error_file: '/var/log/careconnect/api-error.log',
  out_file: '/var/log/careconnect/api-out.log',
  merge_logs: true,
  restart_delay: 3000,
  max_restarts: 10,
};

module.exports = {
  apps: [
    { ...common, name: 'careconnect-api',           script: 'src/index.js',                          instances: 1,
      env: { OTEL_SERVICE_NAME: 'careconnect-api-gwy' } },
    { ...common, name: 'careconnect-patients',      script: 'src/services/patients-service.js',      instances: 1,
      env: { OTEL_SERVICE_NAME: 'careconnect-patients',      PATIENTS_SERVICE_PORT:      '3011' } },
    { ...common, name: 'careconnect-labs',          script: 'src/services/labs-service.js',          instances: 1,
      env: { OTEL_SERVICE_NAME: 'careconnect-labs',          LABS_SERVICE_PORT:          '3012' } },
    { ...common, name: 'careconnect-rx',            script: 'src/services/rx-service.js',            instances: 1,
      env: { OTEL_SERVICE_NAME: 'careconnect-rx',            RX_SERVICE_PORT:            '3013' } },
    { ...common, name: 'careconnect-notifications', script: 'src/services/notifications-service.js', instances: 1,
      env: { OTEL_SERVICE_NAME: 'careconnect-notifications', NOTIFICATIONS_SERVICE_PORT: '3014' } },
    { ...common, name: 'careconnect-fhir',          script: 'src/services/fhir-service.js',          instances: 1,
      env: { OTEL_SERVICE_NAME: 'careconnect-fhir',          FHIR_SERVICE_PORT:          '3015' } },
    { ...common, name: 'careconnect-admin',         script: 'src/services/admin-service.js',         instances: 1,
      env: { OTEL_SERVICE_NAME: 'careconnect-admin',         ADMIN_SERVICE_PORT:         '3016' } },
    { ...common, name: 'careconnect-billing',       script: 'src/services/billing-service.js',       instances: 1,
      env: { OTEL_SERVICE_NAME: 'careconnect-billing',       BILLING_SERVICE_PORT:       '3017' } },
    { ...common, name: 'careconnect-ai',            script: 'src/services/ai-service.js',            instances: 1,
      env: { OTEL_SERVICE_NAME: 'careconnect-ai',            AI_SERVICE_PORT:            '3018' } },
  ],
};
ECOEOF
    log "ecosystem.config.js regenerated (9 services)"

    # Re-seed the database with fresh demo data
    info "Re-seeding database..."
    cd "${APP_DIR}"
    sudo -u "${APP_USER}" node src/db/seed.js && log "Database re-seeded" || err "Seed failed — check logs above"

    # Patch mock service URLs in .env if MOCK_HOST is provided.
    # Uses a helper that updates the line if it exists, or appends it if not.
    if [[ -n "${MOCK_HOST:-}" ]]; then
      MOCK_BASE="http://${MOCK_HOST}:${MOCK_PORT:-3002}"
      info "Updating mock service URLs in .env → ${MOCK_BASE}"

      set_env() {
        local key="$1" val="$2" file="$3"
        if grep -q "^${key}=" "$file"; then
          sed -i "s|^${key}=.*|${key}=${val}|" "$file"
        else
          echo "${key}=${val}" >> "$file"
        fi
      }

      set_env SURESCRIPTS_URL "${MOCK_BASE}/surescripts" "${APP_DIR}/.env"
      set_env QUEST_LIS_URL    "${MOCK_BASE}/quest"       "${APP_DIR}/.env"
      set_env LABCORP_LIS_URL  "${MOCK_BASE}/labcorp"     "${APP_DIR}/.env"
      set_env TWILIO_API_URL   "${MOCK_BASE}/twilio"      "${APP_DIR}/.env"
      set_env SENDGRID_API_URL "${MOCK_BASE}/sendgrid"    "${APP_DIR}/.env"

      log "Mock URLs set to ${MOCK_BASE}"
    fi

    # Update DATABASE_URL if DB_HOST is provided (ensures FQDN is used instead of IP
    # so the OTel pg instrumentation reports a named host in the Splunk service map)
    if [[ -n "${DB_HOST:-}" ]]; then
      # Extract existing password from current DATABASE_URL to avoid losing it
      EXISTING_PW=$(grep "^DATABASE_URL=" "${APP_DIR}/.env" | sed 's|.*://[^:]*:\([^@]*\)@.*|\1|')
      set_env DATABASE_URL "postgresql://${DB_USER:-careconnect}:${EXISTING_PW}@${DB_HOST}:5432/${DB_NAME:-careconnect}" "${APP_DIR}/.env"
      log "DATABASE_URL updated to use host ${DB_HOST}"
    fi

    # Update FHIR_BASE_URL if FRONTEND_HOST is provided
    if [[ -n "${FRONTEND_HOST:-}" ]]; then
      set_env() {
        local key="$1" val="$2" file="$3"
        if grep -q "^${key}=" "$file"; then
          sed -i "s|^${key}=.*|${key}=${val}|" "$file"
        else
          echo "${key}=${val}" >> "$file"
        fi
      }
      set_env FHIR_BASE_URL "https://${FRONTEND_HOST}/fhir" "${APP_DIR}/.env"
      log "FHIR_BASE_URL set to https://${FRONTEND_HOST}/fhir"
    fi

    # Update lab simulator timing if provided
    if [[ -n "${LAB_RESULT_INTERVAL_MS:-}" ]]; then
      set_env LAB_RESULT_INTERVAL_MS "${LAB_RESULT_INTERVAL_MS}" "${APP_DIR}/.env"
      set_env LAB_MIN_AGE_MS "${LAB_MIN_AGE_MS:-${LAB_RESULT_INTERVAL_MS}}" "${APP_DIR}/.env"
      log "Lab simulator: interval=${LAB_RESULT_INTERVAL_MS}ms, min_age=${LAB_MIN_AGE_MS:-${LAB_RESULT_INTERVAL_MS}}ms"
    fi

    # Restart via systemd — pm2-runtime re-reads ecosystem.config.js and starts all services
    systemctl restart careconnect-api
    sleep 3
    systemctl is-active --quiet careconnect-api && \
      log "API gateway + all domain services restarted" || \
      err "API failed to restart — check: journalctl -u careconnect-api -n 50"
    ;;

  frontend)
    info "Updating Frontend VM..."
    [[ $EUID -ne 0 ]] && err "Run as root"

    BUILD_TMP="/tmp/careconnect-frontend-build"
    rm -rf "${BUILD_TMP}"
    cp -r "${SCRIPT_DIR}/../frontend" "${BUILD_TMP}"
    cd "${BUILD_TMP}"
    npm install --quiet
    VITE_API_URL="${API_URL:-}" \
    VITE_SPLUNK_RUM_TOKEN="${SPLUNK_RUM_TOKEN}" \
    VITE_SPLUNK_REALM="${SPLUNK_REALM}" \
    VITE_APP_ENV="${APP_ENV}" \
      npm run build

    rsync -a --delete "${BUILD_TMP}/dist/" "${WEB_ROOT}/"
    chmod -R 755 "${WEB_ROOT}"
    rm -rf "${BUILD_TMP}"

    # Update the Nginx proxy config if API_PRIVATE_URL is provided.
    # This keeps the Nginx upstream in sync with the current API VM IP.
    if [[ -n "${API_PRIVATE_URL:-}" && -f /etc/nginx/sites-available/careconnect ]]; then
      BFF_PORT="${BFF_PORT:-3003}"
      cat > /etc/nginx/sites-available/careconnect <<NGINXEOF
server {
    listen 80 default_server;
    server_name _;

    root ${WEB_ROOT};
    index index.html;

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

    location = /health {
        proxy_pass ${API_PRIVATE_URL}/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
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

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINXEOF
      nginx -t && nginx -s reload && log "Nginx config updated and reloaded"
    else
      # Nginx serves files directly from disk — signal reload to pick up new assets
      nginx -s reload 2>/dev/null && log "Nginx reloaded" || \
        systemctl restart nginx && log "Nginx restarted"
    fi
    ;;

  mock)
    info "Updating Mock External Services VM..."
    [[ $EUID -ne 0 ]] && err "Run as root"

    # ── Install Node.js 20 if missing ──────────────────────────
    if ! command -v node &>/dev/null || [[ "$(node --version | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
      info "Node.js not found — installing Node.js 20..."
      apt-get update -qq
      apt-get install -y -qq curl
      curl -fsSL https://deb.nodesource.com/setup_20.x | DISTRO=noble bash - 2>/dev/null
      apt-get install -y -qq nodejs
      log "Node.js $(node --version) installed"
    fi

    # ── Create app user if missing ──────────────────────────────
    if ! id "${APP_USER}" &>/dev/null; then
      useradd --system --shell /bin/bash --home "${MOCK_DIR}" --create-home "${APP_USER}"
    fi

    # ── Deploy files ────────────────────────────────────────────
    mkdir -p "${MOCK_DIR}/src"
    cp "${SCRIPT_DIR}/../backend/src/mock-services.js" "${MOCK_DIR}/src/"
    cp "${SCRIPT_DIR}/../backend/package.json" "${MOCK_DIR}/"

    # ── Write default .env if one doesn't exist yet ─────────────
    if [[ ! -f "${MOCK_DIR}/.env" ]]; then
      info "Writing default .env for mock service..."
      cat > "${MOCK_DIR}/.env" <<'ENVEOF'
NODE_ENV=production
MOCK_PORT=3002
SURESCRIPTS_LATENCY_MS=180
SURESCRIPTS_LATENCY_JITTER=60
QUEST_LATENCY_MS=240
QUEST_LATENCY_JITTER=80
LABCORP_LATENCY_MS=310
LABCORP_LATENCY_JITTER=100
TWILIO_LATENCY_MS=120
TWILIO_LATENCY_JITTER=40
SENDGRID_LATENCY_MS=95
SENDGRID_LATENCY_JITTER=30
SURESCRIPTS_FAILURE_RATE=0
QUEST_FAILURE_RATE=0
LABCORP_FAILURE_RATE=0
TWILIO_FAILURE_RATE=0
SENDGRID_FAILURE_RATE=0
SURESCRIPTS_TIMEOUT_RATE=0
TWILIO_TIMEOUT_RATE=0
ENVEOF
      chmod 600 "${MOCK_DIR}/.env"
      log "Default .env written"
    fi

    cd "${MOCK_DIR}"
    npm install --omit=dev --quiet
    chown -R "${APP_USER}:${APP_USER}" "${MOCK_DIR}"

    # ── Create log directory ─────────────────────────────────────
    mkdir -p /var/log/careconnect
    chown "${APP_USER}:${APP_USER}" /var/log/careconnect

    # ── Install systemd unit if not already present ─────────────
    if [[ ! -f /etc/systemd/system/careconnect-mock.service ]]; then
      info "Installing careconnect-mock systemd service..."
      cat > /etc/systemd/system/careconnect-mock.service <<SVCEOF
[Unit]
Description=CareConnect Mock External Services
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${MOCK_DIR}
ExecStart=/usr/bin/node src/mock-services.js
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=careconnect-mock
EnvironmentFile=${MOCK_DIR}/.env

[Install]
WantedBy=multi-user.target
SVCEOF
      systemctl daemon-reload
      systemctl enable careconnect-mock
      log "careconnect-mock service installed"
    fi

    systemctl restart careconnect-mock
    sleep 2
    systemctl is-active --quiet careconnect-mock && \
      log "Mock service restarted successfully" || \
      err "Mock service failed to restart — check: journalctl -u careconnect-mock -n 50"

    # Quick health check
    MOCK_PORT="${MOCK_PORT:-3002}"
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${MOCK_PORT}/health" || echo "000")
    [[ "$HTTP_STATUS" == "200" ]] && \
      log "Mock service health check passed (HTTP 200)" || \
      info "Mock health returned HTTP ${HTTP_STATUS} — may still be starting"
    ;;

  bff)
    info "Updating BFF VM..."
    [[ $EUID -ne 0 ]] && err "Run as root"

    # ── Install Node.js 20 if missing ──────────────────────────
    if ! command -v node &>/dev/null || [[ "$(node --version | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
      info "Node.js not found — installing Node.js 20..."
      apt-get update -qq
      apt-get install -y -qq curl
      curl -fsSL https://deb.nodesource.com/setup_20.x | DISTRO=noble bash - 2>/dev/null
      apt-get install -y -qq nodejs
      log "Node.js $(node --version) installed"
    fi

    # ── Deploy files ────────────────────────────────────────────
    mkdir -p "${BFF_DIR}"
    rsync -a --delete \
      --exclude 'node_modules' \
      --exclude '.env' \
      "${SCRIPT_DIR}/../bff/" "${BFF_DIR}/"

    # ── Always rewrite .env with current config values ──────────
    # Do not guard with -f; values like API_URL and CORS_ORIGIN must
    # reflect the actual environment on every deploy.
    [[ -z "${API_PRIVATE_URL:-}" ]] && \
      warn "API_PRIVATE_URL not set — BFF will not be able to reach the API"
    info "Writing BFF .env..."
    cat > "${BFF_DIR}/.env" <<ENVEOF
NODE_ENV=production
BFF_PORT=${BFF_PORT:-3003}
API_URL=${API_PRIVATE_URL:-http://localhost:3001}
CORS_ORIGIN=https://${FRONTEND_HOST:-localhost}
LOG_LEVEL=info
SPLUNK_ACCESS_TOKEN=${SPLUNK_ACCESS_TOKEN:-}
SPLUNK_REALM=${SPLUNK_REALM:-us1}
ENVEOF
    chmod 600 "${BFF_DIR}/.env"
    log ".env written (API_URL=${API_PRIVATE_URL:-http://localhost:3001})"

    cd "${BFF_DIR}"
    npm install --omit=dev --quiet

    # ── Install systemd unit if not already present ─────────────
    if [[ ! -f /etc/systemd/system/careconnect-bff.service ]]; then
      info "Installing careconnect-bff systemd service..."
      cat > /etc/systemd/system/careconnect-bff.service <<SVCEOF
[Unit]
Description=CareConnect BFF (Backend for Frontend proxy)
After=network.target

[Service]
Type=simple
WorkingDirectory=${BFF_DIR}
ExecStart=$(which node) src/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=careconnect-bff
EnvironmentFile=${BFF_DIR}/.env

[Install]
WantedBy=multi-user.target
SVCEOF
      systemctl daemon-reload
      systemctl enable careconnect-bff
      log "careconnect-bff service installed"
    fi

    # ── Firewall — open BFF port to Cloudflare ──────────────────
    if command -v ufw &>/dev/null; then
      ufw allow "${BFF_PORT:-3003}/tcp" comment 'BFF' 2>/dev/null
      for ip in $(curl -sf https://www.cloudflare.com/ips-v4); do
        ufw allow from "$ip" to any port "${BFF_PORT:-3003}" comment 'Cloudflare' 2>/dev/null
      done
      ufw reload 2>/dev/null || true
      log "Firewall updated for BFF port ${BFF_PORT:-3003}"
    fi

    systemctl restart careconnect-bff
    sleep 2
    systemctl is-active --quiet careconnect-bff && \
      log "BFF restarted successfully" || \
      err "BFF failed to restart — check: journalctl -u careconnect-bff -n 50"

    BFF_PORT="${BFF_PORT:-3003}"
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${BFF_PORT}/bff/health" || echo "000")
    [[ "$HTTP_STATUS" == "200" ]] && \
      log "BFF health check passed (HTTP 200)" || \
      info "BFF health returned HTTP ${HTTP_STATUS} — may still be starting"
    ;;

  *)
    echo "Usage: sudo bash 04-update.sh [api|frontend|bff|mock]"
    exit 1
    ;;
esac
