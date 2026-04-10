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

# Mock VM private IP — loaded from config.env
MOCK_PRIVATE_IP="${MOCK_PRIVATE_IP:-}"

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
  # --delete only valid for directory sources; skip it for single files
  local delete_flag="--delete"
  [[ -f "$src" ]] && delete_flag=""
  # shellcheck disable=SC2086
  rsync -az $delete_flag "$@" \
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
    "sudo env \
      MOCK_HOST='${MOCK_PRIVATE_IP:-}' \
      MOCK_PORT='${MOCK_PORT:-3002}' \
      FRONTEND_HOST='${FRONTEND_HOST}' \
      DB_HOST='${DB_HOST:-}' \
      DB_NAME='${DB_NAME:-careconnect}' \
      DB_USER='${DB_USER:-careconnect}' \
      LAB_RESULT_INTERVAL_MS='${LAB_RESULT_INTERVAL_MS:-900000}' \
      LAB_MIN_AGE_MS='${LAB_MIN_AGE_MS:-900000}' \
    bash ~/careconnect/deploy/04-update.sh api"

  log "API deployed to ${API_PRIVATE_IP}"
}

# ── Deploy Frontend + BFF (VM1) ───────────────────────────
deploy_frontend() {
  info "Deploying frontend + BFF → ${SSH_USER}@${FRONTEND_PRIVATE_IP}"

  info "Syncing frontend source..."
  rsync_to \
    "${ROOT_DIR}/frontend/" \
    "${FRONTEND_PRIVATE_IP}" "~/careconnect/frontend/" \
    --exclude 'node_modules' \
    --exclude 'dist' \
    --exclude '*.log'

  info "Syncing BFF source..."
  rsync_to \
    "${ROOT_DIR}/bff/" \
    "${FRONTEND_PRIVATE_IP}" "~/careconnect/bff/" \
    --exclude 'node_modules' \
    --exclude '.env' \
    --exclude '*.log'

  info "Syncing deploy scripts..."
  rsync_to "${SCRIPT_DIR}/" "${FRONTEND_PRIVATE_IP}" "~/careconnect/deploy/"

  info "Building React bundle on VM1 (takes ~2 min)..."
  # shellcheck disable=SC2086
  $SSH_BASE "${SSH_USER}@${FRONTEND_PRIVATE_IP}" \
    "sudo env \
      API_URL='${API_URL:-}' \
      API_PRIVATE_URL='http://${API_PRIVATE_IP}:3001' \
      SPLUNK_RUM_TOKEN='${SPLUNK_RUM_TOKEN:-}' \
      SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
      APP_ENV='${APP_ENV:-production}' \
    bash ~/careconnect/deploy/04-update.sh frontend"

  info "Reloading BFF on VM1..."
  # shellcheck disable=SC2086
  $SSH_BASE "${SSH_USER}@${FRONTEND_PRIVATE_IP}" \
    "sudo env \
      API_PRIVATE_URL='http://${API_PRIVATE_IP}:3001' \
      FRONTEND_HOST='${FRONTEND_HOST}' \
      BFF_PORT='${BFF_PORT:-3003}' \
      SPLUNK_ACCESS_TOKEN='${SPLUNK_ACCESS_TOKEN:-}' \
      SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
    bash ~/careconnect/deploy/04-update.sh bff"

  log "Frontend + BFF deployed to ${FRONTEND_PRIVATE_IP}"
}

# ── Deploy BFF only (VM1) ─────────────────────────────────
deploy_bff() {
  info "Deploying BFF → ${SSH_USER}@${FRONTEND_PRIVATE_IP}"

  rsync_to \
    "${ROOT_DIR}/bff/" \
    "${FRONTEND_PRIVATE_IP}" "~/careconnect/bff/" \
    --exclude 'node_modules' \
    --exclude '.env' \
    --exclude '*.log'

  rsync_to "${SCRIPT_DIR}/" "${FRONTEND_PRIVATE_IP}" "~/careconnect/deploy/"

  # shellcheck disable=SC2086
  $SSH_BASE "${SSH_USER}@${FRONTEND_PRIVATE_IP}" \
    "sudo env \
      API_PRIVATE_URL='http://${API_PRIVATE_IP}:3001' \
      FRONTEND_HOST='${FRONTEND_HOST}' \
      BFF_PORT='${BFF_PORT:-3003}' \
      SPLUNK_ACCESS_TOKEN='${SPLUNK_ACCESS_TOKEN:-}' \
      SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
    bash ~/careconnect/deploy/04-update.sh bff"

  log "BFF deployed to ${FRONTEND_PRIVATE_IP}"
}

# ── Deploy Mock Services (VM4) ────────────────────────────
deploy_mock() {
  [[ -z "${MOCK_PRIVATE_IP:-}" ]] && { echo "Error: MOCK_PRIVATE_IP not set in deploy/config.env"; exit 1; }
  info "Deploying mock services → ${SSH_USER}@${MOCK_PRIVATE_IP}"

  info "Syncing mock service source..."
  # Sync only the files the mock server needs (exclude unrelated source files)
  rsync_to \
    "${ROOT_DIR}/backend/" \
    "${MOCK_PRIVATE_IP}" "~/careconnect/backend/" \
    --exclude 'node_modules' \
    --exclude '.env' \
    --exclude 'src/db' \
    --exclude 'src/routes' \
    --exclude 'src/middleware' \
    --exclude 'src/tracing.js' \
    --exclude 'src/index.js'

  info "Syncing deploy scripts..."
  rsync_to "${SCRIPT_DIR}/" "${MOCK_PRIVATE_IP}" "~/careconnect/deploy/"

  info "Restarting mock service on VM4..."
  # shellcheck disable=SC2086
  $SSH_BASE "${SSH_USER}@${MOCK_PRIVATE_IP}" \
    "sudo bash ~/careconnect/deploy/04-update.sh mock"

  log "Mock services deployed to ${MOCK_PRIVATE_IP}"
}

# ── Entrypoint ─────────────────────────────────────────────
case "${1:-}" in
  api)
    deploy_api
    ;;
  frontend)
    deploy_frontend
    ;;
  bff)
    deploy_bff
    ;;
  mock)
    deploy_mock
    ;;
  all)
    deploy_api
    deploy_frontend
    deploy_mock
    ;;
  *)
    echo ""
    echo "  Usage: bash deploy/deploy.sh [api|frontend|bff|mock|all]"
    echo ""
    echo "  api       — rsync backend → VM2, PM2 zero-downtime reload"
    echo "  frontend  — rsync frontend + bff → VM1, npm build + restart BFF"
    echo "  bff       — rsync bff → VM1, restart careconnect-bff only (no React rebuild)"
    echo "  mock      — rsync mock-services.js → VM4, restart careconnect-mock"
    echo "  all       — deploy api, frontend, and mock in sequence"
    echo ""
    echo "  Reads SSH_USER, SSH_KEY, API_PRIVATE_IP, FRONTEND_PRIVATE_IP,"
    echo "  MOCK_PRIVATE_IP from deploy/config.env"
    echo ""
    exit 1
    ;;
esac
