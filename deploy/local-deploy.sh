#!/usr/bin/env bash
# ============================================================
# CareConnect PACS — Deployment Orchestrator
#
# Deploys the PACS radiology system to the PACS VM (VM5) via
# SSH + rsync.  Reads from the same deploy/config.env as
# aws-deploy.sh — one source of truth for all configuration.
#
# PORTALS:
#   http://<PACS_PUBLIC_IP>:<PACS_SERVER_PORT>  →  DICOMweb API
#   http://<PACS_PUBLIC_IP>:<PACS_VIEWER_PORT>  →  Radiology workstation
#
# QUICK START (first-time setup):
#   1. cp deploy/config.env.example deploy/config.env
#   2. vi deploy/config.env          # fill in PACS_PUBLIC_IP, PACS_SSH_USER, PACS_SSH_KEY, PACS_JWT_SECRET
#   3. bash deploy/local-deploy.sh copy-id   # install SSH key on VM5 (one-time)
#   4. bash deploy/local-deploy.sh init all
#
# COMMANDS:
#   init   [server|viewer|samples|all]   First-time VM5 provisioning (idempotent)
#   update [server|viewer|all]           Rsync + restart after code changes
#   start  [server|viewer|all]           Start services via PM2
#   stop   [server|viewer|all]           Stop services
#   status                               Health check + PM2 process list
#   latency set <ms> [jitter_ms]        Simulate WAN degradation (ThousandEyes demo)
#   latency clear                        Remove latency simulation
#   logs   [server|viewer|all]           Tail PM2 logs on VM5
#
# PREREQUISITES:
#   - SSH access to PACS_PUBLIC_IP (SSH_USER + SSH_KEY in config.env)
#   - rsync installed on this machine
#   - deploy/config.env filled in
#   - Node.js 20 and PM2 installed automatically on VM5 by init
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}/.."
CONFIG="${SCRIPT_DIR}/config.env"

PACS_SERVER_SRC="${ROOT_DIR}/pacs/server"
PACS_VIEWER_SRC="${ROOT_DIR}/pacs/viewer"

# ── Load config ──────────────────────────────────────────────
if [[ ! -f "$CONFIG" ]]; then
  cat >&2 <<'HELP'

  Error: deploy/config.env not found.

    cp deploy/config.env.example deploy/config.env
    vi deploy/config.env          # fill in PACS_PUBLIC_IP, PACS_JWT_SECRET
    bash deploy/local-deploy.sh init all

HELP
  exit 1
fi
# shellcheck disable=SC1090
source "$CONFIG"

# ── PACS config with defaults ────────────────────────────────
PACS_PUBLIC_IP="${PACS_PUBLIC_IP:-}"
PACS_HOST="${PACS_HOST:-}"
PACS_HOST="${PACS_HOST// /}"        # strip accidental whitespace from config.env
PACS_SERVER_PORT="${PACS_SERVER_PORT:-3021}"
PACS_VIEWER_PORT="${PACS_VIEWER_PORT:-5174}"
PACS_JWT_SECRET="${PACS_JWT_SECRET:-pacs-demo-secret-change-me}"
PACS_IMAGE_LATENCY_MS="${PACS_IMAGE_LATENCY_MS:-0}"
PACS_IMAGE_LATENCY_JITTER_MS="${PACS_IMAGE_LATENCY_JITTER_MS:-0}"
# Scheduled anomaly (cron) — applied in-memory, no PM2 restart
PACS_ANOMALY_LATENCY_MS="${PACS_ANOMALY_LATENCY_MS:-1500}"
PACS_ANOMALY_JITTER_MS="${PACS_ANOMALY_JITTER_MS:-300}"
PACS_ANOMALY_ENABLE_CRON="${PACS_ANOMALY_ENABLE_CRON:-0 10 * * 1-5}"
PACS_ANOMALY_DISABLE_CRON="${PACS_ANOMALY_DISABLE_CRON:-15 10 * * 1-5}"

[[ -z "${PACS_PUBLIC_IP}" ]] && \
  { echo "Error: PACS_PUBLIC_IP not set in config.env" >&2; exit 1; }

SERVER_URL="http://${PACS_PUBLIC_IP}:${PACS_SERVER_PORT}"
VIEWER_URL="http://${PACS_PUBLIC_IP}:${PACS_VIEWER_PORT}"

# ── SSH / rsync setup — VM5 uses PACS_SSH_* credentials ─────
# PACS_SSH_USER / PACS_SSH_KEY are separate from the EC2 SSH_USER / SSH_KEY
# used by aws-deploy.sh, allowing different key pairs for cloud vs local VMs.
SSH_USER="${PACS_SSH_USER:-${SSH_USER:-ubuntu}}"
REMOTE_BASE="/home/${SSH_USER}/careconnect/pacs"
_pacs_key="${PACS_SSH_KEY:-${SSH_KEY:-}}"
SSH_KEY_OPT=$([[ -n "${_pacs_key}" ]] && echo "-i ${_pacs_key}" || echo "")
SSH_CTL="/tmp/careconnect-pacs-ssh-%h"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=20 \
  -o ControlMaster=auto -o ControlPath=${SSH_CTL} -o ControlPersist=5m \
  ${SSH_KEY_OPT}"
RSYNC_RSH="ssh ${SSH_OPTS}"

# ── Terminal colors (matches aws-deploy.sh) ──────────────────
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

# ── SSH key installation ─────────────────────────────────────
# copy_id: install the PACS_SSH_KEY public key on VM5.
# Requires initial access to VM5 — either password auth or an existing key.
# Prompts for the VM5 password if needed (ssh-copy-id handles the prompt).
copy_id() {
  local key="${_pacs_key:-}"
  [[ -z "$key" ]] && err "PACS_SSH_KEY not set in config.env — set it to the private key you want to install on VM5"

  local pub_key="${key}.pub"

  # AWS .pem files don't ship with a .pub file — derive it on the fly
  if [[ ! -f "$pub_key" ]]; then
    info "No .pub file found for ${key} — deriving public key with ssh-keygen..."
    ssh-keygen -y -f "$key" > "${key}.pub" || \
      err "Could not extract public key from ${key} — confirm it is a valid RSA/ED25519 private key"
    log "Derived ${pub_key}"
  fi

  header "Install SSH public key on VM5  (${PACS_PUBLIC_IP})"
  info "Copying ${pub_key} → ${SSH_USER}@${PACS_PUBLIC_IP}:~/.ssh/authorized_keys"
  echo "  You may be prompted for the VM5 password (one-time)."
  echo ""

  ssh-copy-id -i "$pub_key" "${SSH_USER}@${PACS_PUBLIC_IP}" || \
    err "ssh-copy-id failed — confirm VM5 is reachable and password authentication is enabled"

  log "Public key installed on VM5"
  info "Verifying key-based login..."
  # shellcheck disable=SC2086
  if ssh -o BatchMode=yes -o ConnectTimeout=10 ${SSH_KEY_OPT} \
       "${SSH_USER}@${PACS_PUBLIC_IP}" "echo ok" &>/dev/null; then
    log "Key-based SSH to ${PACS_PUBLIC_IP} works — ready for deploy"
  else
    warn "Key installed but test login failed — check VM5 sshd config (PubkeyAuthentication yes)"
  fi
}

# ── Core SSH helpers ─────────────────────────────────────────
#
# ssh_batch  — non-interactive, no TTY; safe for heredocs and piped scripts.
#              Use for all init/update/env-write operations.
# ssh_run    — allocates a TTY (-tt); use only for interactive sessions
#              (log tailing, manual shells) where terminal control is needed.

ssh_batch() {
  local host="$1"; shift
  # shellcheck disable=SC2086
  ssh -T ${SSH_OPTS} "${SSH_USER}@${host}" "$@"
}

ssh_run() {
  local host="$1"; shift
  # shellcheck disable=SC2086
  ssh -tt ${SSH_OPTS} "${SSH_USER}@${host}" "$@"
}

rsync_to() {
  local src="$1" dest_host="$2" dest_path="$3"
  shift 3
  # shellcheck disable=SC2086
  ssh_batch "${dest_host}" "mkdir -p ${dest_path}" || \
    err "Could not create ${dest_path} on ${dest_host} — check SSH access and permissions"
  # shellcheck disable=SC2086
  rsync -az --delete "$@" \
    -e "$RSYNC_RSH" \
    "${src}" "${SSH_USER}@${dest_host}:${dest_path}"
}

# ── Node.js 20 + PM2 install on VM5 via nvm ──────────────────
# Uses nvm (Node Version Manager) — installs entirely in userspace,
# no sudo required. Works for any Linux user account.
# Subsequent ssh_batch calls prepend ". ~/.nvm/nvm.sh" to pick up the PATH.
NVM_VER="v0.39.7"
NVM_INIT='. "$HOME/.nvm/nvm.sh" 2>/dev/null || true'

remote_ensure_node() {
  info "Ensuring Node.js 20 + PM2 on VM5 (${PACS_PUBLIC_IP}) via nvm..."
  ssh_batch "${PACS_PUBLIC_IP}" bash <<REMOTE
set -e
export NVM_DIR="\$HOME/.nvm"

# Install nvm if missing
if [[ ! -s "\$NVM_DIR/nvm.sh" ]]; then
  echo "  → Installing nvm ${NVM_VER}..."
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VER}/install.sh | bash
fi

. "\$NVM_DIR/nvm.sh"

# Install Node 20 if missing or too old
if ! nvm ls 20 &>/dev/null || [[ "\$(node --version 2>/dev/null | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  echo "  → Installing Node.js 20..."
  nvm install 20
  nvm alias default 20
else
  echo "  ✓ Node.js \$(node --version) already installed"
fi

nvm use default >/dev/null

# Add nvm source to .bashrc so it persists across sessions
if ! grep -q 'NVM_DIR' "\$HOME/.bashrc" 2>/dev/null; then
  echo '' >> "\$HOME/.bashrc"
  echo 'export NVM_DIR="\$HOME/.nvm"' >> "\$HOME/.bashrc"
  echo '[ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"' >> "\$HOME/.bashrc"
fi

# Install PM2 globally (under nvm — no sudo needed)
if ! command -v pm2 &>/dev/null; then
  echo "  → Installing PM2..."
  npm install -g pm2 --quiet
else
  echo "  ✓ PM2 \$(pm2 --version) already installed"
fi

echo "  ✓ Node.js \$(node --version), PM2 \$(pm2 --version)"
REMOTE
  log "Node.js 20 + PM2 ready on VM5"
}

# ── .env builder (written to remote via heredoc over SSH) ────
remote_write_server_env() {
  # Always allow the IP-based viewer URL; add hostname variants when PACS_HOST is set.
  local _cors="${VIEWER_URL}"
  if [[ -n "${PACS_HOST}" ]]; then
    _cors="${_cors},http://${PACS_HOST}:${PACS_VIEWER_PORT},https://${PACS_HOST}:${PACS_VIEWER_PORT}"
  fi

  # Route APM traces through the local OTel collector when Splunk is configured.
  # The collector adds host metrics and log correlation before forwarding to Splunk.
  local _otlp_endpoint="${OTEL_EXPORTER_OTLP_ENDPOINT:-}"
  if [[ -z "$_otlp_endpoint" && -n "${SPLUNK_ACCESS_TOKEN:-}" ]]; then
    _otlp_endpoint="http://localhost:4317"
  fi

  ssh_batch "${PACS_PUBLIC_IP}" "cat > ${REMOTE_BASE}/server/.env" <<EOF
PORT=${PACS_SERVER_PORT}
NODE_ENV=${NODE_ENV:-production}
APP_ENV=${APP_ENV:-production}
APP_VERSION=${APP_VERSION:-1.0.0}
JWT_SECRET=${PACS_JWT_SECRET}
CORS_ORIGIN=${_cors}
STUDIES_DIR=${REMOTE_BASE}/server/studies
PACS_PUBLIC_URL=${SERVER_URL}
OTEL_SERVICE_NAME=careconnect-pacs
IMAGE_LATENCY_MS=${PACS_IMAGE_LATENCY_MS}
IMAGE_LATENCY_JITTER_MS=${PACS_IMAGE_LATENCY_JITTER_MS}
ANOMALY_LATENCY_MS=${PACS_ANOMALY_LATENCY_MS}
ANOMALY_JITTER_MS=${PACS_ANOMALY_JITTER_MS}
SPLUNK_ACCESS_TOKEN=${SPLUNK_ACCESS_TOKEN:-}
SPLUNK_REALM=${SPLUNK_REALM:-us1}
OTEL_EXPORTER_OTLP_ENDPOINT=${_otlp_endpoint}
EOF
  log "Wrote server .env on VM5"
}

remote_write_viewer_env() {
  # Use hostname-based server URL when PACS_HOST is set so VITE_PACS_URL matches
  # what the browser resolves — avoids mixed IP/hostname CORS mismatches.
  local _server_url="${SERVER_URL}"
  [[ -n "${PACS_HOST}" ]] && _server_url="http://${PACS_HOST}:${PACS_SERVER_PORT}"

  ssh_batch "${PACS_PUBLIC_IP}" "cat > ${REMOTE_BASE}/viewer/.env" <<EOF
VITE_PACS_URL=${_server_url}
VITE_SPLUNK_RUM_TOKEN=${SPLUNK_RUM_TOKEN:-}
VITE_SPLUNK_REALM=${SPLUNK_REALM:-us1}
VITE_APP_ENV=${APP_ENV:-production}
VITE_APP_VERSION=${APP_VERSION:-1.0.0}
EOF
  log "Wrote viewer .env on VM5"
}

# ── PM2 helpers (run on remote, nvm sourced first) ───────────
remote_pm2_start_server() {
  ssh_batch "${PACS_PUBLIC_IP}" bash <<EOF
${NVM_INIT}
mkdir -p "\$HOME/logs/careconnect"
if pm2 describe pacs-server &>/dev/null; then
  pm2 restart pacs-server
else
  pm2 start ${REMOTE_BASE}/server/src/index.js \
    --name pacs-server \
    --cwd  ${REMOTE_BASE}/server \
    --output "\$HOME/logs/careconnect/pacs-out.log" \
    --error  "\$HOME/logs/careconnect/pacs-error.log" \
    --time
fi
pm2 save --force >/dev/null
EOF
}

remote_pm2_start_viewer() {
  ssh_batch "${PACS_PUBLIC_IP}" bash <<EOF
${NVM_INIT}
# Always delete + re-create so PM2 reads version from viewer/package.json, not nvm's.
pm2 delete pacs-viewer 2>/dev/null || true
pm2 start ${REMOTE_BASE}/viewer/node_modules/.bin/vite \
  --name pacs-viewer \
  --cwd  ${REMOTE_BASE}/viewer \
  --log  /tmp/pacs-viewer.log \
  --time \
  -- preview
pm2 save --force >/dev/null
EOF
}

# Register PM2 as a systemd service so pacs-server + pacs-viewer survive VM reboots.
# pm2 startup generates a sudo command that must be executed to install the unit file;
# this function captures and runs it, using a TTY when passwordless sudo isn't available.
remote_pm2_enable_startup() {
  info "Configuring PM2 to auto-start on VM5 boot (requires sudo)..."

  # Idempotent: skip if the systemd unit is already enabled.
  if ssh_batch "${PACS_PUBLIC_IP}" \
       "systemctl is-enabled pm2-${SSH_USER} 2>/dev/null | grep -q enabled" 2>/dev/null; then
    log "PM2 systemd service already enabled — skipping"
    return 0
  fi

  # pm2 startup prints the sudo command to run; grab just that line.
  local startup_cmd
  startup_cmd=$(ssh_batch "${PACS_PUBLIC_IP}" \
    "${NVM_INIT}; pm2 startup 2>&1 | grep -o 'sudo env .*'" 2>/dev/null || true)

  if [[ -z "$startup_cmd" ]]; then
    warn "Could not determine PM2 startup command — skipping autostart setup"
    warn "Run manually on VM5:  pm2 startup  then execute the printed sudo command, then  pm2 save"
    return 0
  fi

  if ssh_batch "${PACS_PUBLIC_IP}" "sudo -n true" 2>/dev/null; then
    ssh_batch "${PACS_PUBLIC_IP}" "${NVM_INIT}; $startup_cmd"
  else
    warn "Passwordless sudo not configured — you will be prompted for ${SSH_USER}'s sudo password"
    warn "To avoid this on future runs: echo '${SSH_USER} ALL=(ALL) NOPASSWD: /usr/bin/bash' | sudo tee /etc/sudoers.d/pacs-deploy"
    ssh_run "${PACS_PUBLIC_IP}" "${NVM_INIT}; $startup_cmd"
  fi

  log "PM2 will auto-start pacs-server + pacs-viewer on VM5 reboot"
}

# ════════════════════════════════════════════════════════════
# INIT — First-time VM5 provisioning
# Each function is idempotent: safe to re-run after a failure.
#
# Pattern (mirrors aws-deploy.sh):
#   1. rsync source → VM5 via PACS_PUBLIC_IP
#   2. SSH to install deps, write .env, start PM2
# ════════════════════════════════════════════════════════════

init_server() {
  header "VM5 — PACS Server  (pub: ${PACS_PUBLIC_IP}  port: ${PACS_SERVER_PORT})"

  remote_ensure_node

  info "Syncing pacs/server source to VM5..."
  rsync_to "${PACS_SERVER_SRC}/" "${PACS_PUBLIC_IP}" "${REMOTE_BASE}/server/" \
    --exclude 'node_modules' --exclude '.env' --exclude '*.log' --exclude 'studies/'

  info "Creating studies directory on VM5..."
  ssh_batch "${PACS_PUBLIC_IP}" "mkdir -p ${REMOTE_BASE}/server/studies"

  info "Installing server dependencies on VM5..."
  ssh_batch "${PACS_PUBLIC_IP}" "${NVM_INIT}; cd ${REMOTE_BASE}/server && npm install --omit=dev --quiet"
  log "Server dependencies installed"

  info "Writing server .env on VM5..."
  remote_write_server_env

  info "Starting PACS server via PM2 on VM5..."
  remote_pm2_start_server

  sleep 2
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "${SERVER_URL}/health" 2>/dev/null || echo "ERR")
  if [[ "$code" == "200" ]]; then
    log "PACS server healthy at ${SERVER_URL}"
  else
    warn "Server started — /health returned ${code}. Check: bash deploy/local-deploy.sh logs server"
  fi
}

init_viewer() {
  header "VM5 — PACS Viewer  (pub: ${PACS_PUBLIC_IP}  port: ${PACS_VIEWER_PORT})"

  info "Syncing pacs/viewer source to VM5..."
  rsync_to "${PACS_VIEWER_SRC}/" "${PACS_PUBLIC_IP}" "${REMOTE_BASE}/viewer/" \
    --exclude 'node_modules' --exclude '.env' --exclude 'dist' --exclude '*.log'

  info "Installing viewer dependencies on VM5 (Cornerstone.js — may take a minute)..."
  ssh_batch "${PACS_PUBLIC_IP}" "${NVM_INIT}; cd ${REMOTE_BASE}/viewer && npm install --quiet"
  log "Viewer dependencies installed"

  info "Writing viewer .env on VM5..."
  remote_write_viewer_env

  info "Building viewer production bundle on VM5 (first build ~2 min)..."
  ssh_batch "${PACS_PUBLIC_IP}" "${NVM_INIT}; cd ${REMOTE_BASE}/viewer && npm run build"
  log "Viewer bundle built"

  info "Starting PACS viewer via PM2 on VM5..."
  remote_pm2_start_viewer

  remote_pm2_enable_startup

  sleep 2
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "${VIEWER_URL}" 2>/dev/null || echo "ERR")
  if [[ "$code" == "200" ]]; then
    log "PACS viewer ready at ${VIEWER_URL}"
  else
    warn "Viewer started — check logs if unreachable: bash deploy/local-deploy.sh logs viewer"
  fi

  echo ""
  echo -e "  ${BOLD}PWA install tip:${NC}"
  echo -e "  Open ${VIEWER_URL} in Chrome, then click the install icon (⊕) in the"
  echo -e "  address bar → 'Install CareConnect PACS Viewer' → opens as a"
  echo -e "  frameless desktop app with its own dock icon."
}

init_samples() {
  header "VM5 — Sample DICOM Images"

  info "Syncing download script to VM5..."
  rsync_to "${PACS_SERVER_SRC}/scripts/" "${PACS_PUBLIC_IP}" "${REMOTE_BASE}/server/scripts/"

  info "Downloading sample DICOM images on VM5..."
  ssh_batch "${PACS_PUBLIC_IP}" "bash ${REMOTE_BASE}/server/scripts/download-samples.sh"

  local count
  count=$(ssh_batch "${PACS_PUBLIC_IP}" \
    "find ${REMOTE_BASE}/server/studies -name '*.dcm' 2>/dev/null | wc -l | tr -d ' '" 2>/dev/null || echo "0")

  if [[ "${count:-0}" -gt 0 ]]; then
    log "Downloaded ${count} DICOM file(s) on VM5"
    info "Restarting PACS server to re-index new images..."
    ssh_batch "${PACS_PUBLIC_IP}" \
      "${NVM_INIT}; pm2 describe pacs-server &>/dev/null && pm2 restart pacs-server --update-env || true"
  else
    warn "No DICOM files downloaded — check internet connectivity on VM5 and retry"
    info "Retry: bash deploy/local-deploy.sh init samples"
  fi
}

init_otel() {
  header "VM5 — Splunk OTel Collector (host metrics · logs · APM traces)"

  [[ -z "${SPLUNK_ACCESS_TOKEN:-}" ]] && \
    err "SPLUNK_ACCESS_TOKEN not set in config.env — required for OTel collector"
  [[ -z "${SPLUNK_PLATFORM_HEC_TOKEN:-}" ]] && \
    warn "SPLUNK_PLATFORM_HEC_TOKEN not set — log forwarding to Splunk Platform will be disabled"

  info "Syncing OTel collector files to VM5..."

  # rsync_to does mkdir -p on the destination, making it a directory target — safe
  # for directory sources but not for single files. Sync everything into one staging
  # directory so the setup script finds configs/ and config.env beside itself.
  local staging="/tmp/careconnect-otel-deploy"
  rsync_to "${SCRIPT_DIR}/configs/" "${PACS_PUBLIC_IP}" "${staging}/configs/"

  # Single files: rsync directly (bypassing rsync_to's mkdir -p on the filename)
  ssh_batch "${PACS_PUBLIC_IP}" "mkdir -p ${staging}"
  rsync -az -e "${RSYNC_RSH}" \
    "${SCRIPT_DIR}/05-setup-otel-collector.sh" \
    "${SSH_USER}@${PACS_PUBLIC_IP}:${staging}/"
  rsync -az -e "${RSYNC_RSH}" \
    "${SCRIPT_DIR}/config.env" \
    "${SSH_USER}@${PACS_PUBLIC_IP}:${staging}/" 2>/dev/null || true

  # Use a TTY if sudo requires a password; falls back gracefully if passwordless sudo is configured.
  info "Running OTel collector setup on VM5 (requires sudo)..."
  if ssh_batch "${PACS_PUBLIC_IP}" "sudo -n true" 2>/dev/null; then
    ssh_batch "${PACS_PUBLIC_IP}" "sudo bash ${staging}/05-setup-otel-collector.sh pacs"
  else
    warn "Passwordless sudo not configured — you will be prompted for ${SSH_USER}'s sudo password"
    warn "To avoid this on future runs: echo '${SSH_USER} ALL=(ALL) NOPASSWD: /usr/bin/bash' | sudo tee /etc/sudoers.d/pacs-deploy"
    ssh_run "${PACS_PUBLIC_IP}" "sudo bash ${staging}/05-setup-otel-collector.sh pacs"
  fi

  info "Updating server .env to route APM traces through local collector..."
  remote_write_server_env
  ssh_batch "${PACS_PUBLIC_IP}" \
    "${NVM_INIT}; pm2 describe pacs-server &>/dev/null && pm2 restart pacs-server --update-env || true"

  log "Splunk OTel Collector installed and running on VM5"
  log "PACS server restarted — APM traces → localhost:4317 → Splunk O11y Cloud"
}

# ════════════════════════════════════════════════════════════
# UPDATE — Rsync + restart (mirrors aws-deploy.sh update_*)
# ════════════════════════════════════════════════════════════

update_server() {
  header "Update PACS Server on VM5  (${PACS_PUBLIC_IP})"

  info "Syncing pacs/server source to VM5..."
  rsync_to "${PACS_SERVER_SRC}/" "${PACS_PUBLIC_IP}" "${REMOTE_BASE}/server/" \
    --exclude 'node_modules' --exclude '.env' --exclude '*.log' --exclude 'studies/'

  info "Reinstalling server dependencies on VM5..."
  ssh_batch "${PACS_PUBLIC_IP}" "${NVM_INIT}; cd ${REMOTE_BASE}/server && npm install --omit=dev --quiet"

  info "Rewriting server .env from config.env..."
  remote_write_server_env

  info "Zero-downtime reload via PM2..."
  ssh_batch "${PACS_PUBLIC_IP}" \
    "${NVM_INIT}; pm2 describe pacs-server &>/dev/null && pm2 restart pacs-server --update-env || echo 'pacs-server not in PM2 — run: bash deploy/local-deploy.sh start server'"
  log "PACS server updated"
}

update_viewer() {
  header "Update PACS Viewer on VM5  (${PACS_PUBLIC_IP})"

  info "Syncing pacs/viewer source to VM5..."
  rsync_to "${PACS_VIEWER_SRC}/" "${PACS_PUBLIC_IP}" "${REMOTE_BASE}/viewer/" \
    --exclude 'node_modules' --exclude '.env' --exclude 'dist' --exclude '*.log'

  info "Reinstalling viewer dependencies on VM5..."
  ssh_batch "${PACS_PUBLIC_IP}" "${NVM_INIT}; cd ${REMOTE_BASE}/viewer && npm install --quiet"

  info "Rewriting viewer .env from config.env..."
  remote_write_viewer_env

  info "Rebuilding viewer production bundle on VM5..."
  ssh_batch "${PACS_PUBLIC_IP}" "${NVM_INIT}; cd ${REMOTE_BASE}/viewer && npm run build"
  log "Viewer bundle rebuilt"

  info "Restarting viewer preview server via PM2..."
  remote_pm2_start_viewer
  log "PACS viewer updated"
}

# ════════════════════════════════════════════════════════════
# START / STOP
# ════════════════════════════════════════════════════════════

start_server() {
  info "Starting PACS server on VM5..."
  remote_pm2_start_server
  log "PACS server running — ${SERVER_URL}"
}

start_viewer() {
  info "Starting PACS viewer on VM5..."
  remote_pm2_start_viewer
  log "PACS viewer running — ${VIEWER_URL}"
}

stop_server() {
  info "Stopping PACS server on VM5..."
  ssh_batch "${PACS_PUBLIC_IP}" \
    "${NVM_INIT}; pm2 describe pacs-server &>/dev/null && pm2 stop pacs-server && echo 'stopped' || echo 'pacs-server not found in PM2'"
  log "PACS server stopped"
}

stop_viewer() {
  info "Stopping PACS viewer on VM5..."
  ssh_batch "${PACS_PUBLIC_IP}" \
    "${NVM_INIT}; pm2 describe pacs-viewer &>/dev/null && pm2 stop pacs-viewer && echo 'stopped' || echo 'pacs-viewer not found in PM2'"
  log "PACS viewer stopped"
}

restart_server() {
  info "Restarting PACS server on VM5..."
  ssh_batch "${PACS_PUBLIC_IP}" \
    "${NVM_INIT}; pm2 describe pacs-server &>/dev/null && pm2 restart pacs-server --update-env || echo 'pacs-server not in PM2 — run init server first'"
  log "PACS server restarted"
}

restart_viewer() {
  info "Restarting PACS viewer on VM5..."
  ssh_batch "${PACS_PUBLIC_IP}" \
    "${NVM_INIT}; pm2 describe pacs-viewer &>/dev/null && pm2 restart pacs-viewer || echo 'pacs-viewer not in PM2 — run init viewer first'"
  log "PACS viewer restarted"
}

# ════════════════════════════════════════════════════════════
# STATUS — mirrors aws-deploy.sh status_check pattern
# ════════════════════════════════════════════════════════════

status_check() {
  header "CareConnect PACS — VM5 Status  (${PACS_PUBLIC_IP})"
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

  echo -e "  ${BOLD}PACS Server   ${SERVER_URL}${NC}"
  _check_http "Server /health" "${SERVER_URL}/health"
  _check_http "Server /ping  " "${SERVER_URL}/ping"

  local health_json study_total study_images latency_val
  health_json=$(curl -sf --connect-timeout 3 "${SERVER_URL}/health" 2>/dev/null || echo "{}")
  study_total=$(echo  "$health_json" | grep -o '"total":[0-9]*'          | head -1 | grep -o '[0-9]*' || echo "?")
  study_images=$(echo "$health_json" | grep -o '"withImages":[0-9]*'     | head -1 | grep -o '[0-9]*' || echo "?")
  latency_val=$(echo  "$health_json" | grep -o '"imageLatencyMs":[0-9]*' | head -1 | grep -o '[0-9]*' || echo "0")
  echo -e "     Studies: ${study_total} total, ${study_images} with DICOM images"
  [[ "${latency_val:-0}" != "0" ]] && \
    echo -e "     ${YELLOW}⚠ Latency simulation active: ${latency_val}ms${NC}"
  echo ""

  echo -e "  ${BOLD}PACS Viewer   ${VIEWER_URL}${NC}"
  _check_http "Viewer /      " "${VIEWER_URL}"
  echo ""

  echo -e "  ${BOLD}PM2 Processes on VM5${NC}"
  ssh_batch "${PACS_PUBLIC_IP}" \
    "${NVM_INIT}; pm2 list 2>/dev/null | grep -E 'pacs-(server|viewer)' || echo '  No PACS processes — run: bash deploy/local-deploy.sh start all'" \
    2>/dev/null || warn "  Could not SSH to ${PACS_PUBLIC_IP} to check PM2"
  echo ""

  if [[ $_fail -eq 0 ]]; then
    log "All ${_ok} checks passed"
  else
    warn "${_ok} passed, ${_fail} failed"
    info "Logs:    bash deploy/local-deploy.sh logs server"
    info "Restart: bash deploy/local-deploy.sh start all"
  fi

  echo ""
  echo "  Viewer:  ${VIEWER_URL}"
  echo "  Health:  ${SERVER_URL}/health"
  echo "  Worklist ${SERVER_URL}/api/worklist  (requires Bearer token)"
  echo ""
  echo "  Demo accounts (password: pacs1234)"
  echo "    dr.chen@pacs.hospital    — Radiologist, Diagnostic"
  echo "    dr.patel@pacs.hospital   — Radiologist, Neuro"
  echo "    tech.jones@pacs.hospital — Technologist"
  echo ""
  echo "  ThousandEyes test targets  (PACS_PUBLIC_IP=${PACS_PUBLIC_IP})"
  echo "    HTTP Server:   ${SERVER_URL}/health"
  echo "    HTTP Server:   ${SERVER_URL}/ping"
  echo "    Page Load:     ${VIEWER_URL}"
  echo "    Transaction:   login → worklist → open study → image loads"
  echo ""
}

# ════════════════════════════════════════════════════════════
# LATENCY — ThousandEyes WAN degradation demo
#
# Writes updated IMAGE_LATENCY_MS into config.env locally,
# then SSHes to VM5 to rewrite the server .env and PM2-restart
# the server — same config.env-driven pattern as all other
# update commands.
# ════════════════════════════════════════════════════════════

latency_set() {
  local ms="${1:-}"
  local jitter="${2:-0}"
  [[ -z "$ms" || ! "$ms" =~ ^[0-9]+$ ]] && \
    err "Usage: bash deploy/local-deploy.sh latency set <ms> [jitter_ms]"

  header "Latency Simulation — ${ms}ms (+${jitter}ms jitter)"

  info "Updating PACS_IMAGE_LATENCY_MS in config.env..."
  if grep -q "^PACS_IMAGE_LATENCY_MS=" "$CONFIG"; then
    sed -i '' "s/^PACS_IMAGE_LATENCY_MS=.*/PACS_IMAGE_LATENCY_MS=${ms}/"                   "$CONFIG"
    sed -i '' "s/^PACS_IMAGE_LATENCY_JITTER_MS=.*/PACS_IMAGE_LATENCY_JITTER_MS=${jitter}/" "$CONFIG"
  else
    printf '\nPACS_IMAGE_LATENCY_MS=%s\nPACS_IMAGE_LATENCY_JITTER_MS=%s\n' "$ms" "$jitter" >> "$CONFIG"
  fi
  PACS_IMAGE_LATENCY_MS="$ms"
  PACS_IMAGE_LATENCY_JITTER_MS="$jitter"

  info "Rewriting server .env on VM5 and restarting..."
  remote_write_server_env
  ssh_batch "${PACS_PUBLIC_IP}" "${NVM_INIT}; pm2 restart pacs-server"
  sleep 1
  log "Latency simulation active: every DICOM image retrieval delayed ${ms}ms (+${jitter}ms jitter)"
  echo ""
  echo -e "  ${YELLOW}ThousandEyes demo steps:${NC}"
  echo "    1. Open a transaction test targeting ${VIEWER_URL}"
  echo "    2. Load a study — images load slowly"
  echo "    3. ThousandEyes shows the degradation on ${SERVER_URL}/wado"
  echo "    4. bash deploy/local-deploy.sh latency clear  →  instant recovery"
  echo ""
}

latency_clear() {
  header "Latency Simulation — Clear"

  info "Clearing PACS_IMAGE_LATENCY_MS in config.env..."
  if grep -q "^PACS_IMAGE_LATENCY_MS=" "$CONFIG"; then
    sed -i '' "s/^PACS_IMAGE_LATENCY_MS=.*/PACS_IMAGE_LATENCY_MS=0/"                   "$CONFIG"
    sed -i '' "s/^PACS_IMAGE_LATENCY_JITTER_MS=.*/PACS_IMAGE_LATENCY_JITTER_MS=0/"     "$CONFIG"
  fi
  PACS_IMAGE_LATENCY_MS=0
  PACS_IMAGE_LATENCY_JITTER_MS=0

  info "Rewriting server .env on VM5 and restarting..."
  remote_write_server_env
  ssh_batch "${PACS_PUBLIC_IP}" "${NVM_INIT}; pm2 restart pacs-server"
  sleep 1
  log "Latency simulation cleared — images load at native speed"
}

# ════════════════════════════════════════════════════════════
# ANOMALY CRON — scheduled ThousandEyes demo anomaly
# ════════════════════════════════════════════════════════════

init_cron() {
  header "VM5 — Scheduled ThousandEyes Demo Anomaly (Mon–Fri)"

  info "Syncing anomaly script to VM5..."
  rsync_to "${PACS_SERVER_SRC}/scripts/" "${PACS_PUBLIC_IP}" "${REMOTE_BASE}/server/scripts/"
  ssh_batch "${PACS_PUBLIC_IP}" "chmod +x ${REMOTE_BASE}/server/scripts/pacs-anomaly.sh"

  info "Writing anomaly config to server .env on VM5..."
  remote_write_server_env

  info "Installing cron schedule on VM5..."
  ssh_batch "${PACS_PUBLIC_IP}" bash <<EOF
mkdir -p "\$HOME/logs/careconnect"

SCRIPT="${REMOTE_BASE}/server/scripts/pacs-anomaly.sh"
LOG="\$HOME/logs/careconnect/anomaly.log"

# Remove stale entries then install fresh schedule
{
  crontab -l 2>/dev/null | grep -v 'pacs-anomaly'
  echo "${PACS_ANOMALY_ENABLE_CRON}  \$SCRIPT enable  >> \$LOG 2>&1  # pacs-anomaly"
  echo "${PACS_ANOMALY_DISABLE_CRON} \$SCRIPT disable >> \$LOG 2>&1  # pacs-anomaly"
} | crontab -

echo "  Installed crontab entries:"
crontab -l | grep 'pacs-anomaly'
EOF

  log "Anomaly cron installed on VM5"
  echo ""
  echo "  Anomaly schedule (VM5 system timezone):"
  echo "    Enable:   ${PACS_ANOMALY_ENABLE_CRON}  → ${PACS_ANOMALY_LATENCY_MS}ms + ${PACS_ANOMALY_JITTER_MS}ms jitter"
  echo "    Disable:  ${PACS_ANOMALY_DISABLE_CRON}"
  echo "    Log:      ~/logs/careconnect/anomaly.log on VM5"
  echo ""
  echo "  Trigger manually (no need to wait for schedule):"
  echo "    bash deploy/local-deploy.sh anomaly enable"
  echo "    bash deploy/local-deploy.sh anomaly disable"
}

anomaly_run() {
  local action="${1:-}"
  [[ "$action" == "enable" || "$action" == "disable" ]] || \
    err "Usage: bash deploy/local-deploy.sh anomaly [enable|disable]"
  info "${action} PACS latency anomaly on VM5..."
  ssh_batch "${PACS_PUBLIC_IP}" \
    "bash ${REMOTE_BASE}/server/scripts/pacs-anomaly.sh ${action}"
  log "Anomaly ${action}d"
}

# ════════════════════════════════════════════════════════════
# LOGS — tail PM2 logs on VM5 via SSH
# ════════════════════════════════════════════════════════════

show_logs() {
  local target="${1:-all}"
  case "$target" in
    server) ssh_run "${PACS_PUBLIC_IP}" "pm2 logs pacs-server --lines 80" ;;
    viewer) ssh_run "${PACS_PUBLIC_IP}" "pm2 logs pacs-viewer --lines 80" ;;
    all)    ssh_run "${PACS_PUBLIC_IP}" "pm2 logs --lines 40" ;;
    *)      err "Usage: bash deploy/local-deploy.sh logs [server|viewer|all]" ;;
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
      server)  init_server ;;
      viewer)  init_viewer ;;
      samples) init_samples ;;
      otel)    init_otel ;;
      cron)    init_cron ;;
      all)
        info "Full PACS provisioning on VM5 (${PACS_PUBLIC_IP}): server → viewer → PM2 autostart → DICOM samples  (~5–8 min)"
        echo ""
        init_server
        init_viewer
        init_samples
        echo ""
        log "VM5 fully provisioned."
        echo ""
        echo "  Viewer:  ${VIEWER_URL}"
        echo "  Health:  ${SERVER_URL}/health"
        echo ""
        echo "  Verify:  bash deploy/local-deploy.sh status"
        echo "  OTel:    bash deploy/local-deploy.sh init otel  (optional — requires SPLUNK_ACCESS_TOKEN)"
        echo ""
        ;;
      *)
        cat <<'USAGE'

  Usage: bash deploy/local-deploy.sh init [TARGET]

  Targets:
    all       Full setup: server → viewer → PM2 autostart → DICOM samples  (recommended)
    server    Rsync, npm install, write .env, start DICOMweb server via PM2
    viewer    Rsync, npm install (Cornerstone.js), write .env, start Vite via PM2, enable PM2 boot startup
    samples   Download DICOM images on VM5 and restart server to index them
    otel      Install Splunk OTel Collector on VM5 (host metrics, logs, APM traces)
              Requires: SPLUNK_ACCESS_TOKEN + SPLUNK_PLATFORM_HEC_TOKEN in config.env
    cron      Install the Mon–Fri scheduled latency anomaly cron on VM5

  Each target is idempotent — safe to re-run after a failure.

USAGE
        exit 1
        ;;
    esac
    ;;

  update)
    case "$TARGET" in
      server)  update_server ;;
      viewer)  update_viewer ;;
      all)
        update_server
        update_viewer
        ;;
      *)
        cat <<'USAGE'

  Usage: bash deploy/local-deploy.sh update [TARGET]

  Targets:
    all     Rsync + restart both server and viewer
    server  Rsync, npm install, rewrite .env from config.env, PM2 restart
    viewer  Rsync, npm install, rewrite .env from config.env, PM2 restart

USAGE
        exit 1
        ;;
    esac
    ;;

  start)
    case "$TARGET" in
      server)  start_server ;;
      viewer)  start_viewer ;;
      all)
        start_server
        start_viewer
        log "Both PACS services started"
        echo ""
        echo "  Viewer:  ${VIEWER_URL}"
        echo "  Health:  ${SERVER_URL}/health"
        echo ""
        ;;
      *)
        cat <<'USAGE'

  Usage: bash deploy/local-deploy.sh start [server|viewer|all]

USAGE
        exit 1
        ;;
    esac
    ;;

  stop)
    case "$TARGET" in
      server)  stop_server ;;
      viewer)  stop_viewer ;;
      all)
        stop_server
        stop_viewer
        log "Both PACS services stopped"
        ;;
      *)
        cat <<'USAGE'

  Usage: bash deploy/local-deploy.sh stop [server|viewer|all]

USAGE
        exit 1
        ;;
    esac
    ;;

  restart)
    case "$TARGET" in
      server)  restart_server ;;
      viewer)  restart_viewer ;;
      all)
        restart_server
        restart_viewer
        log "Both PACS services restarted"
        ;;
      *)
        cat <<'USAGE'

  Usage: bash deploy/local-deploy.sh restart [server|viewer|all]

USAGE
        exit 1
        ;;
    esac
    ;;

  copy-id)
    copy_id
    ;;

  status)
    status_check
    ;;

  anomaly)
    anomaly_run "${TARGET}"
    ;;

  latency)
    SUB="${2:-}"
    case "$SUB" in
      set)   latency_set "${3:-}" "${4:-0}" ;;
      clear) latency_clear ;;
      status)
        echo ""
        echo "  PACS_IMAGE_LATENCY_MS=${PACS_IMAGE_LATENCY_MS}"
        echo "  PACS_IMAGE_LATENCY_JITTER_MS=${PACS_IMAGE_LATENCY_JITTER_MS}"
        echo ""
        ;;
      *)
        cat <<'USAGE'

  Usage: bash deploy/local-deploy.sh latency set <ms> [jitter_ms]
         bash deploy/local-deploy.sh latency clear
         bash deploy/local-deploy.sh latency status

  Examples:
    bash deploy/local-deploy.sh latency set 1500 300   # 1.5s + 300ms jitter
    bash deploy/local-deploy.sh latency set 3000        # 3s flat delay
    bash deploy/local-deploy.sh latency clear            # restore native speed

  Updates PACS_IMAGE_LATENCY_MS in deploy/config.env, rewrites the server
  .env on VM5 via SSH, and restarts the PACS server via PM2.

USAGE
        exit 1
        ;;
    esac
    ;;

  logs)
    show_logs "${TARGET}"
    ;;

  *)
    cat <<'USAGE'

  CareConnect PACS — VM5 Deployment Orchestrator
  SSHes to PACS_PUBLIC_IP and manages PACS via rsync + PM2.
  Reads from deploy/config.env — the same config file as aws-deploy.sh.

  QUICK START:
    1. cp deploy/config.env.example deploy/config.env
    2. vi deploy/config.env          # set PACS_PUBLIC_IP, SSH_KEY, PACS_JWT_SECRET
    3. bash deploy/local-deploy.sh init all

  COMMANDS:
    copy-id                              Install PACS_SSH_KEY on VM5 (run once before init)
    init    [server|viewer|samples|all]  First-time VM5 provisioning (idempotent)
    update  [server|viewer|all]          Rsync + restart after code changes
    start   [server|viewer|all]          Start services via PM2
    stop    [server|viewer|all]          Stop services
    restart [server|viewer|all]          Restart services
    status                               Health check + PM2 process list on VM5
    anomaly [enable|disable]             Trigger or clear the scheduled latency anomaly
    latency set <ms> [jitter_ms]        Simulate WAN degradation (ThousandEyes demo)
    latency clear                        Remove latency simulation
    latency status                       Show current latency settings
    logs    [server|viewer|all]          Tail PM2 logs on VM5

  COMMON WORKFLOWS:
    bash deploy/local-deploy.sh copy-id             # install SSH key on VM5 (first time)
    bash deploy/local-deploy.sh init all            # fresh VM5 setup
    bash deploy/local-deploy.sh update all          # after git pull
    bash deploy/local-deploy.sh init samples        # (re)download DICOM images
    bash deploy/local-deploy.sh status              # verify everything healthy
    bash deploy/local-deploy.sh init cron           # install scheduled anomaly (run once)
    bash deploy/local-deploy.sh anomaly enable      # trigger anomaly now (on-demand)
    bash deploy/local-deploy.sh anomaly disable     # restore normal immediately
    bash deploy/local-deploy.sh latency set 1500    # manual ad-hoc degradation
    bash deploy/local-deploy.sh latency clear       # clear manual degradation
    bash deploy/local-deploy.sh logs server         # debug server issues

  CONFIG (deploy/config.env — shared with aws-deploy.sh):
    PACS_PUBLIC_IP         VM5 IP address (SSH target + ThousandEyes test target)
    PACS_SSH_USER          SSH login user for VM5 (falls back to SSH_USER)
    PACS_SSH_KEY           Path to SSH private key for VM5 (falls back to SSH_KEY)
    PACS_SERVER_PORT       DICOMweb server port  (default: 3021)
    PACS_VIEWER_PORT       Viewer port           (default: 5174)
    PACS_JWT_SECRET        JWT signing secret
    PACS_IMAGE_LATENCY_MS        Simulated latency ms  (ThousandEyes demo — manual)
    PACS_ANOMALY_LATENCY_MS      Latency ms for scheduled anomaly  (default: 1500)
    PACS_ANOMALY_JITTER_MS       Jitter ms for scheduled anomaly   (default: 300)
    PACS_ANOMALY_ENABLE_CRON     Cron expression to enable anomaly (default: 0 10 * * 1-5)
    PACS_ANOMALY_DISABLE_CRON    Cron expression to end anomaly    (default: 15 10 * * 1-5)
    SPLUNK_ACCESS_TOKEN          Splunk O11y ingest token  (shared with cloud deploy)
    SPLUNK_REALM           Splunk realm              (shared with cloud deploy)

  DEMO ACCOUNTS (password: pacs1234):
    dr.chen@pacs.hospital    — Radiologist, Diagnostic
    dr.patel@pacs.hospital   — Radiologist, Neuro
    tech.jones@pacs.hospital — Technologist

  THOUSANDEYES INTEGRATION:
    HTTP Server test:   http://<PACS_PUBLIC_IP>:<PACS_SERVER_PORT>/health
    HTTP Server test:   http://<PACS_PUBLIC_IP>:<PACS_SERVER_PORT>/ping
    HTTP Server test:   http://<PACS_PUBLIC_IP>:<PACS_SERVER_PORT>/probe/small   (~200 KB)
    HTTP Server test:   http://<PACS_PUBLIC_IP>:<PACS_SERVER_PORT>/probe/medium  (~2 MB)
    HTTP Server test:   http://<PACS_PUBLIC_IP>:<PACS_SERVER_PORT>/probe/large   (~20 MB)
    Page Load test:     http://<PACS_PUBLIC_IP>:<PACS_VIEWER_PORT>
    Transaction:        login → worklist → open study → image loads
    Scheduled anomaly:  bash deploy/local-deploy.sh init cron  (Mon–Fri 10:00–10:15 by default)
    On-demand anomaly:  bash deploy/local-deploy.sh anomaly enable|disable

  RELATED:
    bash deploy/aws-deploy.sh  init all    # cloud EHR deployment (VM1–VM4)
    bash deploy/aws-deploy.sh  status      # cloud health check

USAGE
    exit 1
    ;;

esac
