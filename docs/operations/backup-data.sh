#!/bin/sh
set -eu
umask 077
stamp="${KAIYO_BACKUP_STAMP:?請透過 backup.sh 建立備份}"
case "$stamp" in ''|*[!0-9TZ]*) exit 1;; esac
[ "${#stamp}" -eq 25 ]
directory="/backups/.partial-$stamp"
mkdir "$directory"
pg_dump --format=custom --no-owner --no-acl --file="$directory/database.dump"
pg_restore --list "$directory/database.dump" > /dev/null
tar -czf "$directory/uploads.tar.gz" -C /media .
tar -czf "$directory/secrets.tar.gz" -C /secrets .
printf '%s\n' 'KaiyoLab 備份' "UTC=$stamp" 'PostgreSQL=18' > "$directory/manifest.txt"
cd "$directory"
sha256sum database.dump uploads.tar.gz secrets.tar.gz manifest.txt > SHA256SUMS
sha256sum -c SHA256SUMS
# 仍是未公開快照，呼叫端驗證原連線的鎖後才可完成
