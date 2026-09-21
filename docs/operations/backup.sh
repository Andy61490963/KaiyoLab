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
printf '備份已完成：backups/%s\n' "$stamp"
