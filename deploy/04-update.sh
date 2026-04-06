#!/bin/bash
# ============================================================
# CareConnect EHR — Application Update Script
# Run this when you deploy code changes
#
# Usage:
#   On API VM:      sudo bash 04-update.sh api
#   On Frontend VM: sudo bash 04-update.sh frontend
# ============================================================
set -euo pipefail

# ── CONFIGURATION ──────────────────────────────────────────
APP_DIR="/opt/careconnect/api"
APP_USER="careconnect"
WEB_ROOT="/var/www/careconnect"

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

    # Re-seed the database with fresh demo data
    info "Re-seeding database..."
    cd "${APP_DIR}"
    sudo -u "${APP_USER}" node src/db/seed.js && log "Database re-seeded" || err "Seed failed — check logs above"

    # Restart via systemd — matches how 02-setup-api.sh starts the service (pm2-runtime)
    systemctl restart careconnect-api
    sleep 2
    systemctl is-active --quiet careconnect-api && \
      log "API restarted successfully" || \
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
    VITE_API_URL="" \
    VITE_SPLUNK_RUM_TOKEN="${SPLUNK_RUM_TOKEN}" \
    VITE_SPLUNK_REALM="${SPLUNK_REALM}" \
    VITE_APP_ENV="${APP_ENV}" \
      npm run build

    rsync -a --delete "${BUILD_TMP}/dist/" "${WEB_ROOT}/"
    chmod -R 755 "${WEB_ROOT}"
    rm -rf "${BUILD_TMP}"

    # `serve` serves files directly from disk — no reload needed.
    # The ALB will route new requests to the updated files immediately.
    log "Frontend updated — serve picks up new files automatically"
    systemctl is-active --quiet careconnect-frontend && \
      log "careconnect-frontend service is running" || \
      systemctl restart careconnect-frontend
    ;;

  *)
    echo "Usage: sudo bash 04-update.sh [api|frontend]"
    exit 1
    ;;
esac
