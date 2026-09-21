#!/bin/sh
set -eu
# 此腳本僅在 CI 的獨立 Compose 專案執行。
if [ "${CI:-}" != "true" ] || [ "${COMPOSE_PROJECT_NAME:-}" != "kaiyolab-ci" ]; then
  printf '此腳本僅適用於 kaiyolab-ci 測試環境。\n' >&2
  exit 1
fi

database_hash() (
  umask 077
  dump_path="$(mktemp)"
  trap 'rm -f "$dump_path" "$dump_path.normalized"' 0
  trap 'exit 1' HUP INT TERM
  # 先確認匯出成功，再計算雜湊，避免管線隱藏 pg_dump 失敗。
  if ! docker compose "$@" exec -T db pg_dump -U kaiyo -d kaiyolab --data-only --no-owner --no-acl > "$dump_path"; then
    printf '資料庫匯出失敗，停止備份還原驗證。\n' >&2
    exit 1
  fi
  # PostgreSQL 18 的限制碼每次隨機產生，不屬於資料內容。
  sed '/^\\restrict /d; /^\\unrestrict /d' "$dump_path" > "$dump_path.normalized"
  digest="$(sha256sum "$dump_path.normalized")"
  printf '%s\n' "${digest%% *}"
)

file_hashes() {
  docker compose "$@" --profile maintenance run --rm --no-deps --entrypoint sh backup /operations/file-hashes.sh
}

# 透過一般容器設定驗證執行身分及唯讀根目錄。
docker compose exec -T app node -e "if (process.getuid() !== 1000) throw new Error('應用程式必須以非 root UID 1000 執行。')"
app_container="$(docker compose ps -q app)"
if [ "$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$app_container")" != "true" ]; then
  printf '應用程式容器未啟用唯讀根目錄。\n' >&2
  exit 1
fi
docker compose stop app
# 瀏覽器測試會清理上傳圖片；加入隨機探測檔，避免空的 uploads 造成驗證假成功。
docker compose run --rm --no-deps --entrypoint node app -e "require('node:fs').writeFileSync(require('node:path').join(process.env.UPLOAD_DIR, '.ci-restore-probe'), require('node:crypto').randomBytes(1024), {flag:'wx'})"
before="$(database_hash)"
files_before="$(file_hashes)"
docker compose --profile maintenance run --rm backup
backup="$(ls -1 backups | sort | tail -n 1)"
docker compose up -d --force-recreate --wait --wait-timeout 120 app
curl --fail --silent http://localhost:4321/api/health > /dev/null
docker compose stop app
after="$(database_hash)"
files_after="$(file_hashes)"
if [ "$before" != "$after" ] || [ "$files_before" != "$files_after" ]; then
  printf '容器重建後，資料庫、圖片或密鑰內容不一致。\n' >&2
  exit 1
fi

docker compose -p kaiyolab-ci-restore --profile maintenance run --rm restore-files "$backup"
if docker compose -p kaiyolab-ci-restore --profile maintenance run --rm restore-files "$backup"; then
  printf '還原防護失效：非空媒體或密鑰 volume 不應被覆寫。\n' >&2
  exit 1
fi
docker compose -p kaiyolab-ci-restore up -d --wait --wait-timeout 120 db
docker compose -p kaiyolab-ci-restore --profile maintenance run --rm restore-db "$backup"
if docker compose -p kaiyolab-ci-restore --profile maintenance run --rm restore-db "$backup"; then
  printf '還原防護失效：既有資料庫不應被覆寫。\n' >&2
  exit 1
fi
restored="$(database_hash -p kaiyolab-ci-restore)"
files_restored="$(file_hashes -p kaiyolab-ci-restore)"
if [ "$before" != "$restored" ] || [ "$files_before" != "$files_restored" ]; then
  printf '還原後，資料庫、圖片或密鑰內容不一致。\n' >&2
  exit 1
fi

# 原站應用程式已停止，先移除容器以釋放相同的 loopback port。
docker compose rm -f app
docker compose -p kaiyolab-ci-restore up -d --wait --wait-timeout 120 app
curl --fail --silent http://localhost:4321/api/health > /dev/null
node docs/operations/verify-restored.mjs
printf '容器重建、資料庫、圖片及密鑰的備份還原驗證完成。\n'
