#!/bin/bash
# Deployed to aws-use2 web nodes at /opt/replication-client/run-traffic.sh
# Downloads the replication payload from the aws-west1 server in a loop
# for exactly REPLICATION_DURATION_SECONDS, simulating sustained cross-region
# replication traffic across the Transit Gateway.
#
# Variables are injected by the replication-traffic systemd EnvironmentFile
# (/etc/replication-client.conf), which is written by client-setup.sh from
# deploy/config.env TRAFFIC_SIM_* settings.

set -euo pipefail

SERVER_HOST="${REPLICATION_SERVER_HOST:-}"
SERVER_PORT="${REPLICATION_SERVER_PORT:-873}"
DURATION="${REPLICATION_DURATION_SECONDS:-1200}"
REMOTE_FILE="http://${SERVER_HOST}:${SERVER_PORT}/replication.bin"
LOG_FILE="/var/log/replication-traffic.log"
TMP_DEST="/tmp/replication-traffic.bin"

if [[ -z "$SERVER_HOST" ]]; then
    echo "ERROR: REPLICATION_SERVER_HOST is not set." >&2
    exit 1
fi

START_TS=$(date +%s)
END_TS=$(( START_TS + DURATION ))
RUN_COUNT=0

log() {
    echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') $*" | tee -a "$LOG_FILE"
}

log "START run=${START_TS} host=${SERVER_HOST} port=${SERVER_PORT} duration=${DURATION}s"

while [[ $(date +%s) -lt $END_TS ]]; do
    REMAINING=$(( END_TS - $(date +%s) ))
    RUN_COUNT=$(( RUN_COUNT + 1 ))
    log "fetch #${RUN_COUNT} remaining=${REMAINING}s"

    curl --silent \
         --output "$TMP_DEST" \
         --max-time "$REMAINING" \
         --retry 2 \
         --retry-delay 3 \
         --connect-timeout 10 \
         "$REMOTE_FILE" || true

    rm -f "$TMP_DEST"
done

log "END fetches=${RUN_COUNT} elapsed=$(( $(date +%s) - START_TS ))s"
