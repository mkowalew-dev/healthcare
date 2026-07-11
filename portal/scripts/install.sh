#!/usr/bin/env bash
# CareConnect Internal Portal — Ubuntu Installation Script
# Usage: sudo ./install.sh [--uninstall] [--port PORT]
# Default port: 8090

set -euo pipefail

PORTAL_NAME="careconnect-portal"
WEBROOT="/var/www/${PORTAL_NAME}"
NGINX_CONF="/etc/nginx/sites-available/${PORTAL_NAME}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${PORTAL_NAME}"
PORT=8090
UNINSTALL=false

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --uninstall) UNINSTALL=true ;;
    --port)      PORT="$2"; shift ;;
    *)           echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
  shift
done

# Must run as root
if [[ $EUID -ne 0 ]]; then
  echo "✗ This script must be run as root (sudo ./install.sh)" >&2
  exit 1
fi

# ── Uninstall ───────────────────────────────────────────────────────────────
if [[ "$UNINSTALL" == "true" ]]; then
  echo "→ Removing ${PORTAL_NAME}..."
  rm -f  "${NGINX_ENABLED}"
  rm -f  "${NGINX_CONF}"
  rm -rf "${WEBROOT}"
  nginx -t && nginx -s reload 2>/dev/null || true
  echo "✓ ${PORTAL_NAME} removed."
  exit 0
fi

# ── Detect script directory (where dist/ lives) ──────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="${SCRIPT_DIR}/dist"

if [[ ! -d "${DIST_DIR}" ]]; then
  echo "✗ dist/ directory not found at ${DIST_DIR}" >&2
  echo "  Run 'make release' from the portal directory to build first." >&2
  exit 1
fi

# ── Install nginx if missing ─────────────────────────────────────────────────
if ! command -v nginx &>/dev/null; then
  echo "→ Installing nginx..."
  apt-get update -qq
  apt-get install -y -qq nginx
fi

# ── Deploy files ─────────────────────────────────────────────────────────────
echo "→ Deploying to ${WEBROOT}..."
mkdir -p "${WEBROOT}"
cp -r "${DIST_DIR}/." "${WEBROOT}/"
chown -R www-data:www-data "${WEBROOT}"
find "${WEBROOT}" -type d -exec chmod 755 {} \;
find "${WEBROOT}" -type f -exec chmod 644 {} \;

# ── Write nginx site config ──────────────────────────────────────────────────
echo "→ Configuring nginx on port ${PORT}..."
sed "s/listen 8090;/listen ${PORT};/g; s/listen \[::\]:8090;/listen [::]:${PORT};/g" \
  "${SCRIPT_DIR}/nginx.conf" > "${NGINX_CONF}"

# Enable site
ln -sf "${NGINX_CONF}" "${NGINX_ENABLED}"

# Disable default site if it conflicts on port 80 or 8090
if [[ -e "/etc/nginx/sites-enabled/default" ]]; then
  echo "  (Leaving default nginx site enabled — it uses a different port)"
fi

# ── Validate and reload nginx ─────────────────────────────────────────────────
echo "→ Testing nginx configuration..."
nginx -t

echo "→ Reloading nginx..."
systemctl reload nginx || service nginx reload

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "✓ CareConnect Internal Portal installed successfully!"
echo ""
HOST_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "localhost")
echo "  URL:  http://${HOST_IP}:${PORT}"
echo "  Root: ${WEBROOT}"
echo "  Logs: /var/log/nginx/${PORTAL_NAME}.access.log"
echo ""
echo "  To uninstall:   sudo ./install.sh --uninstall"
echo "  To change port: sudo ./install.sh --port 9000"
echo ""
