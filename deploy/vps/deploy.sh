#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="${APP_NAME:-streaming-dev}"
APP_DIR="${APP_DIR:-/srv/${APP_NAME}}"
REPO_URL="${REPO_URL:-}"
BRANCH="${BRANCH:-main}"
DEPLOY_USER="${DEPLOY_USER:-$USER}"
DEPLOY_GROUP="${DEPLOY_GROUP:-$(id -gn "${DEPLOY_USER}")}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
NPM_BIN="${NPM_BIN:-npm}"
PUBLIC_ROOT="${PUBLIC_ROOT:-/var/www/${APP_NAME}}"
BACKEND_ENV_FILE="${BACKEND_ENV_FILE:-${APP_DIR}/deploy/vps/backend.env}"
FRONTEND_ENV_FILE="${FRONTEND_ENV_FILE:-${APP_DIR}/deploy/vps/frontend.env}"
BACKEND_SERVICE="${BACKEND_SERVICE:-${APP_NAME}-backend.service}"

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

load_env_file() {
    local env_file="$1"
    if [[ -f "${env_file}" ]]; then
        set -a
        # shellcheck source=/dev/null
        . "${env_file}"
        set +a
    fi
}

deploy_backend() {
    cd "${APP_DIR}/backend"

    if [[ ! -d "venv" ]]; then
        "${PYTHON_BIN}" -m venv venv
    fi

    # shellcheck disable=SC1091
    . venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt

    load_env_file "${BACKEND_ENV_FILE}"

    python manage.py migrate --noinput
    python manage.py collectstatic --noinput
    deactivate
}

deploy_frontend() {
    cd "${APP_DIR}/frontend"
    load_env_file "${FRONTEND_ENV_FILE}"

    "${NPM_BIN}" ci
    "${NPM_BIN}" run build

    sudo mkdir -p "${PUBLIC_ROOT}"
    sudo rsync -a --delete build/ "${PUBLIC_ROOT}/"
    sudo chown -R "${DEPLOY_USER}:${DEPLOY_GROUP}" "${PUBLIC_ROOT}"
}

restart_services() {
    sudo systemctl daemon-reload
    sudo systemctl restart "${BACKEND_SERVICE}"
    sudo nginx -t
    sudo systemctl reload nginx
    sudo systemctl --no-pager --full status "${BACKEND_SERVICE}" | sed -n '1,12p'
}

ensure_repo
deploy_backend
deploy_frontend
restart_services

echo "Deployment finished for ${APP_NAME} on branch ${BRANCH}."
