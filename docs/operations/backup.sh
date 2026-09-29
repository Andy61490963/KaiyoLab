#!/bin/sh
set -eu
umask 077
mkdir -p /backups/.operations
chmod 755 /backups/.operations
record_failure() {
  result=$?
  if [ "$result" -ne 0 ]; then
    temporary="$(mktemp /backups/.operations/.last-backup-failure.XXXXXX)"
    printf '{"operation":"backup","failedAt":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)" > "$temporary"
    chmod 644 "$temporary"
    mv "$temporary" /backups/.operations/.last-backup-failure.json
    printf '備份失敗，請查看容器日誌；上次成功備份仍保留\n' >&2
  fi
}
trap record_failure EXIT
export PGPASSWORD="$(cat /secrets/pg-password)"
export KAIYO_BACKUP_STAMP="$(date -u +%Y%m%dT%H%M%S%NZ)"
export PGAPPNAME="${PGAPPNAME:-kaiyolab-backup}"
# 與內容寫入共用鎖，整段資料庫與檔案快照期間禁止內容及媒體變更
# psql 的同一個連線必須活到檔案備份結束，不能以另一個命令提早釋放
psql -X -q -w -v ON_ERROR_STOP=1 <<'SQL'
SET lock_timeout = '30s';
SELECT pg_advisory_lock(620215);
SELECT pg_backend_pid() AS backup_lock_pid \gset
\! sh /operations/backup-data.sh
\if :SHELL_ERROR
  SELECT 1 / 0;
\endif
-- psql 等待子程序時，程序存活不代表資料庫連線仍持有鎖
-- 即使發生重新連線，也必須同時符合原本的 PID 與鎖識別碼
SELECT pg_backend_pid() = :backup_lock_pid AND EXISTS (
  SELECT 1 FROM pg_locks
  WHERE pid = pg_backend_pid() AND locktype = 'advisory'
    AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
    AND classid = 0 AND objid = 620215 AND objsubid = 1
    AND mode = 'ExclusiveLock' AND granted
) AS backup_lock_valid \gset
\if :backup_lock_valid
  SELECT pg_advisory_unlock(620215) AS backup_unlocked \gset
  \if :backup_unlocked
    \echo KAIYO_SNAPSHOT_VERIFIED
  \else
    SELECT 1 / 0;
  \endif
\else
  SELECT 1 / 0;
\endif
SQL
# 檔案已完整關閉且原持鎖連線成功結束，現在才讓異地備份看見它
sh /operations/backup-finalize.sh
