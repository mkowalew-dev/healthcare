#!/bin/bash
# ============================================================
# CareConnect EHR — Local Deploy Script
# Syncs code from your local machine to the target VM(s) and
# triggers a zero-downtime update via 04-update.sh on the VM.
#
# Prerequisites:
#   - deploy/config.env exists and is filled in (copy from config.env.example)
#   - SSH key-based access to VM1 and VM2
#
# Usage:
#   bash deploy/deploy.sh api         # deploy backend to VM2
#   bash deploy/deploy.sh frontend    # deploy frontend to VM1
#   bash deploy/deploy.sh all         # deploy both in sequence
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}/.."
CONFIG="${SCRIPT_DIR}/config.env"

# ── Load config ────────────────────────────────────────────
if [[ ! -f "$CONFIG" ]]; then
  echo "Error: deploy/config.env not found."
  echo "       Copy deploy/config.env.example to deploy/config.env and fill it in."
  exit 1
fi
source "$CONFIG"

SSH_USER="${SSH_USER:-cisco}"
SSH_KEY_OPT=$([[ -n "${SSH_KEY:-}" ]] && echo "-i ${SSH_KEY}" || echo "")
SSH_CTL="/tmp/careconnect-ssh-%h"
SSH_COMMON="-o StrictHostKeyChecking=no -o ConnectTimeout=15 -o ControlMaster=auto -o ControlPath=${SSH_CTL} -o ControlPersist=5m ${SSH_KEY_OPT}"
SSH_BASE="ssh -tt ${SSH_COMMON}"
RSYNC_RSH="ssh ${SSH_COMMON}"

# ── Helpers ────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓ $1${NC}"; }
info() { echo -e "${BLUE}[$(date '+%H:%M:%S')] → $1${NC}"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠ $1${NC}"; }
err()  { echo -e "${RED}[$(date '+%H:%M:%S')] ✗ $1${NC}"; exit 1; }

rsync_to() {
  local src="$1" dest_host="$2" dest_path="$3"
  shift 3
  # Ensure destination directory exists before rsyncing
  # shellcheck disable=SC2086
  $SSH_BASE "${SSH_USER}@${dest_host}" "mkdir -p ${dest_path}"
  rsync -az --delete "$@" \
    -e "$RSYNC_RSH" \
    "${src}" "${SSH_USER}@${dest_host}:${dest_path}"
}

# ── Deploy API (VM2) ───────────────────────────────────────
deploy_api() {
  info "Deploying API → ${SSH_USER}@${API_PRIVATE_IP}"

  info "Syncing backend source..."
  rsync_to \
    "${ROOT_DIR}/backend/" \
    "${API_PRIVATE_IP}" "~/careconnect/backend/" \
    --exclude 'node_modules' \
    --exclude '.env' \
    --exclude '*.log'

  info "Syncing deploy scripts..."
  rsync_to "${SCRIPT_DIR}/" "${API_PRIVATE_IP}" "~/careconnect/deploy/"

  info "Running zero-downtime reload on VM2..."
  # shellcheck disable=SC2086
  $SSH_BASE "${SSH_USER}@${API_PRIVATE_IP}" \
    "sudo bash ~/careconnect/deploy/04-update.sh api"

  log "API deployed to ${API_PRIVATE_IP}"
}

# ── Deploy Frontend (VM1) ──────────────────────────────────
deploy_frontend() {
  info "Deploying frontend → ${SSH_USER}@${FRONTEND_PRIVATE_IP}"

  info "Syncing frontend source..."
  rsync_to \
    "${ROOT_DIR}/frontend/" \
    "${FRONTEND_PRIVATE_IP}" "~/careconnect/frontend/" \
    --exclude 'node_modules' \
    --exclude 'dist' \
    --exclude '*.log'

  info "Syncing deploy scripts..."
  rsync_to "${SCRIPT_DIR}/" "${FRONTEND_PRIVATE_IP}" "~/careconnect/deploy/"

  info "Building and deploying on VM1 (takes ~2 min)..."
  # shellcheck disable=SC2086
  $SSH_BASE "${SSH_USER}@${FRONTEND_PRIVATE_IP}" \
    "sudo env \
      FRONTEND_SRC='/home/${SSH_USER}/careconnect/frontend' \
      FRONTEND_HOST='${FRONTEND_HOST}' \
      API_URL='https://${API_HOST}' \
      SPLUNK_RUM_TOKEN='${SPLUNK_RUM_TOKEN:-}' \
      SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
      APP_ENV='${APP_ENV:-production}' \
    bash /home/${SSH_USER}/careconnect/deploy/03-setup-frontend.sh"

  log "Frontend deployed to ${FRONTEND_PRIVATE_IP}"
}

# ── Entrypoint ─────────────────────────────────────────────
case "${1:-}" in
  api)
    deploy_api
    ;;
  frontend)
    deploy_frontend
    ;;
  all)
    deploy_api
    deploy_frontend
    ;;
  *)
    echo ""
    echo "  Usage: bash deploy/deploy.sh [api|frontend|all]"
    echo ""
    echo "  api       — rsync backend → VM2, then PM2 zero-downtime reload"
    echo "  frontend  — rsync frontend → VM1, then npm build + deploy static files"
    echo "  all       — deploy api first, then frontend"
    echo ""
    echo "  Reads SSH_USER, SSH_KEY, API_PRIVATE_IP, FRONTEND_PRIVATE_IP from deploy/config.env"
    echo ""
    exit 1
    ;;
esac
