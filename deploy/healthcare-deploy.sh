#!/bin/bash
# ============================================================
# CareConnect EHR — AWS Deployment Orchestrator
#
# Single entry point for initial EC2 provisioning (init) and
# rolling code updates (update) across all AWS VMs.
# Supports multiple web-tier and API-tier VMs fronted by an
# AWS Application Load Balancer.
#
# PORTALS:
#   careconnect.pseudo-co.com  →  CareConnect clinical workspace
#   mychart.pseudo-co.com      →  MyChart patient portal
#   Both subdomains route to the same VM1 (Nginx serves a different
#   React bundle per Host header).
#
# QUICK START (fresh deployment):
#   1. cp deploy/config.env.example deploy/config.env
#   2. vi deploy/config.env          # fill in EC2 IPs, credentials, tokens
#   3. bash deploy/healthcare-deploy.sh init all
#   4. bash deploy/healthcare-deploy.sh init otel   # optional: Splunk OTel
#
# COMMANDS:
#   init   [db|api|mock|frontend|otel|all]   First-time EC2 provisioning
#   update [api|frontend|bff|mock|all]       Rolling code updates
#   status                                    Health check all VMs
#
# PREREQUISITES:
#   - AWS EC2 instances running Ubuntu 22.04 LTS
#   - SSH key pair configured (SSH_KEY in config.env)
#   - rsync installed locally
#   - deploy/config.env filled in (copy from config.env.example)
#   - Security groups configured (see DEPLOYMENT.md)
#
# IP ADDRESS CONVENTION:
#   *_PUBLIC_IPS   — public EC2 IPs for SSH / rsync from this machine
#   *_PRIVATE_IPS  — VPC-internal IPs used by services to talk to each other
#
# MULTI-VM SCALING:
#   Set FRONTEND_PUBLIC_IPS / API_PUBLIC_IPS to comma-separated lists.
#   Single-VM deployments work with one IP per list.
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}/.."
CONFIG="${SCRIPT_DIR}/config.env"

# ── Load config ──────────────────────────────────────────────
if [[ ! -f "$CONFIG" ]]; then
  cat >&2 <<'HELP'

  Error: deploy/config.env not found.

    cp deploy/config.env.example deploy/config.env
    vi deploy/config.env          # fill in AWS EC2 IPs, credentials, tokens
    bash deploy/healthcare-deploy.sh init all

HELP
  exit 1
fi
source "$CONFIG"

# ── Multi-region web tier IP combining ──────────────────────
# Per-region vars (FRONTEND_PUBLIC_IPS_USE2 / _UW1) are combined into the
# flat FRONTEND_PUBLIC_IPS list that the deploy loop iterates.
# All web VMs receive identical config — the same React build, same Nginx,
# same API_ALB_DNS — because the API tier lives in us-east-2 only.
# Falls back to FRONTEND_PUBLIC_IPS if set directly (single-region / legacy).
if [[ -n "${FRONTEND_PUBLIC_IPS_USE2:-}" || -n "${FRONTEND_PUBLIC_IPS_UW1:-}" ]]; then
  _fe_pub="${FRONTEND_PUBLIC_IPS_USE2:-}"
  [[ -n "${FRONTEND_PUBLIC_IPS_UW1:-}" ]] && \
    _fe_pub="${_fe_pub:+${_fe_pub},}${FRONTEND_PUBLIC_IPS_UW1}"
  FRONTEND_PUBLIC_IPS="${_fe_pub}"

  _fe_priv="${FRONTEND_PRIVATE_IPS_USE2:-}"
  [[ -n "${FRONTEND_PRIVATE_IPS_UW1:-}" ]] && \
    _fe_priv="${_fe_priv:+${_fe_priv},}${FRONTEND_PRIVATE_IPS_UW1}"
  FRONTEND_PRIVATE_IPS="${_fe_priv}"
fi

# ── IP array normalization ───────────────────────────────────
# Support both plural (multi-VM) and singular (single-VM) forms.
FRONTEND_PUBLIC_IPS="${FRONTEND_PUBLIC_IPS:-${FRONTEND_PUBLIC_IP:-}}"
FRONTEND_PRIVATE_IPS="${FRONTEND_PRIVATE_IPS:-${FRONTEND_PRIVATE_IP:-}}"
API_PUBLIC_IPS="${API_PUBLIC_IPS:-${API_PUBLIC_IP:-}}"
API_PRIVATE_IPS="${API_PRIVATE_IPS:-${API_PRIVATE_IP:-}}"

IFS=',' read -ra FRONTEND_PUBLIC_IP_ARRAY  <<< "${FRONTEND_PUBLIC_IPS}"
IFS=',' read -ra FRONTEND_PRIVATE_IP_ARRAY <<< "${FRONTEND_PRIVATE_IPS}"
IFS=',' read -ra API_PUBLIC_IP_ARRAY       <<< "${API_PUBLIC_IPS}"
IFS=',' read -ra API_PRIVATE_IP_ARRAY      <<< "${API_PRIVATE_IPS}"

[[ -z "${FRONTEND_PUBLIC_IPS:-}" ]] && \
  { echo "Error: FRONTEND_PUBLIC_IPS_USE2/_UW1 (or FRONTEND_PUBLIC_IPS) not set in config.env" >&2; exit 1; }
[[ -z "${API_PUBLIC_IPS:-}" ]] && \
  { echo "Error: API_PUBLIC_IPS (or API_PUBLIC_IP) not set in config.env" >&2; exit 1; }
[[ -z "${CLINICAL_HOST:-}" ]] && \
  { echo "Warning: CLINICAL_HOST not set — using FRONTEND_HOST fallback" >&2; }

# Derive CLINICAL_HOST from FRONTEND_HOST if not explicitly set (backward compat)
CLINICAL_HOST="${CLINICAL_HOST:-${FRONTEND_HOST:-}}"
PATIENT_HOST="${PATIENT_HOST:-}"
MOBILE_HOST="${MOBILE_HOST:-}"

# Regional ALB DNS names (internet-facing, one per region)
FRONTEND_ALB_DNS_USE2="${FRONTEND_ALB_DNS_USE2:-}"
FRONTEND_ALB_DNS_UW1="${FRONTEND_ALB_DNS_UW1:-}"
# Backward compat: single FRONTEND_ALB_DNS treated as use2 primary
FRONTEND_ALB_DNS="${FRONTEND_ALB_DNS:-${ALB_DNS:-${FRONTEND_ALB_DNS_USE2:-}}}"

# Global Accelerator — static anycast DNS fronting both regional ALBs
GLOBAL_ACCELERATOR_DNS="${GLOBAL_ACCELERATOR_DNS:-}"

# Internal API ALB (us-east-2 only — single API region)
API_ALB_DNS="${API_ALB_DNS:-}"

[[ -z "${API_ALB_DNS}" ]] && \
  warn "API_ALB_DNS not set — API tier will not be behind an internal ALB"
[[ -z "${GLOBAL_ACCELERATOR_DNS}" ]] && \
  warn "GLOBAL_ACCELERATOR_DNS not set — Route 53 records should point to Global Accelerator, not regional ALBs directly"

# ── SSH / rsync setup ────────────────────────────────────────
SSH_USER="${SSH_USER:-ubuntu}"
SSH_KEY_OPT=$([[ -n "${SSH_KEY:-}" ]] && echo "-i ${SSH_KEY}" || echo "")
SSH_CTL="/tmp/careconnect-ssh-%h"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=20 \
  -o ControlMaster=auto -o ControlPath=${SSH_CTL} -o ControlPersist=5m \
  ${SSH_KEY_OPT}"
RSYNC_RSH="ssh ${SSH_OPTS}"

# ── Smart Care Facility vars ─────────────────────────────────
SCFP_PUBLIC_IP_1="${SCFP_PUBLIC_IP_1:-}"
SCFP_PUBLIC_IP_2="${SCFP_PUBLIC_IP_2:-}"
SCFP_PORT="${SCFP_PORT:-3030}"
SCFP_ROOM_COUNT="${SCFP_ROOM_COUNT:-24}"
SCFP_EVENT_INTERVAL_MS="${SCFP_EVENT_INTERVAL_MS:-8000}"

VNS_PUBLIC_IP_1="${VNS_PUBLIC_IP_1:-}"
VNS_PUBLIC_IP_2="${VNS_PUBLIC_IP_2:-}"
VNS_PORT="${VNS_PORT:-3031}"
VNS_HOST="${VNS_HOST:-}"
SCFP_VNS_HOST="${SCFP_VNS_HOST:-}"   # AppGW frontend IP for SCFP (Central US internal AppGW)
CPM_VNS_HOST="${CPM_VNS_HOST:-}"      # AppGW frontend IP for CPM  (Central US internal AppGW)
# Optional: private IP of VM2 API gateway — enables EHR note integration from VNS
VNS_API_HOST="${VNS_API_HOST:-$(echo "${API_PRIVATE_IPS}" | cut -d, -f1)}"
VNS_API_PORT="${VNS_API_PORT:-3001}"

CPM_PUBLIC_IP_1="${CPM_PUBLIC_IP_1:-}"
CPM_PUBLIC_IP_2="${CPM_PUBLIC_IP_2:-}"
CPM_PORT="${CPM_PORT:-3032}"
CPM_DEVICE_COUNT="${CPM_DEVICE_COUNT:-20}"
CPM_VITAL_INTERVAL_MS="${CPM_VITAL_INTERVAL_MS:-15000}"

# ── Terminal colors ──────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'
YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'

log()    { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓ $1${NC}"; }
info()   { echo -e "${BLUE}[$(date '+%H:%M:%S')] → $1${NC}"; }
warn()   { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠ $1${NC}"; }
err()    { echo -e "${RED}[$(date '+%H:%M:%S')] ✗ $1${NC}" >&2; exit 1; }
header() {
  echo ""
  echo -e "${BOLD}${BLUE}══════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}${BLUE}  $1${NC}"
  echo -e "${BOLD}${BLUE}══════════════════════════════════════════════════${NC}"
}

# ── Core SSH / rsync helpers ─────────────────────────────────
# All SSH and rsync targets use *_PUBLIC_IPS — the deployment machine
# reaches EC2 instances over their public IPs.

ssh_run() {
  local host="$1"; shift
  # shellcheck disable=SC2086
  ssh -tt ${SSH_OPTS} "${SSH_USER}@${host}" "$@"
}

rsync_to() {
  local src="$1" dest_host="$2" dest_path="$3"
  shift 3
  # shellcheck disable=SC2086
  ssh -tt ${SSH_OPTS} "${SSH_USER}@${dest_host}" "mkdir -p ${dest_path}" 2>/dev/null || true
  local delete_flag="--delete"
  [[ -f "$src" ]] && delete_flag=""
  # shellcheck disable=SC2086
  rsync -az ${delete_flag} "$@" \
    --exclude 'config.env' \
    -e "$RSYNC_RSH" \
    "${src}" "${SSH_USER}@${dest_host}:${dest_path}"
}

# Sync deploy scripts + OTel configs to a VM — never sends config.env
sync_deploy() {
  local host="$1"
  rsync_to "${SCRIPT_DIR}/" "${host}" "~/careconnect/deploy/" \
    --exclude '*.env' --exclude 'config.env'
}

# ════════════════════════════════════════════════════════════
# INIT — First-time EC2 provisioning
# Each function is idempotent: safe to re-run after a failure.
#
# Pattern:
#   1. rsync source to ~/careconnect/ on the EC2 instance (via PUBLIC IP)
#   2. ssh "sudo env KEY=private_val... bash ~/careconnect/deploy/XX.sh"
#      - SSH target  = PUBLIC IP
#      - env vars for inter-VM comms = PRIVATE IPs
# ════════════════════════════════════════════════════════════

init_db() {
  header "VM3 — Database  (pub: ${DB_PUBLIC_IP}  host: ${DB_HOST})"

  info "Syncing deploy scripts..."
  sync_deploy "${DB_PUBLIC_IP}"

  info "Running 01-setup-db.sh on VM3  (installs PostgreSQL 17)..."
  ssh_run "${DB_PUBLIC_IP}" \
    "sudo env \
      DB_NAME='${DB_NAME:-careconnect}' \
      DB_USER='${DB_USER:-careconnect}' \
      DB_PASSWORD='${DB_PASSWORD}' \
      API_PRIVATE_IPS='${API_PRIVATE_IPS}' \
    bash ~/careconnect/deploy/01-setup-db.sh"

  log "Database VM provisioned"
}

init_mock() {
  [[ -z "${MOCK_PUBLIC_IP:-}" ]]   && err "MOCK_PUBLIC_IP not set in config.env"
  [[ -z "${MOCK_PRIVATE_IP:-}" ]]  && err "MOCK_PRIVATE_IP not set in config.env"
  header "VM4 — Mock External Services  (pub: ${MOCK_PUBLIC_IP}  priv: ${MOCK_PRIVATE_IP})"

  info "Syncing backend source (mock-services.js) and deploy scripts..."
  rsync_to "${ROOT_DIR}/backend/" "${MOCK_PUBLIC_IP}" "~/careconnect/backend/" \
    --exclude 'node_modules' --exclude '.env' \
    --exclude 'src/db' --exclude 'src/routes' --exclude 'src/middleware' \
    --exclude 'src/tracing.js' --exclude 'src/mock-tracing.js' --exclude 'src/index.js'
  sync_deploy "${MOCK_PUBLIC_IP}"

  info "Running 06-setup-mock.sh on VM4  (installs Node.js, configures mock services)..."
  ssh_run "${MOCK_PUBLIC_IP}" \
    "sudo env \
      API_PRIVATE_IPS='${API_PRIVATE_IPS}' \
      MOCK_PORT='${MOCK_PORT:-3002}' \
      SURESCRIPTS_LATENCY_MS='${SURESCRIPTS_LATENCY_MS:-180}' \
      SURESCRIPTS_LATENCY_JITTER='${SURESCRIPTS_LATENCY_JITTER:-60}' \
      QUEST_LATENCY_MS='${QUEST_LATENCY_MS:-240}' \
      QUEST_LATENCY_JITTER='${QUEST_LATENCY_JITTER:-80}' \
      LABCORP_LATENCY_MS='${LABCORP_LATENCY_MS:-310}' \
      LABCORP_LATENCY_JITTER='${LABCORP_LATENCY_JITTER:-100}' \
      TWILIO_LATENCY_MS='${TWILIO_LATENCY_MS:-120}' \
      TWILIO_LATENCY_JITTER='${TWILIO_LATENCY_JITTER:-40}' \
      SENDGRID_LATENCY_MS='${SENDGRID_LATENCY_MS:-95}' \
      SENDGRID_LATENCY_JITTER='${SENDGRID_LATENCY_JITTER:-30}' \
      SPLUNK_ACCESS_TOKEN='${SPLUNK_ACCESS_TOKEN:-}' \
      SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
    bash ~/careconnect/deploy/06-setup-mock.sh"

  log "Mock Services VM provisioned"
}

init_api() {
  local idx=0
  for pub_ip in "${API_PUBLIC_IP_ARRAY[@]}"; do
    local priv_ip="${API_PRIVATE_IP_ARRAY[$idx]:-${pub_ip}}"
    header "API node $((idx+1))/${#API_PUBLIC_IP_ARRAY[@]}  (pub: ${pub_ip}  priv: ${priv_ip})"

    info "Syncing backend source and deploy scripts..."
    rsync_to "${ROOT_DIR}/backend/" "${pub_ip}" "~/careconnect/backend/" \
      --exclude 'node_modules' --exclude '.env' --exclude '*.log'
    sync_deploy "${pub_ip}"

    info "Running 02-setup-api.sh  (installs Node.js, PM2, seeds DB — ~3 min)..."
    ssh_run "${pub_ip}" \
      "sudo env \
        DB_HOST='${DB_HOST}' \
        DB_NAME='${DB_NAME:-careconnect}' \
        DB_USER='${DB_USER:-careconnect}' \
        DB_PASSWORD='${DB_PASSWORD}' \
        JWT_SECRET='${JWT_SECRET}' \
        SERVICE_TOKEN='${SERVICE_TOKEN:-}' \
        FRONTEND_PRIVATE_IPS='${FRONTEND_PRIVATE_IPS}' \
        CLINICAL_HOST='${CLINICAL_HOST}' \
        PATIENT_HOST='${PATIENT_HOST:-}' \
        MOBILE_HOST='${MOBILE_HOST:-}' \
        MOCK_HOST='${MOCK_PRIVATE_IP:-}' \
        MOCK_PORT='${MOCK_PORT:-3002}' \
        ANTHROPIC_API_KEY='${ANTHROPIC_API_KEY:-}' \
        SPLUNK_ACCESS_TOKEN='${SPLUNK_ACCESS_TOKEN:-}' \
        SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
        APP_ENV='${APP_ENV:-production}' \
        APP_VERSION='${APP_VERSION:-1.0.0}' \
        LAB_RESULT_INTERVAL_MS='${LAB_RESULT_INTERVAL_MS:-900000}' \
        LAB_MIN_AGE_MS='${LAB_MIN_AGE_MS:-900000}' \
      bash ~/careconnect/deploy/02-setup-api.sh"

    log "API node $((idx+1)) provisioned"
    idx=$(( idx + 1 ))
  done
}

init_frontend() {
  local idx=0
  for pub_ip in "${FRONTEND_PUBLIC_IP_ARRAY[@]}"; do
    local priv_ip="${FRONTEND_PRIVATE_IP_ARRAY[$idx]:-${pub_ip}}"
    header "Web node $((idx+1))/${#FRONTEND_PUBLIC_IP_ARRAY[@]}  (pub: ${pub_ip}  priv: ${priv_ip})"
    info "  Clinical portal: ${CLINICAL_HOST}"
    info "  Patient portal:  ${PATIENT_HOST:-'(not set)'}"

    info "Syncing frontend, BFF, and deploy scripts..."
    rsync_to "${ROOT_DIR}/frontend/" "${pub_ip}" "~/careconnect/frontend/" \
      --exclude 'node_modules' --exclude 'dist' --exclude '*.log'
    rsync_to "${ROOT_DIR}/bff/" "${pub_ip}" "~/careconnect/bff/" \
      --exclude 'node_modules' --exclude '.env' --exclude '*.log'
    sync_deploy "${pub_ip}"

    info "Running 03-setup-frontend.sh  (React multi-page build + Nginx + BFF — ~3 min)..."
    ssh_run "${pub_ip}" \
      "sudo env \
        CLINICAL_HOST='${CLINICAL_HOST}' \
        PATIENT_HOST='${PATIENT_HOST:-}' \
        MOBILE_HOST='${MOBILE_HOST:-}' \
        API_URL='${API_URL:-}' \
        API_ALB_DNS='${API_ALB_DNS:-}' \
        API_PRIVATE_IPS='${API_PRIVATE_IPS}' \
        BFF_PORT='${BFF_PORT:-3003}' \
        SPLUNK_RUM_TOKEN='${SPLUNK_RUM_TOKEN:-}' \
        SPLUNK_ACCESS_TOKEN='${SPLUNK_ACCESS_TOKEN:-}' \
        SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
        APP_ENV='${APP_ENV:-production}' \
        APP_VERSION='${APP_VERSION:-1.0.0}' \
      bash ~/careconnect/deploy/03-setup-frontend.sh"

    log "Web node $((idx+1)) provisioned"
    idx=$(( idx + 1 ))
  done
}

init_otel() {

  _otel_run() {
    local pub_ip="$1" role="$2" label="$3"
    header "OTel — ${label}  (pub: ${pub_ip}  role: ${role})"
    info "Syncing configs and deploy scripts..."
    rsync_to "${SCRIPT_DIR}/configs/" "${pub_ip}" "~/careconnect/deploy/configs/"
    sync_deploy "${pub_ip}"
    info "Running 05-setup-otel-collector.sh [${role}]..."
    ssh_run "${pub_ip}" \
      "sudo env \
        SPLUNK_ACCESS_TOKEN='${SPLUNK_ACCESS_TOKEN:-}' \
        SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
        APP_ENV='${APP_ENV:-production}' \
        APP_VERSION='${APP_VERSION:-1.0.0}' \
        SPLUNK_PLATFORM_HEC_URL='${SPLUNK_PLATFORM_HEC_URL:-}' \
        SPLUNK_PLATFORM_HEC_TOKEN='${SPLUNK_PLATFORM_HEC_TOKEN:-}' \
        DB_USER='${DB_USER:-careconnect}' \
        DB_PASSWORD='${DB_PASSWORD:-}' \
      bash ~/careconnect/deploy/05-setup-otel-collector.sh ${role}"
    log "OTel Collector configured on ${label} (${pub_ip})"
  }

  local total=0
  total=$(( ${#FRONTEND_PUBLIC_IP_ARRAY[@]} + ${#API_PUBLIC_IP_ARRAY[@]} + 1 ))
  [[ -n "${MOCK_PUBLIC_IP:-}" ]] && total=$(( total + 1 ))
  header "Splunk OTel Collectors  (${total} VMs)"

  local idx=0
  for pub_ip in "${FRONTEND_PUBLIC_IP_ARRAY[@]}"; do
    _otel_run "${pub_ip}" "frontend" "Web[$((idx+1))] Frontend"
    idx=$(( idx + 1 ))
  done

  idx=0
  for pub_ip in "${API_PUBLIC_IP_ARRAY[@]}"; do
    _otel_run "${pub_ip}" "api" "API[$((idx+1))] Backend"
    idx=$(( idx + 1 ))
  done

  _otel_run "${DB_PUBLIC_IP}" "db" "DB  PostgreSQL"

  if [[ -n "${MOCK_PUBLIC_IP:-}" ]]; then
    _otel_run "${MOCK_PUBLIC_IP}" "mock" "Mock External Services"
  fi

  for _ip in "${SCFP_PUBLIC_IP_1:-}" "${SCFP_PUBLIC_IP_2:-}"; do
    [[ -n "$_ip" ]] && _otel_run "$_ip" "scfp" "VM6 SCFP Smart Care Facility"
  done
  for _ip in "${VNS_PUBLIC_IP_1:-}" "${VNS_PUBLIC_IP_2:-}"; do
    [[ -n "$_ip" ]] && _otel_run "$_ip" "vns" "VM7 VNS Virtual Nursing Station"
  done
  for _ip in "${CPM_PUBLIC_IP_1:-}" "${CPM_PUBLIC_IP_2:-}"; do
    [[ -n "$_ip" ]] && _otel_run "$_ip" "cpm" "VM8 CPM Continuous Patient Monitoring"
  done
}

# ════════════════════════════════════════════════════════════
# UPDATE — Rolling code updates (zero-downtime)
# Loops over all nodes in each tier sequentially.
# ════════════════════════════════════════════════════════════

update_api() {
  local idx=0
  for pub_ip in "${API_PUBLIC_IP_ARRAY[@]}"; do
    header "Update API node $((idx+1))/${#API_PUBLIC_IP_ARRAY[@]}  (${pub_ip})"

    info "Syncing backend source..."
    rsync_to "${ROOT_DIR}/backend/" "${pub_ip}" "~/careconnect/backend/" \
      --exclude 'node_modules' --exclude '.env' --exclude '*.log'
    sync_deploy "${pub_ip}"

    info "Zero-downtime reload via PM2..."
    ssh_run "${pub_ip}" \
      "sudo env \
        MOCK_HOST='${MOCK_PRIVATE_IP:-}' \
        MOCK_PORT='${MOCK_PORT:-3002}' \
        CLINICAL_HOST='${CLINICAL_HOST}' \
        PATIENT_HOST='${PATIENT_HOST:-}' \
        MOBILE_HOST='${MOBILE_HOST:-}' \
        DB_HOST='${DB_HOST:-}' \
        DB_NAME='${DB_NAME:-careconnect}' \
        DB_USER='${DB_USER:-careconnect}' \
        SERVICE_TOKEN='${SERVICE_TOKEN:-}' \
        APP_VERSION='${APP_VERSION:-1.0.0}' \
        LAB_RESULT_INTERVAL_MS='${LAB_RESULT_INTERVAL_MS:-900000}' \
        LAB_MIN_AGE_MS='${LAB_MIN_AGE_MS:-900000}' \
        MYCHART_FAILURE_ENABLED='${MYCHART_FAILURE_ENABLED:-}' \
        MYCHART_FAILURE_TYPE='${MYCHART_FAILURE_TYPE:-api}' \
        MYCHART_FAILURE_HOUR='${MYCHART_FAILURE_HOUR:-14}' \
        MYCHART_FAILURE_MINUTE='${MYCHART_FAILURE_MINUTE:-0}' \
        MYCHART_FAILURE_DURATION='${MYCHART_FAILURE_DURATION:-15}' \
      bash ~/careconnect/deploy/04-update.sh api"

    log "API node $((idx+1)) updated"
    idx=$(( idx + 1 ))
  done
}

update_frontend() {
  local idx=0
  for pub_ip in "${FRONTEND_PUBLIC_IP_ARRAY[@]}"; do
    header "Update Web node $((idx+1))/${#FRONTEND_PUBLIC_IP_ARRAY[@]}  (${pub_ip})"

    info "Syncing frontend and BFF source..."
    rsync_to "${ROOT_DIR}/frontend/" "${pub_ip}" "~/careconnect/frontend/" \
      --exclude 'node_modules' --exclude 'dist' --exclude '*.log'
    rsync_to "${ROOT_DIR}/bff/" "${pub_ip}" "~/careconnect/bff/" \
      --exclude 'node_modules' --exclude '.env' --exclude '*.log'
    sync_deploy "${pub_ip}"

    info "Rebuilding React bundle (~2 min)..."
    ssh_run "${pub_ip}" \
      "sudo env \
        API_URL='${API_URL:-}' \
        API_ALB_DNS='${API_ALB_DNS:-}' \
        API_PRIVATE_IPS='${API_PRIVATE_IPS}' \
        CLINICAL_HOST='${CLINICAL_HOST}' \
        PATIENT_HOST='${PATIENT_HOST:-}' \
        MOBILE_HOST='${MOBILE_HOST:-}' \
        SPLUNK_RUM_TOKEN='${SPLUNK_RUM_TOKEN:-}' \
        SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
        APP_ENV='${APP_ENV:-production}' \
        APP_VERSION='${APP_VERSION:-1.0.0}' \
      bash ~/careconnect/deploy/04-update.sh frontend"

    info "Reloading BFF..."
    ssh_run "${pub_ip}" \
      "sudo env \
        API_ALB_DNS='${API_ALB_DNS:-}' \
        API_PRIVATE_IPS='${API_PRIVATE_IPS}' \
        CLINICAL_HOST='${CLINICAL_HOST}' \
        PATIENT_HOST='${PATIENT_HOST:-}' \
        MOBILE_HOST='${MOBILE_HOST:-}' \
        BFF_PORT='${BFF_PORT:-3003}' \
        SPLUNK_ACCESS_TOKEN='${SPLUNK_ACCESS_TOKEN:-}' \
        SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
      bash ~/careconnect/deploy/04-update.sh bff"

    log "Web node $((idx+1)) updated"
    idx=$(( idx + 1 ))
  done
}

update_bff() {
  local idx=0
  for pub_ip in "${FRONTEND_PUBLIC_IP_ARRAY[@]}"; do
    header "Update BFF node $((idx+1))/${#FRONTEND_PUBLIC_IP_ARRAY[@]}  (${pub_ip})"

    rsync_to "${ROOT_DIR}/bff/" "${pub_ip}" "~/careconnect/bff/" \
      --exclude 'node_modules' --exclude '.env' --exclude '*.log'
    sync_deploy "${pub_ip}"

    ssh_run "${pub_ip}" \
      "sudo env \
        API_ALB_DNS='${API_ALB_DNS:-}' \
        API_PRIVATE_IPS='${API_PRIVATE_IPS}' \
        CLINICAL_HOST='${CLINICAL_HOST}' \
        PATIENT_HOST='${PATIENT_HOST:-}' \
        MOBILE_HOST='${MOBILE_HOST:-}' \
        BFF_PORT='${BFF_PORT:-3003}' \
        SPLUNK_ACCESS_TOKEN='${SPLUNK_ACCESS_TOKEN:-}' \
        SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
      bash ~/careconnect/deploy/04-update.sh bff"

    log "BFF node $((idx+1)) updated"
    idx=$(( idx + 1 ))
  done
}

update_mock() {
  [[ -z "${MOCK_PUBLIC_IP:-}" ]] && err "MOCK_PUBLIC_IP not set in config.env"
  header "Update Mock Services  (${MOCK_PUBLIC_IP})"

  rsync_to "${ROOT_DIR}/backend/" "${MOCK_PUBLIC_IP}" "~/careconnect/backend/" \
    --exclude 'node_modules' --exclude '.env' \
    --exclude 'src/db' --exclude 'src/routes' --exclude 'src/middleware' \
    --exclude 'src/tracing.js' --exclude 'src/mock-tracing.js' --exclude 'src/index.js'
  sync_deploy "${MOCK_PUBLIC_IP}"
  ssh_run "${MOCK_PUBLIC_IP}" "sudo bash ~/careconnect/deploy/04-update.sh mock"

  log "Mock services updated"
}

# ════════════════════════════════════════════════════════════
# SMART CARE FACILITY — VM6 (SCFP), VM7 (VNS), VM8 (CPM)
#
# All three VMs follow the same init/update pattern:
#   1. rsync source to ~/careconnect/ on the EC2 instance
#   2. ssh "sudo env KEY=val... bash ~/careconnect/deploy/XX-setup-YYY.sh"
# ════════════════════════════════════════════════════════════

init_scfp() {
  [[ -z "${SCFP_PUBLIC_IP_1:-}" ]] && err "SCFP_PUBLIC_IP_1 not set in config.env"
  for _ip in "${SCFP_PUBLIC_IP_1}" "${SCFP_PUBLIC_IP_2:-}"; do
    [[ -z "$_ip" ]] && continue
    header "VM6 — Smart Care Facility Platform  (${_ip})"

    info "Syncing SCFP source and deploy scripts..."
    rsync_to "${ROOT_DIR}/scfp/" "${_ip}" "~/careconnect/scfp/" \
      --exclude 'node_modules'
    sync_deploy "${_ip}"

    info "Running 07-setup-scfp.sh..."
    ssh_run "${_ip}" \
      "sudo env \
        SCFP_PORT='${SCFP_PORT}' \
        SCFP_ROOM_COUNT='${SCFP_ROOM_COUNT}' \
        SCFP_EVENT_INTERVAL_MS='${SCFP_EVENT_INTERVAL_MS}' \
        JWT_SECRET='${JWT_SECRET:-}' \
        SERVICE_TOKEN='${SERVICE_TOKEN:-}' \
        SPLUNK_ACCESS_TOKEN='${SPLUNK_ACCESS_TOKEN:-}' \
        SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
        APP_ENV='${APP_ENV:-production}' \
        APP_VERSION='${APP_VERSION:-1.0.0}' \
      bash ~/careconnect/deploy/07-setup-scfp.sh"
  done
  log "SCFP VMs provisioned"
}

init_vns() {
  [[ -z "${VNS_PUBLIC_IP_1:-}" ]] && err "VNS_PUBLIC_IP_1 not set in config.env"
  for _ip in "${VNS_PUBLIC_IP_1}" "${VNS_PUBLIC_IP_2:-}"; do
    [[ -z "$_ip" ]] && continue
    header "VM7 — Virtual Nursing Station  (${_ip})"

    info "Syncing VNS source and deploy scripts..."
    rsync_to "${ROOT_DIR}/vns/" "${_ip}" "~/careconnect/vns/" \
      --exclude 'node_modules'
    sync_deploy "${_ip}"

    info "Running 08-setup-vns.sh..."
    ssh_run "${_ip}" \
      "sudo env \
        VNS_PORT='${VNS_PORT}' \
        VNS_HOST='${VNS_HOST:-}' \
        SCFP_HOST='${SCFP_VNS_HOST:-}' \
        SCFP_PORT='${SCFP_PORT}' \
        CPM_HOST='${CPM_VNS_HOST:-}' \
        CPM_PORT='${CPM_PORT}' \
        API_HOST='${VNS_API_HOST:-}' \
        API_PORT='${VNS_API_PORT:-3001}' \
        SERVICE_TOKEN='${SERVICE_TOKEN:-}' \
        SPLUNK_ACCESS_TOKEN='${SPLUNK_ACCESS_TOKEN:-}' \
        SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
        APP_ENV='${APP_ENV:-production}' \
        APP_VERSION='${APP_VERSION:-1.0.0}' \
      bash ~/careconnect/deploy/08-setup-vns.sh"
  done
  log "VNS VMs provisioned"
}

init_cpm() {
  [[ -z "${CPM_PUBLIC_IP_1:-}" ]] && err "CPM_PUBLIC_IP_1 not set in config.env"
  for _ip in "${CPM_PUBLIC_IP_1}" "${CPM_PUBLIC_IP_2:-}"; do
    [[ -z "$_ip" ]] && continue
    header "VM8 — Continuous Patient Monitoring  (${_ip})"

    info "Syncing CPM source and deploy scripts..."
    rsync_to "${ROOT_DIR}/cpm/" "${_ip}" "~/careconnect/cpm/" \
      --exclude 'node_modules'
    sync_deploy "${_ip}"

    info "Running 09-setup-cpm.sh..."
    ssh_run "${_ip}" \
      "sudo env \
        CPM_PORT='${CPM_PORT}' \
        CPM_DEVICE_COUNT='${CPM_DEVICE_COUNT}' \
        CPM_VITAL_INTERVAL_MS='${CPM_VITAL_INTERVAL_MS}' \
        JWT_SECRET='${JWT_SECRET:-}' \
        SERVICE_TOKEN='${SERVICE_TOKEN:-}' \
        SPLUNK_ACCESS_TOKEN='${SPLUNK_ACCESS_TOKEN:-}' \
        SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
        APP_ENV='${APP_ENV:-production}' \
        APP_VERSION='${APP_VERSION:-1.0.0}' \
      bash ~/careconnect/deploy/09-setup-cpm.sh"
  done
  log "CPM VMs provisioned"
}

update_scfp() {
  [[ -z "${SCFP_PUBLIC_IP_1:-}" ]] && err "SCFP_PUBLIC_IP_1 not set in config.env"
  for _ip in "${SCFP_PUBLIC_IP_1}" "${SCFP_PUBLIC_IP_2:-}"; do
    [[ -z "$_ip" ]] && continue
    header "Update SCFP  (${_ip})"

    rsync_to "${ROOT_DIR}/scfp/" "${_ip}" "~/careconnect/scfp/" \
      --exclude 'node_modules'
    sync_deploy "${_ip}"

    ssh_run "${_ip}" \
      "sudo env \
        SCFP_PORT='${SCFP_PORT}' \
        SCFP_ROOM_COUNT='${SCFP_ROOM_COUNT}' \
        SCFP_EVENT_INTERVAL_MS='${SCFP_EVENT_INTERVAL_MS}' \
        JWT_SECRET='${JWT_SECRET:-}' \
        SERVICE_TOKEN='${SERVICE_TOKEN:-}' \
        SPLUNK_ACCESS_TOKEN='${SPLUNK_ACCESS_TOKEN:-}' \
        SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
        APP_ENV='${APP_ENV:-production}' \
        APP_VERSION='${APP_VERSION:-1.0.0}' \
      bash ~/careconnect/deploy/07-setup-scfp.sh"
  done
  log "SCFP updated"
}

update_vns() {
  [[ -z "${VNS_PUBLIC_IP_1:-}" ]] && err "VNS_PUBLIC_IP_1 not set in config.env"
  for _ip in "${VNS_PUBLIC_IP_1}" "${VNS_PUBLIC_IP_2:-}"; do
    [[ -z "$_ip" ]] && continue
    header "Update VNS  (${_ip})"

    rsync_to "${ROOT_DIR}/vns/" "${_ip}" "~/careconnect/vns/" \
      --exclude 'node_modules'
    sync_deploy "${_ip}"

    ssh_run "${_ip}" \
      "sudo env \
        VNS_PORT='${VNS_PORT}' \
        VNS_HOST='${VNS_HOST:-}' \
        SCFP_HOST='${SCFP_VNS_HOST:-}' \
        SCFP_PORT='${SCFP_PORT}' \
        CPM_HOST='${CPM_VNS_HOST:-}' \
        CPM_PORT='${CPM_PORT}' \
        API_HOST='${VNS_API_HOST:-}' \
        API_PORT='${VNS_API_PORT:-3001}' \
        SERVICE_TOKEN='${SERVICE_TOKEN:-}' \
        SPLUNK_ACCESS_TOKEN='${SPLUNK_ACCESS_TOKEN:-}' \
        SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
        APP_ENV='${APP_ENV:-production}' \
        APP_VERSION='${APP_VERSION:-1.0.0}' \
      bash ~/careconnect/deploy/08-setup-vns.sh"
  done
  log "VNS updated"
}

update_cpm() {
  [[ -z "${CPM_PUBLIC_IP_1:-}" ]] && err "CPM_PUBLIC_IP_1 not set in config.env"
  for _ip in "${CPM_PUBLIC_IP_1}" "${CPM_PUBLIC_IP_2:-}"; do
    [[ -z "$_ip" ]] && continue
    header "Update CPM  (${_ip})"

    rsync_to "${ROOT_DIR}/cpm/" "${_ip}" "~/careconnect/cpm/" \
      --exclude 'node_modules'
    sync_deploy "${_ip}"

    ssh_run "${_ip}" \
      "sudo env \
        CPM_PORT='${CPM_PORT}' \
        CPM_DEVICE_COUNT='${CPM_DEVICE_COUNT}' \
        CPM_VITAL_INTERVAL_MS='${CPM_VITAL_INTERVAL_MS}' \
        JWT_SECRET='${JWT_SECRET:-}' \
        SERVICE_TOKEN='${SERVICE_TOKEN:-}' \
        SPLUNK_ACCESS_TOKEN='${SPLUNK_ACCESS_TOKEN:-}' \
        SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
        APP_ENV='${APP_ENV:-production}' \
        APP_VERSION='${APP_VERSION:-1.0.0}' \
      bash ~/careconnect/deploy/09-setup-cpm.sh"
  done
  log "CPM updated"
}

# ════════════════════════════════════════════════════════════
# TRAFFIC SIM — Cross-region replication traffic simulation
#
# Server: api02 (us-east-2)   — nginx on port 873 serving a large payload
# Client: uw1-web02 (uw1)     — curl loop for 20 min, cron Mon/Wed business hours
# Traffic path: uw1-web02 → api02 across the Transit Gateway (cross-region)
# ════════════════════════════════════════════════════════════

init_traffic_sim() {
  # ── Resolve api02 (server) — second entry in API arrays ──────
  if [[ ${#API_PUBLIC_IP_ARRAY[@]} -lt 2 ]]; then
    err "api02 not found — API_PUBLIC_IPS must have at least 2 comma-separated entries in config.env"
  fi
  local api02_pub="${API_PUBLIC_IP_ARRAY[1]}"
  local api02_priv="${API_PRIVATE_IP_ARRAY[1]}"

  # ── Resolve uw1-web02 (client) — second entry in UW1 list ────
  if [[ -z "${FRONTEND_PUBLIC_IPS_UW1:-}" ]]; then
    err "FRONTEND_PUBLIC_IPS_UW1 not set in config.env"
  fi
  IFS=',' read -ra _UW1_PUB <<< "${FRONTEND_PUBLIC_IPS_UW1}"
  if [[ ${#_UW1_PUB[@]} -lt 2 ]]; then
    err "uw1-web02 not found — FRONTEND_PUBLIC_IPS_UW1 must have at least 2 comma-separated entries"
  fi
  local uw1web02_pub="${_UW1_PUB[1]}"

  local sim_server_host="${TRAFFIC_SIM_SERVER_HOST:-${api02_priv}}"
  local sim_port="${TRAFFIC_SIM_PORT:-873}"

  # ── Server: api02 ─────────────────────────────────────────────
  header "Traffic Sim — Server: api02  (pub: ${api02_pub}  priv: ${api02_priv})"

  info "Syncing traffic-sim scripts to api02..."
  rsync_to "${SCRIPT_DIR}/traffic-sim/" "${api02_pub}" "~/careconnect/deploy/traffic-sim/"

  info "Running server-setup.sh on api02 (generates ${TRAFFIC_SIM_PAYLOAD_SIZE_MB:-512}MB payload)..."
  ssh_run "${api02_pub}" \
    "sudo env \
      TRAFFIC_SIM_PORT='${sim_port}' \
      TRAFFIC_SIM_PAYLOAD_SIZE_MB='${TRAFFIC_SIM_PAYLOAD_SIZE_MB:-512}' \
    bash ~/careconnect/deploy/traffic-sim/server-setup.sh"

  log "Traffic sim server installed on api02 (port ${sim_port})"

  # ── Client: uw1-web02 ─────────────────────────────────────────
  header "Traffic Sim — Client: uw1-web02  (pub: ${uw1web02_pub})"

  info "Syncing traffic-sim scripts to uw1-web02..."
  rsync_to "${SCRIPT_DIR}/traffic-sim/" "${uw1web02_pub}" "~/careconnect/deploy/traffic-sim/"

  info "Running client-setup.sh on uw1-web02..."
  ssh_run "${uw1web02_pub}" \
    "sudo env \
      TRAFFIC_SIM_SERVER_HOST='${sim_server_host}' \
      TRAFFIC_SIM_PORT='${sim_port}' \
      TRAFFIC_SIM_DURATION_SECONDS='${TRAFFIC_SIM_DURATION_SECONDS:-1200}' \
      TRAFFIC_SIM_ENABLED='${TRAFFIC_SIM_ENABLED:-true}' \
      TRAFFIC_SIM_SCHEDULE_DAYS='${TRAFFIC_SIM_SCHEDULE_DAYS:-1,3}' \
      TRAFFIC_SIM_START_HOUR_UTC='${TRAFFIC_SIM_START_HOUR_UTC:-13}' \
      TRAFFIC_SIM_RANDOM_WINDOW_S='${TRAFFIC_SIM_RANDOM_WINDOW_S:-31200}' \
    bash ~/careconnect/deploy/traffic-sim/client-setup.sh"

  log "Traffic sim client installed on uw1-web02"

  echo ""
  echo "  Verify server:"
  echo "    ssh ${SSH_USER}@${api02_pub} 'curl -s -o /dev/null -w \"%{size_download} bytes\\n\" http://${api02_priv}:${sim_port}/replication.bin'"
  echo ""
  echo "  Test client (immediate, no random delay):"
  echo "    ssh ${SSH_USER}@${uw1web02_pub} 'sudo systemctl start replication-traffic.service && journalctl -u replication-traffic -f'"
  echo ""
  echo "  Logs:"
  echo "    Server: ssh ${SSH_USER}@${api02_pub} 'tail -f /var/log/nginx/replication-access.log'"
  echo "    Client: ssh ${SSH_USER}@${uw1web02_pub} 'journalctl -u replication-traffic --since today'"
  echo ""
}

# ════════════════════════════════════════════════════════════
# STATUS — Health check all VMs
#
# Web tier:  HTTPS via ALB hostnames — reflects the real user path and works
#            even when VM1 port 80 is locked to the ALB SG (correct production config).
#            Per-VM liveness is checked via SSH → curl localhost.
# API VMs (VM2s): SSH in → curl localhost  (port 3001 not public)
# DB VM   (VM3):  SSH in → systemctl check (port 5432 never public)
# Mock VM (VM4):  SSH in → curl localhost  (port 3002 not public)
# ════════════════════════════════════════════════════════════

status_check() {
  header "CareConnect Health Status"
  echo ""

  local _ok=0 _fail=0

  _check_http() {
    local label="$1" url="$2"
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "$url" 2>/dev/null)
    if [[ "$code" == "200" ]]; then
      log "  ${label} — HTTP ${code}"
      _ok=$(( _ok + 1 ))
    else
      warn "  ${label} — HTTP ${code}  (${url})"
      _fail=$(( _fail + 1 ))
    fi
  }

  _check_via_ssh() {
    local label="$1" host="$2" cmd="$3"
    # shellcheck disable=SC2086
    if ssh -o ConnectTimeout=8 -o BatchMode=yes ${SSH_OPTS} "${SSH_USER}@${host}" \
        "${cmd}" > /dev/null 2>&1; then
      log "  ${label}"
      _ok=$(( _ok + 1 ))
    else
      warn "  ${label} — unreachable or service down  (ssh ${host})"
      _fail=$(( _fail + 1 ))
    fi
  }

  # ── Web tier — end-to-end via ALB + HTTPS ─────────────────
  # Checks the real user path: Global Accelerator → ALB → VM1 → BFF/API.
  # Direct IP checks fail in production because VM1 SG only allows :80 from ALB.
  echo -e "  ${BOLD}Web  Portals (via ALB → HTTPS)${NC}"
  _check_http "CareConnect  /ping  (clinical)" "https://${CLINICAL_HOST}/ping"
  _check_http "MyChart      /ping  (patient) " "https://${PATIENT_HOST}/ping"
  [[ -n "${MOBILE_HOST:-}" ]] && \
    _check_http "Haiku        /ping  (mobile)  " "https://${MOBILE_HOST}/ping"
  _check_http "API          /health           " "https://${CLINICAL_HOST}/health"
  _check_http "BFF          /bff/health       " "https://${CLINICAL_HOST}/bff/health"
  echo ""

  # ── Web tier — per-VM liveness via SSH ────────────────────
  local idx=0
  for pub_ip in "${FRONTEND_PUBLIC_IP_ARRAY[@]}"; do
    echo -e "  ${BOLD}Web[$((idx+1))]  Nginx + BFF        pub: ${pub_ip}${NC}"
    _check_via_ssh "Nginx    (systemd, via SSH)" "${pub_ip}" \
      "systemctl is-active nginx"
    _check_via_ssh "BFF      (systemd, via SSH)" "${pub_ip}" \
      "systemctl is-active careconnect-bff"
    echo ""
    idx=$(( idx + 1 ))
  done

  # ── API tier ──────────────────────────────────────────────
  idx=0
  for pub_ip in "${API_PUBLIC_IP_ARRAY[@]}"; do
    echo -e "  ${BOLD}API[$((idx+1))]  Node.js + PM2      pub: ${pub_ip}${NC}"
    _check_via_ssh "Gateway  :3001  /health  (via SSH)" "${pub_ip}" \
      "curl -sf http://localhost:3001/health > /dev/null"
    _check_via_ssh "Haiku    :3022  /health  (via SSH)" "${pub_ip}" \
      "curl -sf http://localhost:3022/health > /dev/null"
    echo ""
    idx=$(( idx + 1 ))
  done

  # ── Database ──────────────────────────────────────────────
  echo -e "  ${BOLD}DB    PostgreSQL 17       pub: ${DB_PUBLIC_IP}${NC}"
  _check_via_ssh "PostgreSQL (systemd)" "${DB_PUBLIC_IP}" \
    "systemctl is-active postgresql"

  # ── Mock Services ──────────────────────────────────────────
  if [[ -n "${MOCK_PUBLIC_IP:-}" ]]; then
    echo ""
    echo -e "  ${BOLD}Mock  External Services   pub: ${MOCK_PUBLIC_IP}${NC}"
    _check_via_ssh "Mock /health  (via SSH)" "${MOCK_PUBLIC_IP}" \
      "curl -sf http://localhost:${MOCK_PORT:-3002}/health > /dev/null"
  fi

  for _ip in "${SCFP_PUBLIC_IP_1:-}" "${SCFP_PUBLIC_IP_2:-}"; do
    [[ -z "$_ip" ]] && continue
    echo ""
    echo -e "  ${BOLD}SCFP  Smart Care Facility  pub: ${_ip}${NC}"
    _check_via_ssh "SCFP :${SCFP_PORT}  /health  (via SSH)" "${_ip}" \
      "curl -sf http://localhost:${SCFP_PORT:-3030}/health > /dev/null"
  done

  for _ip in "${VNS_PUBLIC_IP_1:-}" "${VNS_PUBLIC_IP_2:-}"; do
    [[ -z "$_ip" ]] && continue
    echo ""
    echo -e "  ${BOLD}VNS   Virtual Nursing      pub: ${_ip}${NC}"
    _check_via_ssh "VNS  :${VNS_PORT}  /health  (via SSH)" "${_ip}" \
      "curl -sf http://localhost:${VNS_PORT:-3031}/health > /dev/null"
  done

  for _ip in "${CPM_PUBLIC_IP_1:-}" "${CPM_PUBLIC_IP_2:-}"; do
    [[ -z "$_ip" ]] && continue
    echo ""
    echo -e "  ${BOLD}CPM   Patient Monitoring   pub: ${_ip}${NC}"
    _check_via_ssh "CPM  :${CPM_PORT}  /health  (via SSH)" "${_ip}" \
      "curl -sf http://localhost:${CPM_PORT:-3032}/health > /dev/null"
  done

  echo ""
  if [[ $_fail -eq 0 ]]; then
    log "All ${_ok} checks passed"
  else
    warn "${_ok} passed, ${_fail} failed — run 'journalctl -u <service> -n 50' on the failing VM"
  fi
  echo ""
  echo "  Portals (via Global Accelerator → nearest healthy region):"
  echo "    Clinical: https://${CLINICAL_HOST}"
  [[ -n "${PATIENT_HOST:-}" ]] && \
    echo "    Patient:  https://${PATIENT_HOST}"
  [[ -n "${MOBILE_HOST:-}" ]] && \
    echo "    Haiku:    https://${MOBILE_HOST}"
  echo ""
  echo "  Global Accelerator: ${GLOBAL_ACCELERATOR_DNS:-'(not configured)'}"
  echo "  Regional ALBs:"
  [[ -n "${FRONTEND_ALB_DNS_USE2:-}" ]] && \
    echo "    us-east-2: ${FRONTEND_ALB_DNS_USE2}"
  [[ -n "${FRONTEND_ALB_DNS_UW1:-}" ]] && \
    echo "    us-west-1: ${FRONTEND_ALB_DNS_UW1}"
  [[ -z "${FRONTEND_ALB_DNS_USE2:-}" && -z "${FRONTEND_ALB_DNS_UW1:-}" && -n "${FRONTEND_ALB_DNS:-}" ]] && \
    echo "    (single):  ${FRONTEND_ALB_DNS}"
  echo "  API ALB (us-east-2): ${API_ALB_DNS:-'(not configured)'}"
  echo ""
}

# ════════════════════════════════════════════════════════════
# Entrypoint
# ════════════════════════════════════════════════════════════

CMD="${1:-}"
TARGET="${2:-all}"

case "$CMD" in

  init)
    case "$TARGET" in
      db)       init_db ;;
      api)      init_api ;;
      mock)     init_mock ;;
      frontend) init_frontend ;;
      otel)     init_otel ;;
      scfp)     init_scfp ;;
      vns)      init_vns ;;
      cpm)      init_cpm ;;
      all)
        info "Full deployment: DB → Mock → API → Frontend  (~8–12 min per tier node)"
        echo ""
        init_db
        init_mock
        init_api
        init_frontend
        echo ""
        log "Core EHR VMs provisioned."
        echo ""
        echo "  Smart Care Facility (optional — set *_PUBLIC_IP in config.env first):"
        [[ -n "${SCFP_PUBLIC_IP_1:-}" ]] && echo "    bash deploy/healthcare-deploy.sh init scfp"
        [[ -n "${VNS_PUBLIC_IP_1:-}"  ]] && echo "    bash deploy/healthcare-deploy.sh init vns"
        [[ -n "${CPM_PUBLIC_IP_1:-}"  ]] && echo "    bash deploy/healthcare-deploy.sh init cpm"
        echo ""
        echo "  Verify:  bash deploy/healthcare-deploy.sh status"
        echo "  OTel:    bash deploy/healthcare-deploy.sh init otel   (optional)"
        echo ""
        echo "  Portals (via Global Accelerator):"
        echo "    Clinical: https://${CLINICAL_HOST}"
        [[ -n "${PATIENT_HOST:-}" ]] && echo "    Patient:  https://${PATIENT_HOST}"
        [[ -n "${MOBILE_HOST:-}"  ]] && echo "    Haiku:    https://${MOBILE_HOST}"
        echo ""
        echo "  Global Accelerator: ${GLOBAL_ACCELERATOR_DNS:-'(set GLOBAL_ACCELERATOR_DNS in config.env)'}"
        [[ -n "${FRONTEND_ALB_DNS_USE2:-}" ]] && echo "  ALB us-east-2: ${FRONTEND_ALB_DNS_USE2}"
        [[ -n "${FRONTEND_ALB_DNS_UW1:-}" ]]  && echo "  ALB us-west-1: ${FRONTEND_ALB_DNS_UW1}"
        echo ""
        ;;
      *)
        cat <<'USAGE'

  Usage: bash deploy/healthcare-deploy.sh init [TARGET]

  Core EHR targets:
    all       Full deployment in order: db → mock → api → frontend  (~10 min)
    db        VM3: PostgreSQL 17, configure pg_hba for all API nodes
    mock      VM4: Mock external services (Surescripts, Quest, LabCorp, Twilio, SendGrid)
    api       VM2s: Node.js 20, PM2, seed database, systemd service (loops over all API nodes)
    frontend  VM1s: React multi-page build, Nginx dual-portal config, BFF (loops over all web nodes)
    otel      All VMs: Splunk OTel Collector  (run after 'all')

  Smart Care Facility targets (set *_PUBLIC_IP in config.env first):
    scfp      VM6: Smart Care Facility Platform (room monitoring + fall detection, port 3030)
    vns       VM7: Virtual Nursing Station (virtual nursing + remote oversight, port 3031)
    cpm       VM8: Continuous Patient Monitoring (predictive monitoring + NEWS2, port 3032)

  Each target is idempotent — safe to re-run after a partial failure.

USAGE
        exit 1
        ;;
    esac
    ;;

  update)
    case "$TARGET" in
      api)      update_api ;;
      frontend) update_frontend ;;
      bff)      update_bff ;;
      mock)     update_mock ;;
      scfp)     update_scfp ;;
      vns)      update_vns ;;
      cpm)      update_cpm ;;
      all)
        update_api
        update_frontend
        update_mock
        [[ -n "${SCFP_PUBLIC_IP_1:-}" ]] && update_scfp
        [[ -n "${VNS_PUBLIC_IP_1:-}"  ]] && update_vns
        [[ -n "${CPM_PUBLIC_IP_1:-}"  ]] && update_cpm
        ;;
      *)
        cat <<'USAGE'

  Usage: bash deploy/healthcare-deploy.sh update [TARGET]

  Core EHR targets:
    all       Update api + frontend + mock (+ scfp/vns/cpm if IPs set) across all nodes
    api       rsync backend → all API VMs, PM2 zero-downtime reload (sequential)
    frontend  rsync frontend + bff → all web VMs, React rebuild + BFF restart (sequential)
    bff       rsync bff → all web VMs, BFF restart only  (skips React rebuild ~2 min)
    mock      rsync mock-services.js → VM4, service restart

  Smart Care Facility targets:
    scfp      rsync scfp → VM6, service restart
    vns       rsync vns → VM7, service restart
    cpm       rsync cpm → VM8, service restart

USAGE
        exit 1
        ;;
    esac
    ;;

  traffic-sim)
    init_traffic_sim
    ;;

  status)
    status_check
    ;;

  *)
    cat <<'USAGE'

  CareConnect EHR — AWS Deployment Orchestrator

  PORTALS:
    careconnect.pseudo-co.com  →  CareConnect clinical workspace (providers + admins)
    mychart.pseudo-co.com      →  MyChart patient portal (self-service)

  QUICK START (first-time deployment):
    1. cp deploy/config.env.example deploy/config.env
    2. vi deploy/config.env           # set EC2 IPs, credentials, Splunk tokens
    3. bash deploy/healthcare-deploy.sh init all
    4. bash deploy/healthcare-deploy.sh init otel   # optional: Splunk OTel Collectors

  COMMANDS:
    init   [db|api|mock|frontend|otel|scfp|vns|cpm|all]   First-time EC2 provisioning
    update [api|frontend|bff|mock|scfp|vns|cpm|all]       Rolling code updates (zero-downtime)
    traffic-sim                                             Install cross-region traffic simulation
    status                                                  Health check all VMs

  MULTI-VM SCALING:
    Set comma-separated IP lists in config.env:
      API_PUBLIC_IPS="1.2.3.20,1.2.3.21"
      API_PRIVATE_IPS="10.0.1.20,10.0.1.21"
      FRONTEND_PUBLIC_IPS="1.2.3.10,1.2.3.11"
      FRONTEND_PRIVATE_IPS="10.0.1.10,10.0.1.11"
    init/update commands loop over all nodes automatically.

  DEPLOYMENT ORDER (manual step-by-step):
    init db  →  init mock  →  init api  →  init frontend

  COMMON WORKFLOWS:
    bash deploy/healthcare-deploy.sh init all          # fresh environment (core EHR VMs)
    bash deploy/healthcare-deploy.sh init scfp         # VM6: Smart Care Facility Platform
    bash deploy/healthcare-deploy.sh init vns          # VM7: Virtual Nursing Station
    bash deploy/healthcare-deploy.sh init cpm          # VM8: Continuous Patient Monitoring
    bash deploy/healthcare-deploy.sh update api        # push backend changes to all API nodes
    bash deploy/healthcare-deploy.sh update frontend   # push UI changes to all web nodes
    bash deploy/healthcare-deploy.sh update bff        # push BFF changes only (no React rebuild)
    bash deploy/healthcare-deploy.sh update scfp       # push SCFP changes to VM6
    bash deploy/healthcare-deploy.sh update vns        # push VNS changes to VM7
    bash deploy/healthcare-deploy.sh update cpm        # push CPM changes to VM8
    bash deploy/healthcare-deploy.sh traffic-sim       # install cross-region traffic simulation
    bash deploy/healthcare-deploy.sh status            # verify all healthy

  RECOVERY (re-run a failed step):
    bash deploy/healthcare-deploy.sh init api          # idempotent, safe to retry

USAGE
    exit 1
    ;;

esac
