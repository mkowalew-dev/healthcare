#!/usr/bin/env bash
# ============================================================
# CareConnect EHR — Single-VM Deployment Orchestrator
#
# Deploys all THREE web portals (CareConnect clinical, MyChart
# patient, Haiku mobile) plus their full backend — Postgres, API
# gateway + domain services, Mock external services, BFF, Nginx —
# onto ONE self-contained VM. No ALBs, no multi-region, no Smart
# Care Facility tier. Reuses the exact same 01/02/03/06/04 setup
# scripts as healthcare-deploy.sh, just pointed at 127.0.0.1 for
# every inter-service address since everything is co-located.
#
# PORTALS (Nginx routes by Host header, same as the multi-VM setup):
#   careconnect.pseudo-co.com  →  index.html    (clinical, providers/admins)
#   mychart.pseudo-co.com      →  patient.html  (MyChart, patients)
#   mobile.pseudo-co.com       →  haiku.html    (Haiku, mobile clinicians)
#   All three hostnames resolve to this one VM's IP.
#
# QUICK START:
#   1. cp deploy/config.env.example deploy/config.env   # if not already done
#   2. vi deploy/config.env
#        SINGLE_VM_PUBLIC_IP=<vm-ip>
#        SINGLE_VM_SSH_USER=ubuntu        # optional, falls back to SSH_USER
#        SINGLE_VM_SSH_KEY=~/.ssh/id_rsa  # optional, falls back to SSH_KEY
#        CLINICAL_HOST / PATIENT_HOST / MOBILE_HOST
#        DB_PASSWORD / JWT_SECRET / SPLUNK_* / ANTHROPIC_API_KEY
#   3. bash deploy/single-vm-deploy.sh init all   (~10 min)
#   4. bash deploy/single-vm-deploy.sh status
#
# COMMANDS:
#   init   [db|mock|api|frontend|all]   First-time VM provisioning (idempotent)
#   update [api|frontend|bff|mock|all]  Rsync + rebuild/restart after code changes
#   status                               Health check on the VM
#   logs   [api|frontend|bff|mock]      Tail systemd logs on the VM
#
# PREREQUISITES:
#   - One Ubuntu 22.04 LTS VM, reachable via SSH, t3.medium or larger recommended
#     (it now runs Postgres + 11 PM2 processes + Nginx + BFF + Mock on one box)
#   - SSH key pair (SSH_KEY in config.env, or SINGLE_VM_SSH_KEY to use a
#     separate key from the multi-VM deployment)
#   - rsync installed on this machine
#   - Security group / firewall: expose 22 (SSH) and 80 (HTTP) only —
#     everything else (5432, 3001-3022, 3003) stays on loopback
#   - deploy/config.env filled in (shares the same file as healthcare-deploy.sh)
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
    vi deploy/config.env          # fill in SINGLE_VM_PUBLIC_IP, credentials, tokens
    bash deploy/single-vm-deploy.sh init all

HELP
  exit 1
fi
# shellcheck disable=SC1090
source "$CONFIG"

# ── Single-VM config with defaults ───────────────────────────
SINGLE_VM_PUBLIC_IP="${SINGLE_VM_PUBLIC_IP:-}"
[[ -z "${SINGLE_VM_PUBLIC_IP}" ]] && \
  { echo "Error: SINGLE_VM_PUBLIC_IP not set in config.env" >&2; exit 1; }

CLINICAL_HOST="${CLINICAL_HOST:-${FRONTEND_HOST:-}}"
PATIENT_HOST="${PATIENT_HOST:-}"
MOBILE_HOST="${MOBILE_HOST:-}"
[[ -z "${CLINICAL_HOST}" ]] && \
  { echo "Error: CLINICAL_HOST not set in config.env" >&2; exit 1; }

DB_NAME="${DB_NAME:-careconnect}"
DB_USER="${DB_USER:-careconnect}"
DB_PASSWORD="${DB_PASSWORD:-}"
JWT_SECRET="${JWT_SECRET:-}"
[[ -z "${DB_PASSWORD}" || "${DB_PASSWORD}" == "CHANGE_THIS_STRONG_PASSWORD" ]] && \
  { echo "Error: set a real DB_PASSWORD in config.env" >&2; exit 1; }
[[ -z "${JWT_SECRET}" || "${JWT_SECRET}" == "CHANGE_THIS_JWT_SECRET" ]] && \
  { echo "Error: set a real JWT_SECRET in config.env" >&2; exit 1; }

MOCK_PORT="${MOCK_PORT:-3002}"
API_PORT="${API_PORT:-3001}"
BFF_PORT="${BFF_PORT:-3003}"

# Everything below lives on the SAME box, so every inter-service address
# used by 01/02/03/06-setup-*.sh is loopback — no VPC IPs, no ALBs.
LOOPBACK="127.0.0.1"

# ── SSH / rsync setup — separate key optional, falls back to SSH_USER/SSH_KEY ─
SSH_USER="${SINGLE_VM_SSH_USER:-${SSH_USER:-ubuntu}}"
_single_vm_key="${SINGLE_VM_SSH_KEY:-${SSH_KEY:-}}"
SSH_KEY_OPT=$([[ -n "${_single_vm_key}" ]] && echo "-i ${_single_vm_key}" || echo "")
SSH_CTL="/tmp/careconnect-singlevm-ssh-%h"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=20 \
  -o ControlMaster=auto -o ControlPath=${SSH_CTL} -o ControlPersist=5m \
  ${SSH_KEY_OPT}"
RSYNC_RSH="ssh ${SSH_OPTS}"

# ── Terminal colors (matches healthcare-deploy.sh / pacs-deploy.sh) ──
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

ssh_run() {
  ssh -tt ${SSH_OPTS} "${SSH_USER}@${SINGLE_VM_PUBLIC_IP}" "$@"
}

rsync_to() {
  local src="$1" dest_path="$2"
  shift 2
  ssh -tt ${SSH_OPTS} "${SSH_USER}@${SINGLE_VM_PUBLIC_IP}" "mkdir -p ${dest_path}" 2>/dev/null || true
  local delete_flag="--delete"
  [[ -f "$src" ]] && delete_flag=""
  # shellcheck disable=SC2086
  rsync -az ${delete_flag} "$@" \
    --exclude 'config.env' \
    -e "$RSYNC_RSH" \
    "${src}" "${SSH_USER}@${SINGLE_VM_PUBLIC_IP}:${dest_path}"
}

sync_deploy() {
  rsync_to "${SCRIPT_DIR}/" "~/careconnect/deploy/" \
    --exclude '*.env' --exclude 'config.env'
}

# ════════════════════════════════════════════════════════════
# INIT — First-time single-VM provisioning
# Runs the SAME per-tier scripts healthcare-deploy.sh uses on
# separate VMs, all against this one host with loopback addressing.
# Each step is idempotent — safe to re-run after a failure.
# ════════════════════════════════════════════════════════════

init_db() {
  header "Database  (Postgres 17 on ${SINGLE_VM_PUBLIC_IP})"

  info "Syncing deploy scripts..."
  sync_deploy

  info "Running 01-setup-db.sh  (installs PostgreSQL 17)..."
  ssh_run \
    "sudo env \
      DB_NAME='${DB_NAME}' \
      DB_USER='${DB_USER}' \
      DB_PASSWORD='${DB_PASSWORD}' \
      API_PRIVATE_IPS='${LOOPBACK}' \
    bash ~/careconnect/deploy/01-setup-db.sh"

  log "Database provisioned"
}

init_mock() {
  header "Mock External Services  (Surescripts, Quest, LabCorp, Twilio, SendGrid)"

  info "Syncing backend source (mock-services.js) and deploy scripts..."
  rsync_to "${ROOT_DIR}/backend/" "~/careconnect/backend/" \
    --exclude 'node_modules' --exclude '.env' \
    --exclude 'src/db' --exclude 'src/routes' --exclude 'src/middleware' \
    --exclude 'src/tracing.js' --exclude 'src/mock-tracing.js' --exclude 'src/index.js'
  sync_deploy

  info "Running 06-setup-mock.sh  (installs Node.js, configures mock services)..."
  ssh_run \
    "sudo env \
      API_PRIVATE_IPS='${LOOPBACK}' \
      MOCK_PORT='${MOCK_PORT}' \
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

  log "Mock Services provisioned"
}

init_api() {
  header "API  (Node.js gateway + 11 domain services via PM2)"

  info "Syncing backend source and deploy scripts..."
  rsync_to "${ROOT_DIR}/backend/" "~/careconnect/backend/" \
    --exclude 'node_modules' --exclude '.env' --exclude '*.log'
  sync_deploy

  info "Running 02-setup-api.sh  (installs Node.js, PM2, seeds DB — ~3 min)..."
  ssh_run \
    "sudo env \
      DB_HOST='${LOOPBACK}' \
      DB_NAME='${DB_NAME}' \
      DB_USER='${DB_USER}' \
      DB_PASSWORD='${DB_PASSWORD}' \
      JWT_SECRET='${JWT_SECRET}' \
      SERVICE_TOKEN='${SERVICE_TOKEN:-}' \
      FRONTEND_PRIVATE_IPS='${LOOPBACK}' \
      CLINICAL_HOST='${CLINICAL_HOST}' \
      PATIENT_HOST='${PATIENT_HOST}' \
      MOBILE_HOST='${MOBILE_HOST}' \
      MOCK_HOST='${LOOPBACK}' \
      MOCK_PORT='${MOCK_PORT}' \
      ANTHROPIC_API_KEY='${ANTHROPIC_API_KEY:-}' \
      SPLUNK_ACCESS_TOKEN='${SPLUNK_ACCESS_TOKEN:-}' \
      SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
      APP_ENV='${APP_ENV:-production}' \
      APP_VERSION='${APP_VERSION:-1.0.0}' \
      LAB_RESULT_INTERVAL_MS='${LAB_RESULT_INTERVAL_MS:-900000}' \
      LAB_MIN_AGE_MS='${LAB_MIN_AGE_MS:-900000}' \
    bash ~/careconnect/deploy/02-setup-api.sh"

  log "API provisioned"
}

init_frontend() {
  header "Frontend + BFF  (3-portal React build + Nginx + BFF)"
  info "  Clinical portal: ${CLINICAL_HOST}"
  info "  Patient portal:  ${PATIENT_HOST:-'(not set)'}"
  info "  Mobile portal:   ${MOBILE_HOST:-'(not set)'}"

  info "Syncing frontend, shared packages, BFF, and deploy scripts..."
  rsync_to "${ROOT_DIR}/frontend/" "~/careconnect/frontend/" \
    --exclude 'node_modules' --exclude 'dist' --exclude '*.log'
  rsync_to "${ROOT_DIR}/packages/" "~/careconnect/packages/" \
    --exclude 'node_modules' --exclude '.storybook'
  rsync_to "${ROOT_DIR}/package.json" "~/careconnect/"
  rsync_to "${ROOT_DIR}/bff/" "~/careconnect/bff/" \
    --exclude 'node_modules' --exclude '.env' --exclude '*.log'
  sync_deploy

  info "Running 03-setup-frontend.sh  (React multi-page build + Nginx + BFF — ~3 min)..."
  ssh_run \
    "sudo env \
      CLINICAL_HOST='${CLINICAL_HOST}' \
      PATIENT_HOST='${PATIENT_HOST}' \
      MOBILE_HOST='${MOBILE_HOST}' \
      API_URL='' \
      API_ALB_DNS='' \
      API_PRIVATE_IPS='${LOOPBACK}' \
      API_PORT='${API_PORT}' \
      BFF_PORT='${BFF_PORT}' \
      SPLUNK_RUM_TOKEN='${SPLUNK_RUM_TOKEN:-}' \
      SPLUNK_ACCESS_TOKEN='${SPLUNK_ACCESS_TOKEN:-}' \
      SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
      APP_ENV='${APP_ENV:-production}' \
      APP_VERSION='${APP_VERSION:-1.0.0}' \
    bash ~/careconnect/deploy/03-setup-frontend.sh"

  log "Frontend + BFF provisioned"
}

# ════════════════════════════════════════════════════════════
# UPDATE — Rsync + rebuild/restart after code changes
# Reuses 04-update.sh exactly as healthcare-deploy.sh does.
# ════════════════════════════════════════════════════════════

update_api() {
  header "Update API"
  rsync_to "${ROOT_DIR}/backend/" "~/careconnect/backend/" \
    --exclude 'node_modules' --exclude '.env' --exclude '*.log'
  sync_deploy

  ssh_run \
    "sudo env \
      MOCK_HOST='${LOOPBACK}' \
      MOCK_PORT='${MOCK_PORT}' \
      CLINICAL_HOST='${CLINICAL_HOST}' \
      PATIENT_HOST='${PATIENT_HOST}' \
      MOBILE_HOST='${MOBILE_HOST}' \
      DB_HOST='${LOOPBACK}' \
      DB_NAME='${DB_NAME}' \
      DB_USER='${DB_USER}' \
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

  log "API updated"
}

update_frontend() {
  header "Update Frontend + BFF"
  rsync_to "${ROOT_DIR}/frontend/" "~/careconnect/frontend/" \
    --exclude 'node_modules' --exclude 'dist' --exclude '*.log'
  rsync_to "${ROOT_DIR}/packages/" "~/careconnect/packages/" \
    --exclude 'node_modules' --exclude '.storybook'
  rsync_to "${ROOT_DIR}/package.json" "~/careconnect/"
  rsync_to "${ROOT_DIR}/bff/" "~/careconnect/bff/" \
    --exclude 'node_modules' --exclude '.env' --exclude '*.log'
  sync_deploy

  info "Rebuilding React bundle (~2 min)..."
  ssh_run \
    "sudo env \
      API_URL='' \
      API_ALB_DNS='' \
      API_PRIVATE_IPS='${LOOPBACK}' \
      CLINICAL_HOST='${CLINICAL_HOST}' \
      PATIENT_HOST='${PATIENT_HOST}' \
      MOBILE_HOST='${MOBILE_HOST}' \
      SPLUNK_RUM_TOKEN='${SPLUNK_RUM_TOKEN:-}' \
      SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
      APP_ENV='${APP_ENV:-production}' \
      APP_VERSION='${APP_VERSION:-1.0.0}' \
    bash ~/careconnect/deploy/04-update.sh frontend"

  info "Reloading BFF..."
  ssh_run \
    "sudo env \
      API_ALB_DNS='' \
      API_PRIVATE_IPS='${LOOPBACK}' \
      CLINICAL_HOST='${CLINICAL_HOST}' \
      PATIENT_HOST='${PATIENT_HOST}' \
      MOBILE_HOST='${MOBILE_HOST}' \
      BFF_PORT='${BFF_PORT}' \
      SPLUNK_ACCESS_TOKEN='${SPLUNK_ACCESS_TOKEN:-}' \
      SPLUNK_REALM='${SPLUNK_REALM:-us1}' \
    bash ~/careconnect/deploy/04-update.sh bff"

  log "Frontend + BFF updated"
}

update_mock() {
  header "Update Mock Services"
  rsync_to "${ROOT_DIR}/backend/" "~/careconnect/backend/" \
    --exclude 'node_modules' --exclude '.env' \
    --exclude 'src/db' --exclude 'src/routes' --exclude 'src/middleware' \
    --exclude 'src/tracing.js' --exclude 'src/mock-tracing.js' --exclude 'src/index.js'
  sync_deploy

  ssh_run "sudo bash ~/careconnect/deploy/04-update.sh mock"
  log "Mock Services updated"
}

# ════════════════════════════════════════════════════════════
# STATUS
# ════════════════════════════════════════════════════════════

status_check() {
  header "CareConnect Single-VM Status  (${SINGLE_VM_PUBLIC_IP})"
  echo ""

  local _ok=0 _fail=0

  _check_http() {
    local label="$1" url="$2"
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "$url" 2>/dev/null || echo "ERR")
    if [[ "$code" == "200" ]]; then
      log "  ${label} — HTTP ${code}"
      _ok=$(( _ok + 1 ))
    else
      warn "  ${label} — HTTP ${code}  (${url})"
      _fail=$(( _fail + 1 ))
    fi
  }

  _check_via_ssh() {
    local label="$1" cmd="$2"
    if ssh -o ConnectTimeout=8 -o BatchMode=yes ${SSH_OPTS} \
         "${SSH_USER}@${SINGLE_VM_PUBLIC_IP}" "${cmd}" > /dev/null 2>&1; then
      log "  ${label}"
      _ok=$(( _ok + 1 ))
    else
      warn "  ${label} — unreachable or service down"
      _fail=$(( _fail + 1 ))
    fi
  }

  echo -e "  ${BOLD}Portals (via Nginx :80, by Host header)${NC}"
  _check_http "CareConnect  /ping  (clinical)" "http://${SINGLE_VM_PUBLIC_IP}/ping"
  _check_http "API          /health           " "http://${SINGLE_VM_PUBLIC_IP}/health"
  _check_http "BFF          /bff/health       " "http://${SINGLE_VM_PUBLIC_IP}/bff/health"
  echo ""

  echo -e "  ${BOLD}Services on ${SINGLE_VM_PUBLIC_IP}${NC}"
  _check_via_ssh "Nginx       (systemd)" "systemctl is-active nginx"
  _check_via_ssh "BFF         (systemd)" "systemctl is-active careconnect-bff"
  _check_via_ssh "API gateway :${API_PORT}  /health" "curl -sf http://localhost:${API_PORT}/health > /dev/null"
  _check_via_ssh "Haiku svc   :3022 /health" "curl -sf http://localhost:3022/health > /dev/null"
  _check_via_ssh "PostgreSQL  (systemd)" "systemctl is-active postgresql"
  _check_via_ssh "Mock        :${MOCK_PORT} /health" "curl -sf http://localhost:${MOCK_PORT}/health > /dev/null"
  echo ""

  if [[ $_fail -eq 0 ]]; then
    log "All ${_ok} checks passed"
  else
    warn "${_ok} passed, ${_fail} failed — check: ssh ${SSH_USER}@${SINGLE_VM_PUBLIC_IP} 'journalctl -u <service> -n 50'"
  fi

  echo ""
  echo "  Portals (point DNS for these hosts at ${SINGLE_VM_PUBLIC_IP}, or use curl -H Host: <name>):"
  echo "    Clinical: http://${CLINICAL_HOST}  (or curl -H \"Host: ${CLINICAL_HOST}\" http://${SINGLE_VM_PUBLIC_IP}/)"
  [[ -n "${PATIENT_HOST}" ]] && \
    echo "    Patient:  http://${PATIENT_HOST}   (or curl -H \"Host: ${PATIENT_HOST}\" http://${SINGLE_VM_PUBLIC_IP}/)"
  [[ -n "${MOBILE_HOST}" ]] && \
    echo "    Haiku:    http://${MOBILE_HOST}   (or curl -H \"Host: ${MOBILE_HOST}\" http://${SINGLE_VM_PUBLIC_IP}/)"
  echo ""
  echo "  Demo accounts (password: Demo123!)"
  echo "    patient@careconnect.demo   — MyChart"
  echo "    provider@careconnect.demo  — CareConnect clinical"
  echo "    admin@careconnect.demo     — CareConnect clinical"
  echo ""
}

# ════════════════════════════════════════════════════════════
# LOGS
# ════════════════════════════════════════════════════════════

show_logs() {
  local target="${1:-}"
  case "$target" in
    api)      ssh_run "journalctl -u careconnect-api -f -n 80" ;;
    frontend) ssh_run "journalctl -u nginx -f -n 80" ;;
    bff)      ssh_run "journalctl -u careconnect-bff -f -n 80" ;;
    mock)     ssh_run "journalctl -u careconnect-mock -f -n 80" ;;
    *)        err "Usage: bash deploy/single-vm-deploy.sh logs [api|frontend|bff|mock]" ;;
  esac
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
      mock)     init_mock ;;
      api)      init_api ;;
      frontend) init_frontend ;;
      all)
        info "Full single-VM deployment on ${SINGLE_VM_PUBLIC_IP}: db → mock → api → frontend  (~10 min)"
        echo ""
        init_db
        init_mock
        init_api
        init_frontend
        echo ""
        log "Single VM fully provisioned."
        echo ""
        echo "  Verify:  bash deploy/single-vm-deploy.sh status"
        echo ""
        echo "  Portals (point DNS at ${SINGLE_VM_PUBLIC_IP}, or test with curl -H Host:):"
        echo "    Clinical: http://${CLINICAL_HOST}"
        [[ -n "${PATIENT_HOST}" ]] && echo "    Patient:  http://${PATIENT_HOST}"
        [[ -n "${MOBILE_HOST}"  ]] && echo "    Haiku:    http://${MOBILE_HOST}"
        echo ""
        ;;
      *)
        cat <<'USAGE'

  Usage: bash deploy/single-vm-deploy.sh init [TARGET]

  Targets:
    all       Full setup in order: db → mock → api → frontend  (recommended, ~10 min)
    db        PostgreSQL 17, schema + pg_hba (loopback only)
    mock      Mock external services (Surescripts, Quest, LabCorp, Twilio, SendGrid)
    api       Node.js gateway + 11 domain services via PM2, seeds the database
    frontend  React multi-page build (all 3 portals) + Nginx + BFF

  Each target is idempotent — safe to re-run after a failure.

USAGE
        exit 1
        ;;
    esac
    ;;

  update)
    case "$TARGET" in
      api)      update_api ;;
      frontend) update_frontend ;;
      bff)      update_frontend ;; # frontend build always includes the BFF reload
      mock)     update_mock ;;
      all)
        update_api
        update_frontend
        update_mock
        log "Single VM fully updated"
        ;;
      *)
        cat <<'USAGE'

  Usage: bash deploy/single-vm-deploy.sh update [TARGET]

  Targets:
    all       Rsync + rebuild/restart everything
    api       Rsync backend, restart PM2 processes
    frontend  Rebuild React bundle (all 3 portals), reload Nginx + BFF
    mock      Rsync mock-services.js, restart mock service

USAGE
        exit 1
        ;;
    esac
    ;;

  status)
    status_check
    ;;

  logs)
    show_logs "${TARGET}"
    ;;

  *)
    cat <<'USAGE'

  CareConnect — Single-VM Deployment Orchestrator
  Deploys all 3 web portals (CareConnect clinical, MyChart patient,
  Haiku mobile) + full backend (Postgres, API, Mock, BFF, Nginx) to
  ONE VM. Reuses the same 01/02/03/04/06 setup scripts as
  healthcare-deploy.sh, addressed entirely via loopback.

  QUICK START:
    1. cp deploy/config.env.example deploy/config.env   # if not already done
    2. vi deploy/config.env     # set SINGLE_VM_PUBLIC_IP + credentials
    3. bash deploy/single-vm-deploy.sh init all

  COMMANDS:
    init   [db|mock|api|frontend|all]   First-time VM provisioning (idempotent)
    update [api|frontend|bff|mock|all]  Rsync + rebuild/restart after code changes
    status                               Health check on the VM
    logs   [api|frontend|bff|mock]      Tail systemd logs on the VM

  CONFIG (deploy/config.env — shared with healthcare-deploy.sh):
    SINGLE_VM_PUBLIC_IP    VM IP address (SSH target + portal IP)
    SINGLE_VM_SSH_USER     SSH login user (falls back to SSH_USER)
    SINGLE_VM_SSH_KEY      Path to SSH private key (falls back to SSH_KEY)
    CLINICAL_HOST / PATIENT_HOST / MOBILE_HOST   Portal hostnames (Nginx server_name)
    DB_PASSWORD / JWT_SECRET                     Required secrets
    ANTHROPIC_API_KEY      Optional — enables the AI Assistant
    SPLUNK_ACCESS_TOKEN / SPLUNK_RUM_TOKEN / SPLUNK_REALM   Optional observability

  This VM runs everything on loopback except Nginx :80 (public) and
  SSH :22 — no ALB, no separate DB/API/mock VMs, no Smart Care tier.

  RELATED:
    bash deploy/healthcare-deploy.sh init all   # multi-VM, multi-region deployment
    bash deploy/pacs-deploy.sh init all         # standalone PACS radiology system

USAGE
    exit 1
    ;;

esac
