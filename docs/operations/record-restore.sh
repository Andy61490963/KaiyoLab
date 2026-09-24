#!/bin/sh
set -eu
# 只在登入、公開內容、圖片及資料完整性驗證成功後執行
umask 077
mkdir -p /backups/.operations
chmod 755 /backups/.operations
printf '{"operation":"restore","completedAt":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /backups/.operations/.last-restore.json.tmp
chmod 644 /backups/.operations/.last-restore.json.tmp
mv /backups/.operations/.last-restore.json.tmp /backups/.operations/.last-restore.json
printf '已記錄還原驗證完成時間\n'
