#!/bin/bash
# ============================================================
# CareConnect — Smart Care Facility Platform (SCFP) VM Setup
# Run this script on: VM6 (SCFP)
# OS: Ubuntu 22.04 LTS
#
# AI-powered room monitoring and fall detection:
#   - Ambient intelligence room monitoring (24 rooms)
#   - AI fall detection and bed exit alerts
#   - Staff workflow optimization recommendations
#   - Real-time sensor event streams
#
# API endpoints:
#   GET  /ping                          ThousandEyes HTTP SLO probe
#   GET  /health                        Service health + room stats
#   GET  /api/rooms                     All monitored rooms
#   GET  /api/rooms/:id                 Room detail + recent events
#   GET  /api/rooms/:id/events          Room event history
#   GET  /api/events/falls              Fall detection events (24h)
#   GET  /api/alerts                    Active alert queue
#   PATCH /api/alerts/:id/ack           Acknowledge alert
#   GET  /api/staff/workflow            AI workflow recommendations
#   GET  /api/stats                     Aggregate statistics
#
# Splunk Observability:
#   APM traces → careconnect-scfp service in Splunk O11y Cloud
#   Logs → Splunk Platform via OTel Collector (HEC)
#
# Usage (from healthcare-deploy.sh):
#   ssh ubuntu@<SCFP_VM_IP> "sudo env \
#     SCFP_PORT='3030' \
#     SCFP_ROOM_COUNT='24' \
#     SPLUNK_ACCESS_TOKEN='...' \
#     SPLUNK_REALM='us1' \
#   bash ~/careconnect/deploy/07-setup-scfp.sh"
# ============================================================
set -euo pipefail

SCFP_DIR="${SCFP_DIR:-/opt/careconnect/scfp}"
APP_USER="${APP_USER:-careconnect}"
SCFP_PORT="${SCFP_PORT:-3030}"
SCFP_ROOM_COUNT="${SCFP_ROOM_COUNT:-24}"
SCFP_EVENT_INTERVAL_MS="${SCFP_EVENT_INTERVAL_MS:-8000}"
SPLUNK_ACCESS_TOKEN="${SPLUNK_ACCESS_TOKEN:-}"
SPLUNK_REALM="${SPLUNK_REALM:-us1}"
APP_ENV="${APP_ENV:-production}"
APP_VERSION="${APP_VERSION:-1.0.0}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓ $1${NC}"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠ $1${NC}"; }
err()  { echo -e "${RED}[$(date '+%H:%M:%S')] ✗ $1${NC}"; exit 1; }
info() { echo -e "${BLUE}[$(date '+%H:%M:%S')] → $1${NC}"; }

[[ $EUID -ne 0 ]] && err "Run as root: sudo bash 07-setup-scfp.sh"

# ── Resolve source directory ──────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"
SCFP_SRC="${SCFP_SRC:-}"
if [[ -z "$SCFP_SRC" && -n "$SCRIPT_DIR" && -d "$SCRIPT_DIR/../scfp/server" ]]; then
  SCFP_SRC="$(realpath "$SCRIPT_DIR/../scfp/server")"
fi
[[ -z "$SCFP_SRC" || ! -d "$SCFP_SRC" ]] && \
  err "Cannot locate scfp/server source. Set SCFP_SRC env var."

info "Starting SCFP VM setup (Smart Care Facility Platform — room monitoring and fall detection)..."
echo ""

# ── System packages ──────────────────────────────────────────
info "Updating system packages..."
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

# ── App user ─────────────────────────────────────────────────
if ! id "${APP_USER}" &>/dev/null; then
  useradd --system --shell /bin/bash --home "${SCFP_DIR}" --create-home "${APP_USER}"
  log "User '${APP_USER}' created"
fi

# ── Deploy source ─────────────────────────────────────────────
info "Deploying SCFP server source..."
mkdir -p "${SCFP_DIR}/src"
cp "${SCFP_SRC}/src/index.js"      "${SCFP_DIR}/src/"
cp "${SCFP_SRC}/src/sensor-sim.js" "${SCFP_DIR}/src/"
cp "${SCFP_SRC}/src/tracing.js"    "${SCFP_DIR}/src/"
cp "${SCFP_SRC}/package.json"      "${SCFP_DIR}/"
log "Source deployed to ${SCFP_DIR}"

# ── Environment file ─────────────────────────────────────────
info "Writing environment configuration..."
cat > "${SCFP_DIR}/.env" <<EOF
NODE_ENV=${APP_ENV}
SCFP_PORT=${SCFP_PORT}
SCFP_ROOM_COUNT=${SCFP_ROOM_COUNT}
SCFP_EVENT_INTERVAL_MS=${SCFP_EVENT_INTERVAL_MS}
LOG_DIR=/var/log/careconnect
OTEL_SERVICE_NAME=careconnect-scfp
SPLUNK_ACCESS_TOKEN=${SPLUNK_ACCESS_TOKEN}
SPLUNK_REALM=${SPLUNK_REALM}
APP_VERSION=${APP_VERSION}
EOF
chmod 600 "${SCFP_DIR}/.env"
log "Environment file written"

# ── Dependencies ─────────────────────────────────────────────
info "Installing Node.js dependencies..."
cd "${SCFP_DIR}"
npm install --omit=dev --quiet
log "Dependencies installed"

chown -R "${APP_USER}:${APP_USER}" "${SCFP_DIR}"

# ── Log directory ─────────────────────────────────────────────
mkdir -p /var/log/careconnect
chown "${APP_USER}:${APP_USER}" /var/log/careconnect

# ── Systemd service ───────────────────────────────────────────
info "Configuring systemd service (careconnect-scfp)..."
cat > /etc/systemd/system/careconnect-scfp.service <<EOF
[Unit]
Description=CareConnect Smart Care Facility Platform
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${SCFP_DIR}
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=careconnect-scfp
EnvironmentFile=${SCFP_DIR}/.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable careconnect-scfp
systemctl restart careconnect-scfp
log "careconnect-scfp service configured and started"

# ── Health check ─────────────────────────────────────────────
info "Verifying SCFP service..."
sleep 4
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${SCFP_PORT}/health" || true)
if [[ "$HTTP_STATUS" == "200" ]]; then
  log "Health check passed (HTTP 200)"
else
  warn "Health check returned HTTP ${HTTP_STATUS} — service may still be starting"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ SCFP VM setup complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Host:         $(hostname)"
echo "  Port:         ${SCFP_PORT}"
echo "  Rooms:        ${SCFP_ROOM_COUNT}"
echo "  App dir:      ${SCFP_DIR}"
echo "  Logs:         journalctl -u careconnect-scfp -f"
echo ""
echo "  Health:       curl http://localhost:${SCFP_PORT}/health"
echo "  Rooms:        curl http://localhost:${SCFP_PORT}/api/rooms"
echo "  Active alerts:curl http://localhost:${SCFP_PORT}/api/alerts"
echo "  AI workflow:  curl http://localhost:${SCFP_PORT}/api/staff/workflow"
echo ""
echo "  Next: Run 08-setup-vns.sh on the VNS VM"
echo "        Set SCFP_HOST=$(hostname -I | awk '{print $1}') in config.env"
echo ""
