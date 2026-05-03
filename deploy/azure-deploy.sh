#!/bin/bash
# ============================================================
# CareConnect EHR — Azure Deployment Orchestrator
#
# Single entry point for initial VM provisioning (init) and
# rolling code updates (update) across all Azure VMs.
# Supports multiple web-tier and API-tier VMs fronted by an
# Azure Application Gateway.
#
# QUICK START (fresh deployment):
#   1. cp deploy/config.env.example deploy/config.env
#   2. vi deploy/config.env          # fill in VM IPs, credentials, tokens
#   3. bash deploy/azure-deploy.sh init all
#   4. bash deploy/azure-deploy.sh init otel   # optional: Splunk OTel
#
# COMMANDS:
#   init   [db|api|mock|frontend|otel|all]   First-time VM provisioning
#   update [api|frontend|bff|mock|all]       Rolling code updates
#   status                                    Health check all VMs
#
# PREREQUISITES:
#   - Azure VMs running Ubuntu 22.04 LTS
#   - SSH RSA key configured in config.env (SSH_KEY)
#   - rsync installed locally
#   - deploy/config.env filled in (copy from config.env.example)
#
# IP ADDRESS CONVENTION:
#   *_PUBLIC_IPS   — public Azure IPs for SSH / rsync from this machine
#   *_PRIVATE_IPS  — VNet-internal IPs used by services to talk to each other
#
# MULTI-VM SCALING:
#   Set FRONTEND_PUBLIC_IPS / API_PUBLIC_IPS to comma-separated lists.
#   Single-VM deployments work with one IP per list (or the legacy
#   singular FRONTEND_PUBLIC_IP / API_PUBLIC_IP fallback).
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
    vi deploy/config.env          # fill in Azure VM IPs, credentials, tokens
    bash deploy/azure-deploy.sh init all

HELP
  exit 1
fi
source "$CONFIG"

# ── IP array normalization ───────────────────────────────────
# Support both plural (multi-VM) and singular (single-VM) forms.
# Plural form takes precedence; singular is the backward-compat fallback.
FRONTEND_PUBLIC_IPS="${FRONTEND_PUBLIC_IPS:-${FRONTEND_PUBLIC_IP:-}}"
FRONTEND_PRIVATE_IPS="${FRONTEND_PRIVATE_IPS:-${FRONTEND_PRIVATE_IP:-}}"
API_PUBLIC_IPS="${API_PUBLIC_IPS:-${API_PUBLIC_IP:-}}"
API_PRIVATE_IPS="${API_PRIVATE_IPS:-${API_PRIVATE_IP:-}}"

IFS=',' read -ra FRONTEND_PUBLIC_IP_ARRAY  <<< "${FRONTEND_PUBLIC_IPS}"
IFS=',' read -ra FRONTEND_PRIVATE_IP_ARRAY <<< "${FRONTEND_PRIVATE_IPS}"
IFS=',' read -ra API_PUBLIC_IP_ARRAY       <<< "${API_PUBLIC_IPS}"
IFS=',' read -ra API_PRIVATE_IP_ARRAY      <<< "${API_PRIVATE_IPS}"

[[ -z "${FRONTEND_PUBLIC_IPS:-}" ]] && \
  { echo "Error: FRONTEND_PUBLIC_IPS (or FRONTEND_PUBLIC_IP) not set in config.env" >&2; exit 1; }
[[ -z "${API_PUBLIC_IPS:-}" ]] && \
  { echo "Error: API_PUBLIC_IPS (or API_PUBLIC_IP) not set in config.env" >&2; exit 1; }

# ── SSH / rsync setup ────────────────────────────────────────
SSH_USER="${SSH_USER:-cisco}"
SSH_KEY_OPT=$([[ -n "${SSH_KEY:-}" ]] && echo "-i ${SSH_KEY}" || echo "")
SSH_CTL="/tmp/careconnect-ssh-%h"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=20 \
  -o ControlMaster=auto -o ControlPath=${SSH_CTL} -o ControlPersist=5m \
  ${SSH_KEY_OPT}"
RSYNC_RSH="ssh ${SSH_OPTS}"

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
# is outside the Azure VNet and reaches VMs over their public IPs.

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
# INIT — First-time VM provisioning
# Each function is idempotent: safe to re-run after a failure.
#
# Pattern:
#   1. rsync source to ~/careconnect/ on the VM (via PUBLIC IP)
#   2. ssh "sudo env KEY=private_val... bash ~/careconnect/deploy/XX.sh"
#      - SSH target  = PUBLIC IP
#      - env vars for inter-VM comms = PRIVATE IPs
# ════════════════════════════════════════════════════════════

init_db() {
  header "VM3 — Database  (pub: ${DB_PUBLIC_IP}  priv: ${DB_PRIVATE_IP})"

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
        FRONTEND_PRIVATE_IPS='${FRONTEND_PRIVATE_IPS}' \
        FRONTEND_HOST='${FRONTEND_HOST}' \
        MOCK_HOST='${MOCK_PRIVATE_IP:-}' \
        MOCK_PORT='${MOCK_PORT:-3002}' \
        ANTHROPIC_API_KEY='${ANTHROPIC_API_KEY:-}' \
        SPLUNK_ACCESS_TOKEN='${SPLUNK_ACCESS_TOKEN:-}' \
        SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
        APP_ENV='${APP_ENV:-production}' \
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

    info "Syncing frontend, BFF, and deploy scripts..."
    rsync_to "${ROOT_DIR}/frontend/" "${pub_ip}" "~/careconnect/frontend/" \
      --exclude 'node_modules' --exclude 'dist' --exclude '*.log'
    rsync_to "${ROOT_DIR}/bff/" "${pub_ip}" "~/careconnect/bff/" \
      --exclude 'node_modules' --exclude '.env' --exclude '*.log'
    sync_deploy "${pub_ip}"

    info "Running 03-setup-frontend.sh  (React build + Nginx upstream + BFF — ~3 min)..."
    ssh_run "${pub_ip}" \
      "sudo env \
        FRONTEND_HOST='${FRONTEND_HOST}' \
        API_URL='${API_URL:-}' \
        API_PRIVATE_IPS='${API_PRIVATE_IPS}' \
        BFF_PORT='${BFF_PORT:-3003}' \
        SPLUNK_RUM_TOKEN='${SPLUNK_RUM_TOKEN:-}' \
        SPLUNK_ACCESS_TOKEN='${SPLUNK_ACCESS_TOKEN:-}' \
        SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
        APP_ENV='${APP_ENV:-production}' \
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
        FRONTEND_HOST='${FRONTEND_HOST}' \
        DB_HOST='${DB_HOST:-}' \
        DB_NAME='${DB_NAME:-careconnect}' \
        DB_USER='${DB_USER:-careconnect}' \
        LAB_RESULT_INTERVAL_MS='${LAB_RESULT_INTERVAL_MS:-900000}' \
        LAB_MIN_AGE_MS='${LAB_MIN_AGE_MS:-900000}' \
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
        API_PRIVATE_IPS='${API_PRIVATE_IPS}' \
        SPLUNK_RUM_TOKEN='${SPLUNK_RUM_TOKEN:-}' \
        SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
        APP_ENV='${APP_ENV:-production}' \
      bash ~/careconnect/deploy/04-update.sh frontend"

    info "Reloading BFF..."
    ssh_run "${pub_ip}" \
      "sudo env \
        API_PRIVATE_IPS='${API_PRIVATE_IPS}' \
        FRONTEND_HOST='${FRONTEND_HOST}' \
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
        API_PRIVATE_IPS='${API_PRIVATE_IPS}' \
        FRONTEND_HOST='${FRONTEND_HOST}' \
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
# STATUS — Health check all VMs
#
# Web VMs (VM1s): direct HTTP to public IP (Nginx is public-facing)
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
    code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$url" 2>/dev/null || echo "ERR")
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

  # ── Web tier ──────────────────────────────────────────────
  local idx=0
  for pub_ip in "${FRONTEND_PUBLIC_IP_ARRAY[@]}"; do
    echo -e "  ${BOLD}Web[$((idx+1))]  Frontend + BFF     pub: ${pub_ip}${NC}"
    _check_http "Nginx / React SPA" "http://${pub_ip}/"
    _check_http "Nginx /ping       " "http://${pub_ip}/ping"
    _check_http "BFF   /bff/health " "http://${pub_ip}/bff/health"
    echo ""
    idx=$(( idx + 1 ))
  done

  # ── API tier ──────────────────────────────────────────────
  idx=0
  for pub_ip in "${API_PUBLIC_IP_ARRAY[@]}"; do
    echo -e "  ${BOLD}API[$((idx+1))]  Node.js + PM2      pub: ${pub_ip}${NC}"
    _check_via_ssh "API  /health  (via SSH)" "${pub_ip}" \
      "curl -sf http://localhost:3001/health > /dev/null"
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

  echo ""
  if [[ $_fail -eq 0 ]]; then
    log "All ${_ok} checks passed"
  else
    warn "${_ok} passed, ${_fail} failed — run 'journalctl -u <service> -n 50' on the failing VM"
  fi
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
      all)
        info "Full deployment: DB → Mock → API → Frontend  (~8–12 min per tier node)"
        echo ""
        init_db
        init_mock
        init_api
        init_frontend
        echo ""
        log "All VMs provisioned."
        echo ""
        echo "  Verify:  bash deploy/azure-deploy.sh status"
        echo "  OTel:    bash deploy/azure-deploy.sh init otel   (optional)"
        echo ""
        ;;
      *)
        cat <<'USAGE'

  Usage: bash deploy/azure-deploy.sh init [TARGET]

  Targets:
    all       Full deployment in order: db → mock → api → frontend  (~10 min)
    db        VM3: PostgreSQL 17, configure pg_hba for all API nodes, UFW
    mock      VM4: Mock external services (Surescripts, Quest, LabCorp, Twilio, SendGrid)
    api       VM2s: Node.js 20, PM2, seed database, systemd service (loops over all API nodes)
    frontend  VM1s: React build, Nginx upstream cluster, BFF service (loops over all web nodes)
    otel      All VMs: Splunk OTel Collector  (run after 'all')

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
      all)
        update_api
        update_frontend
        update_mock
        ;;
      *)
        cat <<'USAGE'

  Usage: bash deploy/azure-deploy.sh update [TARGET]

  Targets:
    all       Update api + frontend + mock across all nodes
    api       rsync backend → all API VMs, PM2 zero-downtime reload (sequential)
    frontend  rsync frontend + bff → all web VMs, React rebuild + BFF restart (sequential)
    bff       rsync bff → all web VMs, BFF restart only  (skips React rebuild ~2 min)
    mock      rsync mock-services.js → VM4, service restart

USAGE
        exit 1
        ;;
    esac
    ;;

  status)
    status_check
    ;;

  *)
    cat <<'USAGE'

  CareConnect EHR — Azure Deployment Orchestrator

  QUICK START (first-time deployment):
    1. cp deploy/config.env.example deploy/config.env
    2. vi deploy/config.env           # set Azure VM IPs, credentials, Splunk tokens
    3. bash deploy/azure-deploy.sh init all
    4. bash deploy/azure-deploy.sh init otel   # optional: Splunk OTel Collectors

  COMMANDS:
    init   [db|api|mock|frontend|otel|all]   First-time VM provisioning
    update [api|frontend|bff|mock|all]       Rolling code updates (zero-downtime)
    status                                    Health check all VMs

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
    bash deploy/azure-deploy.sh init all          # fresh environment
    bash deploy/azure-deploy.sh update api        # push backend changes to all API nodes
    bash deploy/azure-deploy.sh update frontend   # push UI changes to all web nodes
    bash deploy/azure-deploy.sh update bff        # push BFF changes only (no React rebuild)
    bash deploy/azure-deploy.sh status            # verify all healthy

  RECOVERY (re-run a failed step):
    bash deploy/azure-deploy.sh init api          # idempotent, safe to retry

USAGE
    exit 1
    ;;

esac
