#!/bin/sh
set -eu
umask 077
# 僅由 backup.sh 在同一個 psql 連線確認鎖及解鎖成功後呼叫
stamp="${KAIYO_BACKUP_STAMP:?請透過 backup.sh 建立備份}"
case "$stamp" in ''|*[!0-9TZ]*) exit 1;; esac
[ "${#stamp}" -eq 25 ]
directory="/backups/.partial-$stamp"
[ -d "$directory" ] && [ ! -L "$directory" ] && [ ! -e "/backups/$stamp" ]
[ "$(realpath "$directory")" = "$directory" ]
(cd "$directory" && sha256sum -c SHA256SUMS)
mv -T -- "$directory" "/backups/$stamp"
printf '{"operation":"backup","completedAt":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)" > /backups/.operations/.last-backup.json.tmp
chmod 644 /backups/.operations/.last-backup.json.tmp
mv /backups/.operations/.last-backup.json.tmp /backups/.operations/.last-backup.json
printf '備份已完成：backups/%s\n' "$stamp"
