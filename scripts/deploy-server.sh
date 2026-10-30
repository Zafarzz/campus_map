#!/usr/bin/env bash
# Safe, atomic GitOps deployment script for Campus Map (Frontend + Backend + DB).
#
# Modes:
#   scripts/deploy-server.sh --poll   # Quietly check origin/main; deploy only if new commit exists
#   scripts/deploy-server.sh          # Fetch and deploy if origin/main is ahead of HEAD
#   scripts/deploy-server.sh --force  # Rebuild and redeploy current origin/main unconditionally
#
# Safety guarantees:
#   1. Wrapped in `{ main "$@"; exit $?; }` so self-updates via `git reset` never
#      corrupt the running Bash parser.
#   2. Exclusive `flock` lock prevents overlapping timer and SSH-triggered deploys.
#   3. Automatic `pg_dump` backup to `~/campus_backups` whenever Alembic migrations change.
#   4. Builds new immutable `prod` images BEFORE stopping live containers — a broken
#      build aborts cleanly with zero downtime.
#   5. Verifies end-to-end health (`frontend` Nginx -> `api` `/readyz` -> PostgreSQL
#      plus `/version.json` commit stamp) and rolls back automatically on failure.

{
set -Eeuo pipefail

REPO_DIR="${CAMPUS_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BRANCH="${CAMPUS_DEPLOY_BRANCH:-main}"
LOCK_FILE="${CAMPUS_DEPLOY_LOCK:-/tmp/campus-autodeploy.lock}"
BACKUP_DIR="${CAMPUS_BACKUP_DIR:-$HOME/campus_backups}"
FRONTEND_PORT="${FRONTEND_PROD_PORT:-8080}"

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

detect_docker() {
  if docker info >/dev/null 2>&1; then
    DOCKER=(docker)
  elif sudo -n docker info >/dev/null 2>&1; then
    DOCKER=(sudo docker)
  else
    log "ERROR: Cannot talk to Docker daemon (neither direct nor passwordless sudo)."
    exit 1
  fi
}

compose() {
  "${DOCKER[@]}" compose -f docker-compose.yml -f docker-compose.prod.yml "$@"
}

wait_for_healthy() {
  local expected_commit="$1"
  local url_ready="http://127.0.0.1:${FRONTEND_PORT}/readyz"
  local url_version="http://127.0.0.1:${FRONTEND_PORT}/version.json"
  local attempt=1
  local max_attempts=30

  while [ "${attempt}" -le "${max_attempts}" ]; do
    if curl -fsS --max-time 4 "${url_ready}" >/dev/null 2>&1; then
      local ver_json
      ver_json="$(curl -fsS --max-time 4 "${url_version}" 2>/dev/null || true)"
      if printf '%s' "${ver_json}" | grep -q "\"commit\":\"${expected_commit}\""; then
        return 0
      fi
    fi
    sleep 2
    attempt=$((attempt + 1))
  done
  return 1
}

backup_db_if_migrations_changed() {
  local from_sha="$1"
  local to_sha="$2"

  if [ "${from_sha}" = "${to_sha}" ]; then
    return 0
  fi

  if ! git diff --name-only "${from_sha}..${to_sha}" | grep -q '^backend/alembic/'; then
    return 0
  fi

  mkdir -p "${BACKUP_DIR}"
  local ts
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  local dump_file="${BACKUP_DIR}/pre-deploy-${ts}-${from_sha:0:7}.dump"

  if "${DOCKER[@]}" ps --format '{{.Names}}' | grep -q '^campus-backend-db-1$'; then
    log "Alembic migration changes detected; backing up PostgreSQL to ${dump_file} ..."
    "${DOCKER[@]}" exec campus-backend-db-1 pg_dump -U campus_owner -d campus -Fc > "${dump_file}"
    # Retain the 10 newest pre-deploy backups
    ls -1t "${BACKUP_DIR}"/pre-deploy-*.dump 2>/dev/null | tail -n +11 | xargs -r rm -f
  fi
}

sync_demo_inventory_if_needed() {
  local from_sha="$1"
  local to_sha="$2"
  local force_mode="$3"

  local app_env="development"
  if [ -f "${REPO_DIR}/backend/.env" ]; then
    local configured_env
    configured_env="$(grep -E '^APP_ENV=' "${REPO_DIR}/backend/.env" | tail -n 1 | cut -d= -f2- | tr -d '\r"'\''' || true)"
    if [ -n "${configured_env}" ]; then
      app_env="${configured_env}"
    fi
  fi

  if [ "${app_env}" != "development" ]; then
    return 0
  fi

  local should_sync="false"
  if [ "${force_mode}" = "true" ]; then
    should_sync="true"
  elif [ "${from_sha}" != "${to_sha}" ] && git diff --name-only "${from_sha}..${to_sha}" | grep -qE '^(src/data/|backend/scripts/seed_demo_campus\.py|docker-compose\.yml|scripts/deploy-server\.sh)'; then
    should_sync="true"
  fi

  if [ "${should_sync}" = "true" ]; then
    log "Syncing campus inventory & 7-day demo schedule from src/data into PostgreSQL (development mode) ..."
    compose run --rm -T backend-init /bin/sh -ec '
      export DATABASE_URL="postgresql+asyncpg://campus_app:${POSTGRES_APP_PASSWORD}@db:5432/campus"
      export DATABASE_MIGRATION_URL="postgresql+asyncpg://campus_owner:${POSTGRES_OWNER_PASSWORD}@db:5432/campus"
      export DATABASE_TEST_URL="postgresql+asyncpg://campus_owner:${POSTGRES_OWNER_PASSWORD}@db:5432/campus"
      python scripts/seed_demo_campus.py --with-dev-users --include-weekends
      python scripts/grant_app_privileges.py
    '
  fi
}

rollback() {
  local rollback_sha="$1"
  log "ERROR: Deployment failed verification! Rolling back to ${rollback_sha:0:7} ..."
  git reset --hard "${rollback_sha}"
  export APP_COMMIT
  APP_COMMIT="$(git rev-parse --short=7 HEAD)"
  export APP_BUILT_AT
  APP_BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  compose build
  compose up -d --remove-orphans
  log "Rollback to ${APP_COMMIT} complete."
}

main() {
  local mode="${1:-deploy}"
  cd "${REPO_DIR}"

  exec 9>"${LOCK_FILE}"
  if [ "${mode}" = "--poll" ]; then
    if ! flock -n 9; then
      exit 0
    fi
  else
    if ! flock -w 300 9; then
      log "ERROR: Timed out waiting for deploy lock ${LOCK_FILE}"
      exit 1
    fi
  fi

  local local_sha
  local_sha="$(git rev-parse HEAD)"

  if [ "${mode}" = "--poll" ]; then
    local ls_sha
    ls_sha="$(git ls-remote --heads origin "refs/heads/${BRANCH}" 2>/dev/null | awk '{print $1}' || true)"
    if [ -z "${ls_sha}" ] || [ "${ls_sha}" = "${local_sha}" ]; then
      exit 0
    fi
    log "New commit detected on origin/${BRANCH}: ${local_sha:0:7} -> ${ls_sha:0:7}"
  fi

  git fetch --prune origin "${BRANCH}"
  local target_sha
  target_sha="$(git rev-parse "origin/${BRANCH}")"

  local force_mode="false"
  if [ "${mode}" = "--force" ]; then
    force_mode="true"
  fi

  if [ "${target_sha}" = "${local_sha}" ] && [ "${force_mode}" != "true" ]; then
    log "Already up to date at ${local_sha:0:7}."
    exit 0
  fi

  detect_docker
  backup_db_if_migrations_changed "${local_sha}" "${target_sha}"

  log "Checking out ${target_sha:0:7} ..."
  git reset --hard "${target_sha}"

  export APP_COMMIT
  APP_COMMIT="$(git rev-parse --short=7 HEAD)"
  export APP_BUILT_AT
  APP_BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  log "Building production images for commit #${APP_COMMIT} (live containers stay untouched) ..."
  if ! compose build; then
    log "ERROR: Image build failed for #${APP_COMMIT}. Restoring git HEAD to ${local_sha:0:7}; live service was NOT interrupted."
    git reset --hard "${local_sha}"
    exit 1
  fi

  log "Applying stack update for #${APP_COMMIT} ..."
  if ! compose up -d --remove-orphans; then
    if [ "${local_sha}" != "${target_sha}" ]; then
      rollback "${local_sha}"
    fi
    exit 1
  fi

  log "Waiting for end-to-end readiness (/readyz + /version.json == #${APP_COMMIT}) ..."
  if ! wait_for_healthy "${APP_COMMIT}"; then
    compose logs --tail=60 api frontend || true
    if [ "${local_sha}" != "${target_sha}" ]; then
      rollback "${local_sha}"
    fi
    exit 1
  fi

  sync_demo_inventory_if_needed "${local_sha}" "${target_sha}" "${force_mode}"

  "${DOCKER[@]}" image prune -f >/dev/null 2>&1 || true
  log "SUCCESS: Commit #${APP_COMMIT} is live and healthy on 127.0.0.1:${FRONTEND_PORT}."
}

main "$@"
exit 0
}
