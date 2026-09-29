#!/bin/sh
set -eu
interval="${OFFSITE_INTERVAL_SECONDS:-86400}"
case "$interval" in ''|*[!0-9]*) exit 1;; esac
[ "$interval" -ge 60 ] && [ "$interval" -le 2678400 ]
: "${RESTIC_REPOSITORY:?請先設定自己的備份儲存庫}"
: "${RESTIC_PASSWORD_FILE:?請掛載已另行保存的加密密碼檔}"
while :; do
  # 不會將網路或驗證錯誤誤判成新儲存庫，更不會自動建立遠端資源
  restic snapshots --quiet
  latest=''
  for candidate in /backups/*; do
    [ -d "$candidate" ] && [ ! -L "$candidate" ] || continue
    name="${candidate##*/}"
    case "$name" in ''|*[!0-9TZ]*) continue;; esac
    [ -f "$candidate/SHA256SUMS" ] && [ -f "$candidate/manifest.txt" ] || continue
    latest="$candidate"
  done
  if [ -z "$latest" ]; then printf '尚無完整本機備份可上傳\n' >&2; exit 1; fi
  (cd "$latest" && sha256sum -c SHA256SUMS)
  restic backup --host kaiyolab --tag kaiyolab-complete "$latest"
  restic check
  printf '加密副本已完成；請另外定期執行還原驗證\n'
  if [ "${OFFSITE_RUN_ONCE:-false}" = true ]; then exit 0; fi
  sleep "$interval" &
  trap 'kill "$!" 2>/dev/null || true; exit 0' TERM INT
  wait "$!"
done
