#!/bin/sh
set -eu
[ "${CI:-}" = true ] && [ "${COMPOSE_PROJECT_NAME:-}" = kaiyolab-ci ]
docker compose stop backup-scheduler
storage_permissions() {
  docker compose exec -T app node -e 'const fs=require("node:fs"),p=require("node:path");const dir=process.env.UPLOAD_DIR;const stat=fs.statSync(dir);const probe=p.join(dir,".ci-backup-write-probe");fs.writeFileSync(probe,"ok",{flag:"wx"});fs.unlinkSync(probe);console.log(JSON.stringify({uid:stat.uid,gid:stat.gid,mode:stat.mode}));'
}
storage_before="$(storage_permissions)"
# 確認失敗不會改寫最近成功紀錄，並驗證 psql 會傳遞子程序失敗
mkdir -p .local/ci-backup
printf '#!/bin/sh\nexit 53\n' > .local/ci-backup/failure.sh
docker compose --profile maintenance run --rm backup
test "$storage_before" = "$(storage_permissions)"
before="$(cat backups/.operations/.last-backup.json)"
if docker compose --profile maintenance run --rm -v "$PWD/.local/ci-backup/failure.sh:/operations/backup-data.sh:ro" backup; then
  printf '備份子程序失敗卻回報成功\n' >&2
  exit 1
fi
test "$before" = "$(cat backups/.operations/.last-backup.json)"
node -e "const v=JSON.parse(require('fs').readFileSync('backups/.operations/.last-backup-failure.json')); if(v.operation!=='backup'||!Number.isFinite(Date.parse(v.failedAt)))process.exit(1)"
# 快照已寫完但持鎖連線遭終止時，仍只能留下 .partial，不可公告成功
cat > .local/ci-backup/terminate-lock.sh <<'SH'
#!/bin/sh
set -eu
sh /tmp/backup-data-real.sh
terminated="$(psql -XAt -w -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name='kaiyo-backup-terminated' AND pid <> pg_backend_pid()")"
test "$terminated" = t
SH
complete_before="$(find backups -mindepth 1 -maxdepth 1 -type d ! -name '.*' -printf '%f\n' | sort)"
partial_before="$(find backups -mindepth 1 -maxdepth 1 -type d -name '.partial-*' -printf '%f\n' | sort)"
if docker compose --profile maintenance run --rm --no-deps \
  -e PGAPPNAME=kaiyo-backup-terminated \
  -v "$PWD/.local/ci-backup/terminate-lock.sh:/operations/backup-data.sh:ro" \
  -v "$PWD/docs/operations/backup-data.sh:/tmp/backup-data-real.sh:ro" backup; then
  printf '持鎖連線中斷卻回報備份成功\n' >&2
  exit 1
fi
test "$before" = "$(cat backups/.operations/.last-backup.json)"
test "$complete_before" = "$(find backups -mindepth 1 -maxdepth 1 -type d ! -name '.*' -printf '%f\n' | sort)"
test "$partial_before" != "$(find backups -mindepth 1 -maxdepth 1 -type d -name '.partial-*' -printf '%f\n' | sort)"
# Python 主機版使用相同資料庫確認協定，以真實 PostgreSQL 驗證成功與斷線
python3 - <<'PY'
import importlib.util
from pathlib import Path
import subprocess
import tempfile

spec = importlib.util.spec_from_file_location('backup_kubernetes', 'docs/operations/backup-kubernetes.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)
with tempfile.TemporaryDirectory(prefix='kaiyo-backup-root-') as temporary:
    base = Path(temporary)
    valid = base / 'backups'
    assert backup.checked_backup_root(valid) == valid.resolve()
    (base / 'linked').symlink_to(base, target_is_directory=True)
    for invalid in ('/', '/etc', '/var/backups/../../etc', valid / '..', base / 'linked' / 'backups'):
        try:
            backup.checked_backup_root(invalid)
        except RuntimeError:
            pass
        else:
            raise AssertionError('危險備份路徑不應通過檢查')
    assert not valid.exists(), '路徑檢查本身不得建立或修改目錄'
command = ['docker', 'compose', 'exec', '-T', 'db', 'psql', '-U', 'kaiyo', '-d', 'kaiyolab', '-XqAtw', '-v', 'ON_ERROR_STOP=1']
for scenario in ('healthy', 'terminated', 'wrong-pid'):
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    try:
        match = backup.lock_ack(process, "SET lock_timeout='5s'; SELECT pg_advisory_lock(620215);\nSELECT 'KAIYO_LOCKED:' || pg_backend_pid();\n", r'KAIYO_LOCKED:(\d+)')
        pid = int(match.group(1))
        if scenario == 'terminated':
            killed = subprocess.run(command + ['-c', f'SELECT pg_terminate_backend({pid})'], check=True, capture_output=True)
            assert killed.stdout.strip() == b't'
        try:
            backup.finish_lock(process, pid + (1 if scenario == 'wrong-pid' else 0))
        except (RuntimeError, BrokenPipeError):
            assert scenario != 'healthy', '健康連線不應被拒絕'
        else:
            assert scenario == 'healthy', '斷線或錯誤 PID 不得通過確認'
            assert process.returncode == 0
    finally:
        if process.poll() is None:
            try:
                process.communicate(b'\\q\n', timeout=10)
            except (subprocess.TimeoutExpired, BrokenPipeError):
                process.kill()
                process.wait()
print('Python 備份鎖確認、連線中斷及 PID 防護驗證完成')
PY
# 備份必須等候內容鎖，不得跨過正在寫入的交易
docker compose exec -T -e PGAPPNAME=kaiyo-backup-lock-test db psql -U kaiyo -d kaiyolab -c 'SELECT pg_advisory_lock(620215); SELECT pg_sleep(6);' > /dev/null &
holder=$!
for attempt in 1 2 3 4 5; do
  locked="$(docker compose exec -T db psql -U kaiyo -d kaiyolab -Atc "SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name='kaiyo-backup-lock-test' AND l.locktype='advisory' AND l.granted")"
  if [ "$locked" = 1 ]; then break; fi
  sleep 1
done
test "$locked" = 1
start="$(date +%s)"
docker compose --profile maintenance run --rm backup
end="$(date +%s)"
wait "$holder"
test "$((end-start))" -ge 2
# 重啟排程不重複備份，過期時會執行新快照
before="$(cat backups/.operations/.last-backup.json)"
docker compose run --rm --no-deps -e BACKUP_RUN_ONCE=true backup-scheduler
test "$before" = "$(cat backups/.operations/.last-backup.json)"
docker compose --profile maintenance run --rm --no-deps --entrypoint sh backup -c 'touch -d "2 days ago" /backups/.operations/.last-backup.json'
docker compose run --rm --no-deps -e BACKUP_RUN_ONCE=true backup-scheduler
test "$before" != "$(cat backups/.operations/.last-backup.json)"
test "$storage_before" = "$(storage_permissions)"
printf '自動備份、鎖定、失敗紀錄及重啟週期驗證完成\n'
