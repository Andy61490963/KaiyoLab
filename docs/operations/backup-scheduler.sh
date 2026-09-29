#!/bin/sh
set -eu
interval="${BACKUP_INTERVAL_SECONDS:-86400}"
retention="${BACKUP_RETENTION_DAYS:-14}"
case "$interval:$retention" in *[!0-9:]*) printf '備份週期或保留天數無效\n' >&2; exit 1;; esac
[ "$interval" -ge 60 ] && [ "$interval" -le 2678400 ] && [ "$retention" -ge 1 ] && [ "$retention" -le 3650 ]
while :; do
  result=0
  marker=/backups/.operations/.last-backup.json
  now="$(date +%s)"
  last=0
  if [ -f "$marker" ]; then last="$(stat -c %Y "$marker")"; fi
  if [ "$last" -le "$now" ] && [ "$((now-last))" -lt "$interval" ]; then
    delay="$((interval-now+last))"
  elif sh /operations/backup.sh; then
    # 僅處理本工具產生、非符號連結、具完整清單的過期備份資料夾
    find /backups -mindepth 1 -maxdepth 1 -type d -mtime "+$retention" | while IFS= read -r candidate; do
      name="${candidate##*/}"
      case "$name" in ''|*[!0-9TZ]*) continue;; esac
      [ "${#name}" -ge 16 ] || continue
      [ ! -L "$candidate" ] && [ -f "$candidate/SHA256SUMS" ] && [ -f "$candidate/manifest.txt" ] || continue
      [ "$(realpath "$candidate")" = "/backups/$name" ] || exit 1
      [ "$(head -n 1 "$candidate/manifest.txt")" = 'KaiyoLab 備份' ] || continue
      rm -rf -- "$candidate"
    done
    delay="$interval"
  else
    result=1
    delay=3600
  fi
  if [ "${BACKUP_RUN_ONCE:-false}" = true ]; then exit "$result"; fi
  printf '下次備份檢查於 %s 秒後執行\n' "$delay"
  sleep "$delay" &
  trap 'kill "$!" 2>/dev/null || true; exit 0' TERM INT
  wait "$!"
done
