#!/bin/sh
set -eu
[ "${CI:-}" = true ] && [ "${COMPOSE_PROJECT_NAME:-}" = kaiyolab-ci ]
mkdir -p .local/ci-offsite/repository .local/ci-offsite/restore
printf '%s' ci-only-encryption-password > .local/ci-offsite/password
chmod 600 .local/ci-offsite/password
run_restic() {
  docker run --rm \
    -e RESTIC_REPOSITORY=/repository -e RESTIC_PASSWORD_FILE=/run/password \
    -v "$PWD/.local/ci-offsite/password:/run/password:ro" \
    -v "$PWD/.local/ci-offsite/repository:/repository" \
    -v "$PWD/.local/ci-offsite/restore:/restore" \
    -v "$PWD/backups:/backups:ro" \
    restic/restic:0.19.0 "$@"
}
run_restic init
docker run --rm --entrypoint sh \
  -e RESTIC_REPOSITORY=/repository -e RESTIC_PASSWORD_FILE=/run/password -e OFFSITE_RUN_ONCE=true \
  -v "$PWD/.local/ci-offsite/password:/run/password:ro" \
  -v "$PWD/.local/ci-offsite/repository:/repository" \
  -v "$PWD/backups:/backups:ro" \
  -v "$PWD/docs/operations:/operations:ro" \
  restic/restic:0.19.0 /operations/offsite.sh
run_restic restore latest --target /restore
latest="$(ls -1 backups | sort | tail -n 1)"
docker run --rm --entrypoint sh \
  -v "$PWD/.local/ci-offsite/restore:/restore:ro" \
  restic/restic:0.19.0 -c "cd /restore/backups/$latest && sha256sum -c SHA256SUMS"
printf '%s' incorrect-ci-password > .local/ci-offsite/password
if run_restic snapshots; then
  printf '錯誤密碼不應能解密備份\n' >&2
  exit 1
fi
printf '加密副本、檔案校驗及錯誤密碼拒絕驗證完成\n'
