#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

APP_NAME="${APP_NAME:-streaming-dev}"
APP_DIR="${APP_DIR:-/srv/${APP_NAME}}"
REPO_URL="${REPO_URL:-}"
BRANCH="${BRANCH:-main}"
DEPLOY_USER="${DEPLOY_USER:-$USER}"
DEPLOY_GROUP="${DEPLOY_GROUP:-$(id -gn "${DEPLOY_USER}")}"
DOMAIN="${DOMAIN:-stream.bisofood.com}"
BACKEND_PORT="${BACKEND_PORT:-18001}"
PUBLIC_ROOT="${PUBLIC_ROOT:-/var/www/${APP_NAME}}"

ensure_repo() {
    mkdir -p "$(dirname "${APP_DIR}")"

    if [[ ! -d "${APP_DIR}/.git" ]]; then
        if [[ -z "${REPO_URL}" ]]; then
            echo "REPO_URL is required for the first clone."
            exit 1
        fi
        git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
    else
        git -C "${APP_DIR}" fetch origin "${BRANCH}"
        git -C "${APP_DIR}" checkout "${BRANCH}"
        git -C "${APP_DIR}" pull --ff-only origin "${BRANCH}"
    fi
}

check_env_files() {
    local backend_env="${APP_DIR}/deploy/vps/backend.env"
    local frontend_env="${APP_DIR}/deploy/vps/frontend.env"

    if [[ ! -f "${backend_env}" || ! -f "${frontend_env}" ]]; then
        echo "Environment files are missing after install_services.sh."
        exit 1
    fi

    if grep -q "change-me-with-a-long-random-secret" "${backend_env}"; then
        echo "Edit ${backend_env} and replace DJANGO_SECRET_KEY, then rerun bootstrap.sh."
        exit 1
    fi
}

ensure_repo
chmod +x "${APP_DIR}/deploy/vps/install_services.sh" "${APP_DIR}/deploy/vps/deploy.sh"

APP_NAME="${APP_NAME}" \
APP_DIR="${APP_DIR}" \
DEPLOY_USER="${DEPLOY_USER}" \
DEPLOY_GROUP="${DEPLOY_GROUP}" \
DOMAIN="${DOMAIN}" \
BACKEND_PORT="${BACKEND_PORT}" \
PUBLIC_ROOT="${PUBLIC_ROOT}" \
"${APP_DIR}/deploy/vps/install_services.sh"

check_env_files

APP_NAME="${APP_NAME}" \
APP_DIR="${APP_DIR}" \
REPO_URL="${REPO_URL}" \
BRANCH="${BRANCH}" \
DEPLOY_USER="${DEPLOY_USER}" \
DEPLOY_GROUP="${DEPLOY_GROUP}" \
PUBLIC_ROOT="${PUBLIC_ROOT}" \
"${APP_DIR}/deploy/vps/deploy.sh"

echo "Bootstrap finished for ${APP_NAME}."
