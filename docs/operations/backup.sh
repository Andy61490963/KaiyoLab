#!/bin/sh
set -eu
umask 077
export PGPASSWORD="$(cat /secrets/pg-password)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
directory="/backups/$stamp"
mkdir "$directory"
pg_dump --format=custom --no-owner --no-acl --file="$directory/database.dump"
tar -czf "$directory/uploads.tar.gz" -C /media .
tar -czf "$directory/secrets.tar.gz" -C /secrets .
printf '%s\n' "KaiyoLab 備份" "UTC=$stamp" "PostgreSQL=18" > "$directory/manifest.txt"
cd "$directory"
sha256sum database.dump uploads.tar.gz secrets.tar.gz manifest.txt > SHA256SUMS
# 只把不含密鑰的維運紀錄提供給 app，備份本體不掛入應用程式容器
mkdir -p /backups/.operations
chmod 755 /backups/.operations
printf '{"operation":"backup","completedAt":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /backups/.operations/.last-backup.json.tmp
chmod 644 /backups/.operations/.last-backup.json.tmp
mv /backups/.operations/.last-backup.json.tmp /backups/.operations/.last-backup.json
printf '備份已完成：backups/%s\n' "$stamp"
