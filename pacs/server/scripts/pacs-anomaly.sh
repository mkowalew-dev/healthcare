#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# pacs-anomaly.sh — enable or disable the PACS latency anomaly in-memory.
#
# Called by cron on VM5 to produce a predictable ThousandEyes demo anomaly
# every weekday during business hours.  Can also be triggered manually via:
#
#   bash deploy/local-deploy.sh anomaly enable   # start anomaly now
#   bash deploy/local-deploy.sh anomaly disable  # stop anomaly now
#
# The script reads PORT, JWT_SECRET, ANOMALY_LATENCY_MS, and ANOMALY_JITTER_MS
# from the server's .env file and calls POST /api/demo/latency using the
# X-Demo-Secret shared-secret header (no JWT login required).
#
# The latency is applied in-memory — no PM2 restart needed, effect is instant.
# The state resets to the .env value on the next server restart.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ACTION="${1:-}"
[[ "$ACTION" == "enable" || "$ACTION" == "disable" ]] || {
  echo "Usage: $(basename "$0") enable|disable" >&2
  exit 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"
LOG_DIR="$HOME/logs/careconnect"
LOG_FILE="${LOG_DIR}/anomaly.log"

mkdir -p "$LOG_DIR"

# Source server .env (PORT, JWT_SECRET, ANOMALY_LATENCY_MS, ANOMALY_JITTER_MS)
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

PORT="${PORT:-3021}"
JWT_SECRET="${JWT_SECRET:-pacs-demo-secret-change-me}"
ANOMALY_LATENCY_MS="${ANOMALY_LATENCY_MS:-1500}"
ANOMALY_JITTER_MS="${ANOMALY_JITTER_MS:-300}"

if [[ "$ACTION" == "enable" ]]; then
  PAYLOAD="{\"latencyMs\": ${ANOMALY_LATENCY_MS}, \"jitterMs\": ${ANOMALY_JITTER_MS}}"
else
  PAYLOAD='{"latencyMs": 0, "jitterMs": 0}'
fi

TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"

if RESPONSE=$(curl -fsS --max-time 10 \
    -X POST "http://localhost:${PORT}/api/demo/latency" \
    -H "Content-Type: application/json" \
    -H "X-Demo-Secret: ${JWT_SECRET}" \
    -d "$PAYLOAD" 2>&1); then
  printf '[%s] %s: %s\n' "$TIMESTAMP" "$ACTION" "$RESPONSE" | tee -a "$LOG_FILE"
else
  printf '[%s] ERROR %s (curl exit %s): %s\n' "$TIMESTAMP" "$ACTION" "$?" "$RESPONSE" \
    | tee -a "$LOG_FILE" >&2
  exit 1
fi
