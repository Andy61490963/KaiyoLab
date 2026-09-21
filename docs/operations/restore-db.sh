#!/bin/sh
set -eu
name="${1:?請提供備份資料夾名稱}"
case "$name" in *[!0-9TZ]*) printf '備份資料夾名稱無效。\n' >&2; exit 1 ;; esac
directory="/backups/$name"
cd "$directory"
sha256sum -c SHA256SUMS
export PGPASSWORD="$(cat /secrets/pg-password)"
count="$(psql -XAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")"
if [ "$count" != "0" ]; then
    printf '拒絕覆寫：資料庫已有資料表，請使用全新 Compose 專案。\n' >&2
    exit 1
fi
pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname="$PGDATABASE" database.dump
printf '資料庫已還原，可以啟動應用程式。\n'
