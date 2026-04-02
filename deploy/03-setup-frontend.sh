#!/bin/bash
# ============================================================
# CareConnect EHR — Frontend VM Setup
# Run this script on: VM1 (Frontend / Web)
# OS: Ubuntu 22.04 LTS
#
# Architecture: ALB (AWS or Azure) handles all routing.
#   - ALB /api/* → VM2:3001  (API)
#   - ALB /*     → VM1:80    (this VM — serves static files)
# This VM runs `serve` (lightweight static file server).
# No reverse proxy needed — the ALB does path-based routing.
# ============================================================
set -euo pipefail

# ── CONFIGURATION ──────────────────────────────────────────
# Fill in these values before running
FRONTEND_HOST="careconnect-web.example.com"  # This VM's public hostname/IP (for display only)
WEB_ROOT="/var/www/careconnect"
SERVE_PORT=80

# Splunk Observability Cloud — RUM (Real User Monitoring)
# Get the RUM token from: Splunk O11y Cloud → Settings → Access Tokens (type: RUM)
SPLUNK_RUM_TOKEN="CHANGE_THIS_RUM_TOKEN"
SPLUNK_REALM="us1"   # Match your O11y Cloud realm (us0, us1, eu0, ap0, etc.)
APP_ENV="production"
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
[[ ! -d "$(dirname "$0")/../frontend" ]] && \
  err "Run this script from the healthcare/deploy/ directory"
[[ "$SPLUNK_RUM_TOKEN" == "CHANGE_THIS_RUM_TOKEN" ]] && \
  warn "SPLUNK_RUM_TOKEN not set — RUM will be disabled in this build"

info "Starting CareConnect frontend VM setup..."
echo ""

# ── System update ─────────────────────────────────────────────
info "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl ufw
log "System packages updated"

# ── Install Node.js 20 ───────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node --version | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  info "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>/dev/null
  apt-get install -y -qq nodejs
  log "Node.js $(node --version) installed"
fi

# ── Install `serve` — lightweight static file server ─────────
# `serve` is a production-grade static server from Vercel.
# The ALB handles all routing; this VM only serves static files.
if ! command -v serve &>/dev/null; then
  info "Installing serve (static file server)..."
  npm install -g serve --quiet
  log "serve $(serve --version 2>/dev/null || echo 'installed')"
fi

# ── Build the React application ───────────────────────────────
info "Building React frontend..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_SRC="${SCRIPT_DIR}/../frontend"
BUILD_TMP="/tmp/careconnect-frontend-build"

# Copy frontend source to a temp build dir
cp -r "${FRONTEND_SRC}" "${BUILD_TMP}"
cd "${BUILD_TMP}"

# Install all dependencies (including devDeps needed for build)
npm install --quiet

# Build with VITE_API_URL empty — the ALB routes /api/* to the API VM,
# so relative paths work correctly from the browser's perspective.
# Splunk RUM vars are baked into the bundle at build time.
VITE_API_URL="" \
VITE_SPLUNK_RUM_TOKEN="${SPLUNK_RUM_TOKEN}" \
VITE_SPLUNK_REALM="${SPLUNK_REALM}" \
VITE_APP_ENV="${APP_ENV}" \
  npm run build

log "React build complete"

# ── Deploy built files ────────────────────────────────────────
info "Deploying to web root..."
mkdir -p "${WEB_ROOT}"
rsync -a --delete "${BUILD_TMP}/dist/" "${WEB_ROOT}/"

# `serve` runs as root from systemd; set ownership to root (it reads, not writes)
chmod -R 755 "${WEB_ROOT}"
log "Files deployed to ${WEB_ROOT}"

# Clean up build dir
rm -rf "${BUILD_TMP}"

# ── Create systemd service for `serve` ───────────────────────
info "Creating careconnect-frontend systemd service..."

cat > /etc/systemd/system/careconnect-frontend.service <<EOF
[Unit]
Description=CareConnect Frontend (serve)
After=network.target
Wants=network.target

[Service]
Type=simple
ExecStart=$(which serve) -s ${WEB_ROOT} -l ${SERVE_PORT} --no-clipboard
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=careconnect-frontend

# Harden: no write access needed
ReadOnlyPaths=${WEB_ROOT}
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable careconnect-frontend
systemctl restart careconnect-frontend
sleep 2

if systemctl is-active --quiet careconnect-frontend; then
  log "careconnect-frontend service running on port ${SERVE_PORT}"
else
  err "careconnect-frontend service failed to start — check: journalctl -u careconnect-frontend -n 50"
fi

# ── Firewall (UFW) ─────────────────────────────────────────────
# VM1 only needs to accept HTTP from the ALB.
# The ALB security group / NSG is the actual internet-facing control.
# UFW here is a defence-in-depth measure.
info "Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

ufw allow 22/tcp   comment 'SSH'
ufw allow 80/tcp   comment 'HTTP - ALB health checks and traffic'

ufw --force enable
log "Firewall configured (22, 80 open)"

# ── Smoke test ────────────────────────────────────────────────
info "Running smoke test..."
sleep 1

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${SERVE_PORT}/" || echo "000")
[[ "$HTTP_STATUS" == "200" ]] && \
  log "Frontend serving (HTTP ${HTTP_STATUS})" || \
  warn "Frontend returned HTTP ${HTTP_STATUS} — check: journalctl -u careconnect-frontend"

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ Frontend VM setup complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Static files: ${WEB_ROOT}"
echo "  Server:       serve -s (port ${SERVE_PORT})"
echo "  Status:       systemctl status careconnect-frontend"
echo "  Logs:         journalctl -u careconnect-frontend -f"
echo ""
echo "  ── Next step ───────────────────────────────────────────"
echo "  Point your ALB target group to this VM on port 80"
echo "  and create a path rule: /api/* → API VM:3001"
echo ""
echo "  Test login (via ALB URL):"
echo "    patient@demo.com  / Demo123!"
echo "    provider@demo.com / Demo123!"
echo "    admin@demo.com    / Demo123!"
echo ""
