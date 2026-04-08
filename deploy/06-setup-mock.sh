#!/bin/bash
# ============================================================
# CareConnect EHR — Mock External Services VM Setup
# Run this script on: VM4 (Mock Services)
# OS: Ubuntu 22.04 LTS
#
# This VM simulates the external SaaS integrations that
# CareConnect calls during normal operation:
#   - Surescripts ePrescribing (SCRIPT 10.6)
#   - Quest Diagnostics LIS  (HL7 ORM_O01)
#   - LabCorp LIS             (HL7 ORM_O01)
#   - Twilio SMS              (REST API)
#   - SendGrid Email          (v3 Mail Send)
#
# ThousandEyes monitors the paths:
#   API VM → Mock VM:3002  (each service has its own sub-path)
#
# Usage (piped from local machine):
#   source deploy/config.env
#   ssh cisco@<MOCK_VM_IP> "sudo env \
#     MOCK_HOST='$MOCK_PRIVATE_IP' \
#     SURESCRIPTS_LATENCY_MS='${SURESCRIPTS_LATENCY_MS:-180}' \
#     QUEST_LATENCY_MS='${QUEST_LATENCY_MS:-240}' \
#     LABCORP_LATENCY_MS='${LABCORP_LATENCY_MS:-310}' \
#     TWILIO_LATENCY_MS='${TWILIO_LATENCY_MS:-120}' \
#     SENDGRID_LATENCY_MS='${SENDGRID_LATENCY_MS:-95}' \
#     BACKEND_SRC='/home/cisco/careconnect-backend' \
#     bash -s" < deploy/06-setup-mock.sh
# ============================================================
set -euo pipefail

# ── CONFIGURATION ──────────────────────────────────────────
MOCK_DIR="${MOCK_DIR:-/opt/careconnect/mock}"
APP_USER="${APP_USER:-careconnect}"
MOCK_PORT="${MOCK_PORT:-3002}"
BACKEND_SRC="${BACKEND_SRC:-}"

# Latency defaults — configurable per service
SURESCRIPTS_LATENCY_MS="${SURESCRIPTS_LATENCY_MS:-180}"
SURESCRIPTS_LATENCY_JITTER="${SURESCRIPTS_LATENCY_JITTER:-60}"
SURESCRIPTS_REGION="${SURESCRIPTS_REGION:-us-east-1 (Scottsdale, AZ)}"

QUEST_LATENCY_MS="${QUEST_LATENCY_MS:-240}"
QUEST_LATENCY_JITTER="${QUEST_LATENCY_JITTER:-80}"
QUEST_REGION="${QUEST_REGION:-us-east-1 (Secaucus, NJ)}"

LABCORP_LATENCY_MS="${LABCORP_LATENCY_MS:-310}"
LABCORP_LATENCY_JITTER="${LABCORP_LATENCY_JITTER:-100}"
LABCORP_REGION="${LABCORP_REGION:-us-east-2 (Burlington, NC)}"

TWILIO_LATENCY_MS="${TWILIO_LATENCY_MS:-120}"
TWILIO_LATENCY_JITTER="${TWILIO_LATENCY_JITTER:-40}"
TWILIO_REGION="${TWILIO_REGION:-us-west-2 (San Francisco, CA)}"

SENDGRID_LATENCY_MS="${SENDGRID_LATENCY_MS:-95}"
SENDGRID_LATENCY_JITTER="${SENDGRID_LATENCY_JITTER:-30}"
SENDGRID_REGION="${SENDGRID_REGION:-us-west-1 (Redwood City, CA)}"

# API VM private IP — added to firewall allowlist
API_PRIVATE_IP="${API_PRIVATE_IP:-10.0.1.20}"
# ───────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓ $1${NC}"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠ $1${NC}"; }
err()  { echo -e "${RED}[$(date '+%H:%M:%S')] ✗ $1${NC}"; exit 1; }
info() { echo -e "${BLUE}[$(date '+%H:%M:%S')] → $1${NC}"; }

[[ $EUID -ne 0 ]] && err "Run as root: sudo bash 06-setup-mock.sh"

# Resolve backend source
if [[ -z "$BACKEND_SRC" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"
  if [[ -n "$SCRIPT_DIR" && -d "$SCRIPT_DIR/../backend" ]]; then
    BACKEND_SRC="$(realpath "$SCRIPT_DIR/../backend")"
  else
    err "Cannot locate backend source. Set BACKEND_SRC env var."
  fi
fi
[[ ! -d "$BACKEND_SRC" ]] && err "BACKEND_SRC '$BACKEND_SRC' does not exist"

info "Starting CareConnect Mock Services VM setup..."
echo ""

# ── System update ─────────────────────────────────────────────
info "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl ufw
log "System updated"

# ── Install Node.js 20 ────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node --version | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  info "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | DISTRO=noble bash - 2>/dev/null
  apt-get install -y -qq nodejs
  log "Node.js $(node --version) installed"
else
  log "Node.js $(node --version) already installed"
fi

# ── Create app user ───────────────────────────────────────────
if ! id "${APP_USER}" &>/dev/null; then
  useradd --system --shell /bin/bash --home "${MOCK_DIR}" --create-home "${APP_USER}"
  log "User '${APP_USER}' created"
fi

# ── Deploy mock service files ──────────────────────────────────
info "Deploying mock service files..."
mkdir -p "${MOCK_DIR}/src"

# Only copy what the mock server needs
cp "${BACKEND_SRC}/src/mock-services.js" "${MOCK_DIR}/src/"
cp "${BACKEND_SRC}/package.json" "${MOCK_DIR}/"

log "Mock service files deployed to ${MOCK_DIR}"

# ── Write environment file ────────────────────────────────────
info "Writing environment configuration..."
cat > "${MOCK_DIR}/.env" <<EOF
NODE_ENV=production
MOCK_PORT=${MOCK_PORT}

# Per-service latency simulation
SURESCRIPTS_LATENCY_MS=${SURESCRIPTS_LATENCY_MS}
SURESCRIPTS_LATENCY_JITTER=${SURESCRIPTS_LATENCY_JITTER}
SURESCRIPTS_REGION=${SURESCRIPTS_REGION}

QUEST_LATENCY_MS=${QUEST_LATENCY_MS}
QUEST_LATENCY_JITTER=${QUEST_LATENCY_JITTER}
QUEST_REGION=${QUEST_REGION}

LABCORP_LATENCY_MS=${LABCORP_LATENCY_MS}
LABCORP_LATENCY_JITTER=${LABCORP_LATENCY_JITTER}
LABCORP_REGION=${LABCORP_REGION}

TWILIO_LATENCY_MS=${TWILIO_LATENCY_MS}
TWILIO_LATENCY_JITTER=${TWILIO_LATENCY_JITTER}
TWILIO_REGION=${TWILIO_REGION}

SENDGRID_LATENCY_MS=${SENDGRID_LATENCY_MS}
SENDGRID_LATENCY_JITTER=${SENDGRID_LATENCY_JITTER}
SENDGRID_REGION=${SENDGRID_REGION}

# Failure / timeout rates — set > 0 to simulate degraded services
SURESCRIPTS_FAILURE_RATE=0
QUEST_FAILURE_RATE=0
LABCORP_FAILURE_RATE=0
TWILIO_FAILURE_RATE=0
SENDGRID_FAILURE_RATE=0
SURESCRIPTS_TIMEOUT_RATE=0
TWILIO_TIMEOUT_RATE=0
EOF
chmod 600 "${MOCK_DIR}/.env"
log "Environment file written"

# ── Install dependencies ──────────────────────────────────────
info "Installing Node.js dependencies..."
cd "${MOCK_DIR}"
npm install --omit=dev --quiet
log "Dependencies installed"

chown -R "${APP_USER}:${APP_USER}" "${MOCK_DIR}"

# ── Create log directory ──────────────────────────────────────
mkdir -p /var/log/careconnect
chown "${APP_USER}:${APP_USER}" /var/log/careconnect

# ── Systemd service ───────────────────────────────────────────
info "Configuring systemd service..."
cat > /etc/systemd/system/careconnect-mock.service <<EOF
[Unit]
Description=CareConnect Mock External Services
After=network.target
Wants=network-online.target

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
EOF

systemctl daemon-reload
systemctl enable careconnect-mock
systemctl start careconnect-mock
log "Mock service systemd unit configured and started"

# ── Firewall ──────────────────────────────────────────────────
info "Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
# Mock port — only reachable from API VM (and ThousandEyes agents if desired)
ufw allow from "${API_PRIVATE_IP}" to any port "${MOCK_PORT}" comment 'Mock - API VM only'
# Uncomment to allow ThousandEyes Enterprise Agent to probe the mock health endpoint:
# ufw allow from <THOUSANDEYES_AGENT_IP> to any port "${MOCK_PORT}" comment 'ThousandEyes'
ufw --force enable
log "Firewall configured (port ${MOCK_PORT} open to API VM)"

# ── Health check ──────────────────────────────────────────────
info "Verifying mock service is responding..."
sleep 3
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${MOCK_PORT}/health" || echo "000")
if [[ "$HTTP_STATUS" == "200" ]]; then
  log "Mock service health check passed (HTTP 200)"
else
  warn "Health check returned HTTP ${HTTP_STATUS} — service may still be starting"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ Mock Services VM setup complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Host:         $(hostname)"
echo "  Port:         ${MOCK_PORT}"
echo "  App dir:      ${MOCK_DIR}"
echo "  Logs:         journalctl -u careconnect-mock -f"
echo ""
echo "  Health:       curl http://localhost:${MOCK_PORT}/health"
echo "  Config:       curl http://localhost:${MOCK_PORT}/config"
echo "  Request log:  curl http://localhost:${MOCK_PORT}/log"
echo ""
echo "  Adjust latency live (no restart):"
echo "    curl -X PATCH http://localhost:${MOCK_PORT}/config \\"
echo "      -H 'Content-Type: application/json' \\"
echo "      -d '{\"twilio\":{\"latencyMs\":800,\"failureRate\":0.5}}'"
echo ""
echo "  Next: Set MOCK_HOST=${API_PRIVATE_IP%.*}.$(hostname -I | awk '{print $1}' | cut -d. -f4)"
echo "        in /opt/careconnect/api/.env on VM2, then restart careconnect-api"
echo ""
