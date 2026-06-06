#!/bin/bash
# Run on api02 (us-east-2) as root.
# Accepts TRAFFIC_SIM_* vars via 'sudo env KEY=val bash ...' (healthcare-deploy.sh pattern),
# or falls back to sourcing ../config.env for manual runs on the node.
set -euo pipefail

# ── Config resolution ─────────────────────────────────────────
# When called via healthcare-deploy.sh the vars are already in the environment.
# When run manually on the node, source config.env as a fallback.
if [[ -z "${TRAFFIC_SIM_PORT:-}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    CONFIG_ENV="$SCRIPT_DIR/../config.env"
    if [[ -f "$CONFIG_ENV" ]]; then
        # shellcheck source=../config.env
        source "$CONFIG_ENV"
    else
        echo "ERROR: TRAFFIC_SIM_* vars not set and config.env not found at $CONFIG_ENV" >&2
        exit 1
    fi
fi

SERVER_PORT="${TRAFFIC_SIM_PORT:-873}"
PAYLOAD_SIZE_MB="${TRAFFIC_SIM_PAYLOAD_SIZE_MB:-512}"

PAYLOAD_DIR="/opt/replication-server/data"
PAYLOAD_FILE="$PAYLOAD_DIR/replication.bin"
NGINX_CONF="/etc/nginx/sites-available/replication-server.conf"
SERVICE_FILE="/etc/systemd/system/replication-server.service"

echo "==> Config: port=${SERVER_PORT}, payload=${PAYLOAD_SIZE_MB}MB"

echo "==> Ensuring nginx is installed"
if ! command -v nginx &>/dev/null; then
    apt-get update -qq
    apt-get install -y -qq nginx
fi

# Ubuntu nginx installs without sites-available/sites-enabled when the package
# doesn't pull in the full config scaffold — create them and wire the include.
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
if ! grep -q 'sites-enabled' /etc/nginx/nginx.conf; then
    sed -i '/http {/a\\tinclude /etc/nginx/sites-enabled/*;' /etc/nginx/nginx.conf
fi

systemctl enable nginx
systemctl start nginx

echo "==> Creating payload directory"
mkdir -p "$PAYLOAD_DIR"

echo "==> Generating ${PAYLOAD_SIZE_MB}MB payload"
EXPECTED_BYTES=$(( PAYLOAD_SIZE_MB * 1024 * 1024 ))
REGEN=false
if [[ ! -f "$PAYLOAD_FILE" ]]; then
    REGEN=true
else
    ACTUAL_BYTES=$(stat -c%s "$PAYLOAD_FILE" 2>/dev/null || echo 0)
    if [[ "$ACTUAL_BYTES" -ne "$EXPECTED_BYTES" ]]; then
        echo "    Size mismatch: have ${ACTUAL_BYTES}B, want ${EXPECTED_BYTES}B — regenerating."
        REGEN=true
    else
        echo "    Payload already exists at correct size (${PAYLOAD_SIZE_MB}MB), skipping."
    fi
fi
if [[ "$REGEN" == "true" ]]; then
    dd if=/dev/urandom of="$PAYLOAD_FILE" bs=1M count="$PAYLOAD_SIZE_MB" status=progress
fi

echo "==> Writing nginx site config for port ${SERVER_PORT}"
cat > "$NGINX_CONF" <<EOF
server {
    listen ${SERVER_PORT};
    server_name _;

    root /opt/replication-server/data;
    autoindex off;

    location /replication.bin {
        add_header Content-Type application/octet-stream;
        add_header Cache-Control "no-store";
    }

    access_log /var/log/nginx/replication-access.log combined;
    error_log  /var/log/nginx/replication-error.log warn;
}
EOF

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/replication-server.conf

echo "==> Validating nginx config"
nginx -t

NGINX_BIN="$(command -v nginx)"

echo "==> Writing systemd service"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Replication Traffic Server (port ${SERVER_PORT})
After=network.target nginx.service
Requires=nginx.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=${NGINX_BIN} -s reload
ExecStop=/bin/true
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "==> Enabling and starting service"
systemctl daemon-reload
systemctl enable replication-server.service
systemctl start replication-server.service

if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
    ufw allow "${SERVER_PORT}/tcp" comment "replication-server"
fi

echo ""
echo "==> Server ready on port ${SERVER_PORT}."
echo "    Test: curl -o /dev/null http://$(hostname -I | awk '{print $1}'):${SERVER_PORT}/replication.bin"
