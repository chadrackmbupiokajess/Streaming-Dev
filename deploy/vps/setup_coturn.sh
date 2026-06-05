#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

DOMAIN="${DOMAIN:-stream.bisofood.com}"
PUBLIC_IP="${PUBLIC_IP:-72.60.66.248}"
TURN_USER="${TURN_USER:-streamturn}"
TURN_PASSWORD="${TURN_PASSWORD:-}"
TURN_TEMPLATE="${PROJECT_ROOT}/deploy/vps/templates/turnserver.conf.template"
TURN_TARGET="/etc/turnserver.conf"

if [[ -z "${TURN_PASSWORD}" ]]; then
    echo "TURN_PASSWORD is required."
    exit 1
fi

if ! command -v turnserver >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y coturn
fi

sed \
    -e "s|__DOMAIN__|${DOMAIN}|g" \
    -e "s|__PUBLIC_IP__|${PUBLIC_IP}|g" \
    -e "s|__TURN_USER__|${TURN_USER}|g" \
    -e "s|__TURN_PASSWORD__|${TURN_PASSWORD}|g" \
    "${TURN_TEMPLATE}" | sudo tee "${TURN_TARGET}" >/dev/null

if [[ -f /etc/default/coturn ]]; then
    sudo sed -i 's/^TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
fi

sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 49160:49200/udp

sudo systemctl enable coturn
sudo systemctl restart coturn
sudo systemctl --no-pager --full status coturn | sed -n '1,14p'

echo "coturn is configured for ${DOMAIN}."
echo "Next: update deploy/vps/frontend.env with TURN credentials, then run deploy/vps/deploy.sh."
