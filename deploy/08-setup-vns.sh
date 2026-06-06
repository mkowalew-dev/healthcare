#!/bin/bash
# ============================================================
# CareConnect — Virtual Nursing Station (VNS) VM Setup
# Run this script on: VM7 (VNS)
# OS: Ubuntu 22.04 LTS
#
# Virtual nursing and remote patient oversight platform:
#   - Active virtual nursing sessions by type (nursing_consult, virtual_sitter,
#     care_team_conference, provider_rounding)
#   - Virtual Command Center — aggregated situational awareness (SCFP + CPM + VNS)
#   - Aggregated alert queue (from SCFP + CPM)
#   - Patient nursing assessments with optional EHR documentation
#   - Clinical escalations (dispatch to bedside staff)
#   - Shift handover summaries
#   - Built-in browser dashboard (ThousandEyes Page Load target)
#
# API endpoints:
#   GET  /                              HTML dashboard — command center view (TE Page Load)
#   GET  /ping                          HTTP SLO probe
#   GET  /health                        Service health + session stats
#   GET  /api/sessions                  Active sessions (?type=, ?status=)
#   GET  /api/sessions/:id              Session detail
#   POST /api/sessions/:id/assess       Submit nursing assessment (ehr_document:true → EHR note)
#   POST /api/sessions/:id/escalate     Dispatch bedside responder
#   GET  /api/assessments               Assessment history
#   GET  /api/escalations               Escalation history
#   GET  /api/alerts                    Aggregated alerts (SCFP + CPM)
#   GET  /api/command-center            Unified facility stats (virtual command center)
#   GET  /api/handover                  Shift handover summary
#
# Upstream connections (configured via env vars):
#   SCFP_HOST / SCFP_PORT  — Smart Care Facility Platform (VM6)
#   CPM_HOST  / CPM_PORT   — Continuous Patient Monitoring (VM8)
#   API_HOST  / API_PORT   — CareConnect API gateway (VM2, optional — enables EHR integration)
#
# Splunk Observability:
#   APM traces → careconnect-vns service (cross-service to SCFP + CPM)
#   Logs → Splunk Platform via OTel Collector (HEC)
# ============================================================
set -euo pipefail

VNS_DIR="${VNS_DIR:-/opt/careconnect/vns}"
APP_USER="${APP_USER:-careconnect}"
VNS_PORT="${VNS_PORT:-3031}"
VNS_HOST="${VNS_HOST:-vns.pseudo-co.com}"
SCFP_HOST="${SCFP_HOST:-}"
SCFP_PORT="${SCFP_PORT:-3030}"
CPM_HOST="${CPM_HOST:-}"
CPM_PORT="${CPM_PORT:-3032}"
API_HOST="${API_HOST:-}"        # CareConnect API gateway private IP (optional)
API_PORT="${API_PORT:-3001}"
SERVICE_TOKEN="${SERVICE_TOKEN:-}"
SPLUNK_ACCESS_TOKEN="${SPLUNK_ACCESS_TOKEN:-}"
SPLUNK_REALM="${SPLUNK_REALM:-us1}"
APP_ENV="${APP_ENV:-production}"
APP_VERSION="${APP_VERSION:-1.0.0}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓ $1${NC}"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠ $1${NC}"; }
err()  { echo -e "${RED}[$(date '+%H:%M:%S')] ✗ $1${NC}"; exit 1; }
info() { echo -e "${BLUE}[$(date '+%H:%M:%S')] → $1${NC}"; }

[[ $EUID -ne 0 ]] && err "Run as root: sudo bash 08-setup-vns.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"
VNS_SRC="${VNS_SRC:-}"
if [[ -z "$VNS_SRC" && -n "$SCRIPT_DIR" && -d "$SCRIPT_DIR/../vns/server" ]]; then
  VNS_SRC="$(realpath "$SCRIPT_DIR/../vns/server")"
fi
[[ -z "$VNS_SRC" || ! -d "$VNS_SRC" ]] && \
  err "Cannot locate vns/server source. Set VNS_SRC env var."

[[ -z "$SCFP_HOST" ]] && warn "SCFP_HOST not set — VNS alert aggregation from SCFP will fail"
[[ -z "$CPM_HOST"  ]] && warn "CPM_HOST not set — VNS alert aggregation from CPM will fail"

info "Starting VNS VM setup (Virtual Nursing Station)..."
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
  useradd --system --shell /bin/bash --home "${VNS_DIR}" --create-home "${APP_USER}"
  log "User '${APP_USER}' created"
fi

# ── Deploy source ─────────────────────────────────────────────
info "Deploying VNS server source..."
mkdir -p "${VNS_DIR}/src"
cp "${VNS_SRC}/src/index.js"   "${VNS_DIR}/src/"
cp "${VNS_SRC}/src/portal.js"  "${VNS_DIR}/src/"
cp "${VNS_SRC}/src/tracing.js" "${VNS_DIR}/src/"
cp "${VNS_SRC}/package.json"   "${VNS_DIR}/"
log "Source deployed to ${VNS_DIR}"

# ── Environment file ─────────────────────────────────────────
info "Writing environment configuration..."
cat > "${VNS_DIR}/.env" <<EOF
NODE_ENV=${APP_ENV}
VNS_PORT=${VNS_PORT}
SCFP_HOST=${SCFP_HOST}
SCFP_PORT=${SCFP_PORT}
CPM_HOST=${CPM_HOST}
CPM_PORT=${CPM_PORT}
API_HOST=${API_HOST}
API_PORT=${API_PORT}
SERVICE_TOKEN=${SERVICE_TOKEN}
LOG_DIR=/var/log/careconnect
OTEL_SERVICE_NAME=careconnect-vns
SPLUNK_ACCESS_TOKEN=${SPLUNK_ACCESS_TOKEN}
SPLUNK_REALM=${SPLUNK_REALM}
APP_VERSION=${APP_VERSION}
EOF
chmod 600 "${VNS_DIR}/.env"
log "Environment file written"

# ── Dependencies ─────────────────────────────────────────────
info "Installing Node.js dependencies..."
cd "${VNS_DIR}"
npm install --omit=dev --quiet
log "Dependencies installed"

chown -R "${APP_USER}:${APP_USER}" "${VNS_DIR}"
mkdir -p /var/log/careconnect
chown "${APP_USER}:${APP_USER}" /var/log/careconnect

# ── Systemd service ───────────────────────────────────────────
info "Configuring systemd service (careconnect-vns)..."
cat > /etc/systemd/system/careconnect-vns.service <<EOF
[Unit]
Description=CareConnect Virtual Nursing Station
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${VNS_DIR}
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=careconnect-vns
EnvironmentFile=${VNS_DIR}/.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable careconnect-vns
systemctl restart careconnect-vns
log "careconnect-vns service configured and started"

# ── Health check ─────────────────────────────────────────────
# SSL termination is handled by Azure Application Gateway — VMs serve plain HTTP.
info "Verifying VNS service..."
sleep 4
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${VNS_PORT}/health" || true)
if [[ "$HTTP_STATUS" == "200" ]]; then
  log "Health check passed (HTTP 200)"
else
  warn "Health check returned HTTP ${HTTP_STATUS} — service may still be starting"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ VNS VM setup complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Host:         $(hostname)"
echo "  Port:         ${VNS_PORT} (HTTP — SSL terminated at Application Gateway)"
echo "  App dir:      ${VNS_DIR}"
echo "  Logs:         journalctl -u careconnect-vns -f"
echo ""
echo "  Health:       curl http://localhost:${VNS_PORT}/health"
echo "  Sessions:     curl http://localhost:${VNS_PORT}/api/sessions"
echo "  Alerts:       curl http://localhost:${VNS_PORT}/api/alerts"
echo "  Portal:       https://vns.pseudo-co.com/ (via Application Gateway)"
echo ""
echo "  SCFP backend: ${SCFP_HOST:-'(not set)'}:${SCFP_PORT}"
echo "  CPM backend:  ${CPM_HOST:-'(not set)'}:${CPM_PORT}"
echo "  EHR API:      ${API_HOST:-'(not set — EHR integration disabled)'}${API_HOST:+:${API_PORT}}"
echo ""
