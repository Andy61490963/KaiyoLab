#!/bin/sh
set -eu
name="${1:?請提供備份資料夾名稱，例如 20260921T080000Z}"
case "$name" in *[!0-9TZ]*) printf '備份資料夾名稱無效。\n' >&2; exit 1 ;; esac
directory="/backups/$name"
cd "$directory"
sha256sum -c SHA256SUMS
if [ -n "$(ls -A /media)" ] || [ -n "$(ls -A /secrets)" ]; then
    printf '拒絕覆寫：媒體或密鑰 volume 非空，請使用全新 Compose 專案。\n' >&2
    exit 1
fi
tar -xzf uploads.tar.gz -C /media
tar -xzf secrets.tar.gz -C /secrets
printf '媒體與密鑰已還原，請接著啟動資料庫並執行 restore-db。\n'
