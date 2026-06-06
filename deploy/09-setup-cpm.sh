#!/bin/bash
# ============================================================
# CareConnect — Continuous Patient Monitoring (CPM) VM Setup
# Run this script on: VM8 (CPM)
# OS: Ubuntu 22.04 LTS
#
# Predictive patient monitoring and early warning scoring:
#   - Continuous vital sign streaming (20+ patients)
#   - NEWS2 Early Warning Score calculation (real algorithm)
#   - Deterioration trend detection (improving/stable/deteriorating)
#   - IoT/wearable device registry
#   - High-risk patient escalation alerts
#
# API endpoints:
#   GET  /ping                          HTTP SLO probe
#   GET  /health                        Service health + monitoring stats
#   GET  /api/patients                  All monitored patients with EWS
#   GET  /api/patients/:id              Patient detail + recent vitals + EWS
#   GET  /api/patients/:id/vitals       Vital sign history (up to 24 readings)
#   GET  /api/patients/:id/ews          NEWS2 EWS breakdown by component
#   GET  /api/alerts                    Active deterioration alerts
#   PATCH /api/alerts/:id/ack           Acknowledge alert
#   GET  /api/devices                   IoT device registry
#   GET  /api/stats                     Aggregate statistics
#
# Splunk Observability:
#   APM traces → careconnect-cpm service
#   Logs → Splunk Platform via OTel Collector (HEC)
# ============================================================
set -euo pipefail

CPM_DIR="${CPM_DIR:-/opt/careconnect/cpm}"
APP_USER="${APP_USER:-careconnect}"
CPM_PORT="${CPM_PORT:-3032}"
CPM_DEVICE_COUNT="${CPM_DEVICE_COUNT:-20}"
CPM_VITAL_INTERVAL_MS="${CPM_VITAL_INTERVAL_MS:-15000}"
SPLUNK_ACCESS_TOKEN="${SPLUNK_ACCESS_TOKEN:-}"
SPLUNK_REALM="${SPLUNK_REALM:-us1}"
APP_ENV="${APP_ENV:-production}"
APP_VERSION="${APP_VERSION:-1.0.0}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓ $1${NC}"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠ $1${NC}"; }
err()  { echo -e "${RED}[$(date '+%H:%M:%S')] ✗ $1${NC}"; exit 1; }
info() { echo -e "${BLUE}[$(date '+%H:%M:%S')] → $1${NC}"; }

[[ $EUID -ne 0 ]] && err "Run as root: sudo bash 09-setup-cpm.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"
CPM_SRC="${CPM_SRC:-}"
if [[ -z "$CPM_SRC" && -n "$SCRIPT_DIR" && -d "$SCRIPT_DIR/../cpm/server" ]]; then
  CPM_SRC="$(realpath "$SCRIPT_DIR/../cpm/server")"
fi
[[ -z "$CPM_SRC" || ! -d "$CPM_SRC" ]] && \
  err "Cannot locate cpm/server source. Set CPM_SRC env var."

info "Starting CPM VM setup (Continuous Patient Monitoring)..."
echo ""

# ── System packages ──────────────────────────────────────────
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl
log "System updated"

# ── Node.js 20 ───────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node --version | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  info "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | DISTRO=noble bash - 2>/dev/null
  apt-get install -y -qq nodejs
  log "Node.js $(node --version) installed"
else
  log "Node.js $(node --version) already installed"
fi

if ! id "${APP_USER}" &>/dev/null; then
  useradd --system --shell /bin/bash --home "${CPM_DIR}" --create-home "${APP_USER}"
  log "User '${APP_USER}' created"
fi

# ── Deploy source ─────────────────────────────────────────────
info "Deploying CPM server source..."
mkdir -p "${CPM_DIR}/src"
cp "${CPM_SRC}/src/index.js"    "${CPM_DIR}/src/"
cp "${CPM_SRC}/src/vital-sim.js" "${CPM_DIR}/src/"
cp "${CPM_SRC}/src/tracing.js"  "${CPM_DIR}/src/"
cp "${CPM_SRC}/package.json"    "${CPM_DIR}/"
log "Source deployed to ${CPM_DIR}"

# ── Environment file ─────────────────────────────────────────
info "Writing environment configuration..."
cat > "${CPM_DIR}/.env" <<EOF
NODE_ENV=${APP_ENV}
CPM_PORT=${CPM_PORT}
CPM_DEVICE_COUNT=${CPM_DEVICE_COUNT}
CPM_VITAL_INTERVAL_MS=${CPM_VITAL_INTERVAL_MS}
LOG_DIR=/var/log/careconnect
OTEL_SERVICE_NAME=careconnect-cpm
SPLUNK_ACCESS_TOKEN=${SPLUNK_ACCESS_TOKEN}
SPLUNK_REALM=${SPLUNK_REALM}
APP_VERSION=${APP_VERSION}
EOF
chmod 600 "${CPM_DIR}/.env"
log "Environment file written"

# ── Dependencies ─────────────────────────────────────────────
info "Installing Node.js dependencies..."
cd "${CPM_DIR}"
npm install --omit=dev --quiet
log "Dependencies installed"

chown -R "${APP_USER}:${APP_USER}" "${CPM_DIR}"
mkdir -p /var/log/careconnect
chown "${APP_USER}:${APP_USER}" /var/log/careconnect

# ── Systemd service ───────────────────────────────────────────
info "Configuring systemd service (careconnect-cpm)..."
cat > /etc/systemd/system/careconnect-cpm.service <<EOF
[Unit]
Description=CareConnect Continuous Patient Monitoring
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${CPM_DIR}
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=careconnect-cpm
EnvironmentFile=${CPM_DIR}/.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable careconnect-cpm
systemctl restart careconnect-cpm
log "careconnect-cpm service configured and started"

# ── Health check ─────────────────────────────────────────────
info "Verifying CPM service..."
sleep 4
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${CPM_PORT}/health" || true)
if [[ "$HTTP_STATUS" == "200" ]]; then
  log "Health check passed (HTTP 200)"
else
  warn "Health check returned HTTP ${HTTP_STATUS} — service may still be starting"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ CPM VM setup complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Host:         $(hostname)"
echo "  Port:         ${CPM_PORT}"
echo "  Patients:     ${CPM_DEVICE_COUNT}"
echo "  App dir:      ${CPM_DIR}"
echo "  Logs:         journalctl -u careconnect-cpm -f"
echo ""
echo "  Health:       curl http://localhost:${CPM_PORT}/health"
echo "  Patients:     curl http://localhost:${CPM_PORT}/api/patients"
echo "  High risk:    curl 'http://localhost:${CPM_PORT}/api/patients?risk=high'"
echo "  Active alerts:curl http://localhost:${CPM_PORT}/api/alerts"
echo "  Devices:      curl http://localhost:${CPM_PORT}/api/devices"
echo ""
echo "  EWS for patient PT-10000:"
echo "    curl http://localhost:${CPM_PORT}/api/patients/PT-10000/ews"
echo ""
echo "  Set CPM_HOST=$(hostname -I | awk '{print $1}') in config.env"
echo ""
