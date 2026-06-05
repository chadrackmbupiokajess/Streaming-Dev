#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

APP_NAME="${APP_NAME:-streaming-dev}"
APP_DIR="${APP_DIR:-/srv/${APP_NAME}}"
DEPLOY_USER="${DEPLOY_USER:-$USER}"
DEPLOY_GROUP="${DEPLOY_GROUP:-$(id -gn "${DEPLOY_USER}")}"
DOMAIN="${DOMAIN:-stream.bisofood.com}"
BACKEND_PORT="${BACKEND_PORT:-18001}"
PUBLIC_ROOT="${PUBLIC_ROOT:-/var/www/${APP_NAME}}"

BACKEND_ENV="${APP_DIR}/deploy/vps/backend.env"
FRONTEND_ENV="${APP_DIR}/deploy/vps/frontend.env"
BACKEND_ENV_EXAMPLE="${PROJECT_ROOT}/deploy/vps/backend.env.example"
FRONTEND_ENV_EXAMPLE="${PROJECT_ROOT}/deploy/vps/frontend.env.example"
SERVICE_TEMPLATE="${PROJECT_ROOT}/deploy/vps/templates/streaming-backend.service.template"
NGINX_TEMPLATE="${PROJECT_ROOT}/deploy/vps/templates/stream.bisofood.com.nginx.template"
SERVICE_TARGET="/etc/systemd/system/${APP_NAME}-backend.service"
NGINX_TARGET="/etc/nginx/sites-available/${DOMAIN}.conf"
NGINX_LINK="/etc/nginx/sites-enabled/${DOMAIN}.conf"

render_template() {
    local source_file="$1"
    local target_file="$2"
    sed \
        -e "s|__APP_NAME__|${APP_NAME}|g" \
        -e "s|__APP_DIR__|${APP_DIR}|g" \
        -e "s|__DEPLOY_USER__|${DEPLOY_USER}|g" \
        -e "s|__DEPLOY_GROUP__|${DEPLOY_GROUP}|g" \
        -e "s|__DOMAIN__|${DOMAIN}|g" \
        -e "s|__BACKEND_PORT__|${BACKEND_PORT}|g" \
        -e "s|__PUBLIC_ROOT__|${PUBLIC_ROOT}|g" \
        "${source_file}" | sudo tee "${target_file}" >/dev/null
}

mkdir -p "${APP_DIR}/deploy/vps"

if [[ ! -f "${BACKEND_ENV}" ]]; then
    cp "${BACKEND_ENV_EXAMPLE}" "${BACKEND_ENV}"
    echo "Created ${BACKEND_ENV}. Edit it before the first deploy."
fi

if [[ ! -f "${FRONTEND_ENV}" ]]; then
    cp "${FRONTEND_ENV_EXAMPLE}" "${FRONTEND_ENV}"
    echo "Created ${FRONTEND_ENV}. Edit it before the first deploy."
fi

sudo mkdir -p "${PUBLIC_ROOT}"
render_template "${SERVICE_TEMPLATE}" "${SERVICE_TARGET}"
render_template "${NGINX_TEMPLATE}" "${NGINX_TARGET}"

if [[ ! -L "${NGINX_LINK}" ]]; then
    sudo ln -s "${NGINX_TARGET}" "${NGINX_LINK}"
fi

sudo systemctl daemon-reload
sudo systemctl enable "${APP_NAME}-backend.service"
sudo nginx -t
sudo systemctl reload nginx

echo "Systemd and nginx templates are installed."
echo "Next steps:"
echo "1. Edit ${BACKEND_ENV}"
echo "2. Edit ${FRONTEND_ENV}"
echo "3. Run deploy/vps/deploy.sh"
echo "4. Run certbot for ${DOMAIN} if HTTPS is not configured yet"
