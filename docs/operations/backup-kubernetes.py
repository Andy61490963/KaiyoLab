#!/usr/bin/env python3
"""在有 kubectl 的單節點 Linux 主機備份指定 KaiyoLab，不讀取其他服務資料"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import subprocess
import sys
import time
from urllib.parse import urlparse, unquote


def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs).stdout


def checked_backup_root(value):
    """先驗證實際路徑，呼叫端才能建立目錄或修改權限"""
    candidate = Path(value)
    message = '請提供不含父層跳轉或符號連結的專屬絕對備份目錄，例如 /var/backups/kaiyolab'
    if not candidate.is_absolute() or '..' in candidate.parts:
        raise RuntimeError(message)
    if any(part.is_symlink() for part in (candidate, *candidate.parents)):
        raise RuntimeError(message)
    resolved = candidate.resolve()
    if len(resolved.parts) < 4:
        raise RuntimeError(message)
    return resolved


def lock_ack(process, sql, pattern, timeout=10):
    """回覆必須來自同一個 psql 的查詢，不以程序仍存活代替資料庫確認"""
    process.stdin.write(sql.encode('ascii'))
    process.stdin.flush()
    selector = selectors.DefaultSelector()
    selector.register(process.stdout, selectors.EVENT_READ)
    output = b''
    deadline = time.monotonic() + timeout
    try:
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError('持鎖資料庫連線已結束')
            if not selector.select(timeout=1):
                continue
            chunk = os.read(process.stdout.fileno(), 4096)
            if not chunk:
                raise RuntimeError('持鎖資料庫連線已中斷')
            output += chunk
            if len(output) > 16384:
                raise RuntimeError('持鎖資料庫回覆無效')
            while b'\n' in output:
                line, output = output.split(b'\n', 1)
                text = line.decode('ascii').strip()
                if text == 'KAIYO_LOCK_LOST':
                    raise RuntimeError('原資料庫連線已失去內容鎖')
                matched = re.fullmatch(pattern, text)
                if matched:
                    return matched
        raise RuntimeError('等候持鎖資料庫確認逾時')
    finally:
        selector.close()


def finish_lock(process, backend_pid):
    # 檔案皆已關閉，確認原 PID 和鎖仍存在後立即解鎖
    # pg_locks 的 bigint advisory lock 620215 為 classid=0、objid=620215、objsubid=1
    sql = f"""SELECT CASE WHEN pg_backend_pid() = {int(backend_pid)} AND EXISTS (
      SELECT 1 FROM pg_locks WHERE pid = pg_backend_pid() AND locktype = 'advisory'
        AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
        AND classid = 0 AND objid = 620215 AND objsubid = 1
        AND mode = 'ExclusiveLock' AND granted
      ) THEN CASE WHEN pg_advisory_unlock(620215) THEN 'KAIYO_SNAPSHOT_VERIFIED'
          ELSE 'KAIYO_LOCK_LOST' END ELSE 'KAIYO_LOCK_LOST' END;\n"""
    lock_ack(process, sql, r'KAIYO_SNAPSHOT_VERIFIED')
    process.communicate(b'\\q\n', timeout=10)
    if process.returncode != 0:
        raise RuntimeError('持鎖資料庫連線未正常完成')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('namespace', 'app-deployment', 'database-deployment', 'backup-root'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--retention-days', type=int, default=14)
    args = parser.parse_args()
    if os.geteuid() != 0 or not 1 <= args.retention_days <= 3650:
        raise RuntimeError('必須以主機管理員執行，保留天數需介於 1 與 3650')
    for value in (args.namespace, args.app_deployment, args.database_deployment):
        if not re.fullmatch(r'[a-z0-9][a-z0-9-]+', value):
            raise RuntimeError('部署識別碼無效')
    root = checked_backup_root(args.backup_root)
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    root.chmod(0o700)
    kubectl = ['kubectl', '-n', args.namespace]
    read = lambda tail: json.loads(run(kubectl + tail + ['-o', 'json']))
    pods = read(['get', 'pods'])['items']

    def pod_for(deployment):
        selector = read(['get', 'deployment', deployment])['spec']['selector']['matchLabels']
        selected = [p for p in pods if all(p['metadata'].get('labels', {}).get(k) == v for k, v in selector.items())
                    and p['status'].get('phase') == 'Running'
                    and p['status'].get('containerStatuses')
                    and all(c.get('ready') for c in p['status']['containerStatuses'])]
        if len(selected) != 1:
            raise RuntimeError('指定部署未就緒或正在切換，稍後重試')
        return selected[0]

    app = pod_for(args.app_deployment)
    database = pod_for(args.database_deployment)
    app_name, db_name = app['metadata']['name'], database['metadata']['name']
    env = json.loads(run(kubectl + ['exec', app_name, '--', 'node', '-e',
        'process.stdout.write(JSON.stringify({url:process.env.DATABASE_URL,uploads:process.env.UPLOAD_DIR,secrets:process.env.SECRETS_DIR,operations:process.env.OPERATIONS_DIR}))']))
    parsed = urlparse(env['url'])
    db = unquote(parsed.path.lstrip('/'))
    if not re.fullmatch(r'[A-Za-z0-9_-]+', db) or not parsed.password:
        raise RuntimeError('無法核對資料庫名稱或備份還原所需密碼')

    def mounted_path(mount):
        container = app['spec']['containers'][0]
        match = next((v for v in container.get('volumeMounts', []) if v['mountPath'] == mount), None)
        if not match or match.get('subPath'):
            raise RuntimeError('只能備份已確認的完整持久磁碟掛載')
        volume = next(v for v in app['spec']['volumes'] if v['name'] == match['name'])
        pvc = read(['get', 'pvc', volume['persistentVolumeClaim']['claimName']])
        pv = json.loads(run(['kubectl', 'get', 'pv', pvc['spec']['volumeName'], '-o', 'json']))
        disk = pv['spec'].get('local', pv['spec'].get('hostPath', {})).get('path', '')
        path = Path(disk)
        if not path.is_absolute() or path.is_symlink() or args.namespace not in disk or not path.is_dir():
            raise RuntimeError('磁碟不在指定部署的本機持久空間')
        return path.resolve()

    media, secrets = mounted_path(env['uploads']), mounted_path(env['secrets'])
    expected_operations = env['uploads'].rstrip('/') + '/.operations'
    if env.get('operations') != expected_operations:
        raise RuntimeError('請先將 OPERATIONS_DIR 設定為 UPLOAD_DIR/.operations')
    operations = media / '.operations'
    operations.mkdir(mode=0o755, exist_ok=True)
    operations.chmod(0o755)

    def record(name, value):
        target = operations / name
        temporary = operations / (name + '.tmp')
        temporary.write_text(json.dumps(value), encoding='utf-8')
        temporary.chmod(0o644)
        temporary.replace(target)

    utc = lambda: dt.datetime.now(dt.timezone.utc)
    iso = lambda: utc().isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    lock = None
    try:
        # 保持同一個 psql 連線，鎖涵蓋資料庫與全部媒體備份
        lock = subprocess.Popen(kubectl + ['exec', '-i', db_name, '--', 'sh', '-c',
            'exec psql -U "$POSTGRES_USER" -d "$1" -X -qAt -w -v ON_ERROR_STOP=1', 'sh', db],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        locked = lock_ack(lock, "SET lock_timeout='30s'; SELECT pg_advisory_lock(620215);\n"
                          "SELECT 'KAIYO_LOCKED:' || pg_backend_pid();\n", r'KAIYO_LOCKED:(\d+)', 35)
        backend_pid = int(locked.group(1))
        stamp = utc().strftime('%Y%m%dT%H%M%S%fZ')
        partial = root / ('.partial-' + stamp)
        partial.mkdir(mode=0o700)
        with (partial / 'database.dump').open('wb') as dump:
            subprocess.run(kubectl + ['exec', db_name, '--', 'sh', '-c',
                'exec pg_dump -U "$POSTGRES_USER" -d "$1" --format=custom --no-owner --no-acl', 'sh', db],
                stdout=dump, check=True)
        run(['tar', '-czf', str(partial / 'uploads.tar.gz'), '-C', str(media), '.'])
        temporary_secrets = partial / '.secrets'
        shutil.copytree(secrets, temporary_secrets)
        (temporary_secrets / 'pg-password').write_text(unquote(parsed.password) + '\n', encoding='utf-8')
        (temporary_secrets / 'pg-password').chmod(0o444)
        run(['tar', '-czf', str(partial / 'secrets.tar.gz'), '-C', str(temporary_secrets), '.'])
        shutil.rmtree(temporary_secrets)
        # 偵測備份期間部署是否換了 Pod，避免將不完整快照列為成功
        if lock.poll() is not None or read(['get', 'pod', app_name])['metadata']['uid'] != app['metadata']['uid']:
            raise RuntimeError('備份期間部署已切換，請重新備份')
        (partial / 'manifest.txt').write_text('KaiyoLab 備份\nUTC=' + stamp + '\nPostgreSQL=18\n', encoding='utf-8')
        names = ['database.dump', 'uploads.tar.gz', 'secrets.tar.gz', 'manifest.txt']
        hashes = []
        for name in names:
            with (partial / name).open('rb') as handle:
                hashes.append(hashlib.file_digest(handle, 'sha256').hexdigest() + '  ' + name)
        (partial / 'SHA256SUMS').write_text('\n'.join(hashes) + '\n', encoding='utf-8')
        run(['sha256sum', '-c', 'SHA256SUMS'], cwd=partial)
        # 查詢確認、解鎖及 psql exit 全部成功後，才發布完整備份與成功時間
        finish_lock(lock, backend_pid)
        lock = None
        partial.rename(root / stamp)
        record('.last-backup.json', {'operation': 'backup', 'completedAt': iso()})
        print('指定網站的資料庫、圖片與密鑰備份完成：' + str(root / stamp))
        # 只清理此專用根目錄下本工具產生的過期完整備份
        for item in root.iterdir():
            if (item.is_symlink() or not item.is_dir() or not re.fullmatch(r'\d{8}T\d{12}Z', item.name)
                    or not (item / 'SHA256SUMS').is_file() or not (item / 'manifest.txt').is_file()):
                continue
            if item.resolve().parent != root or (item / 'manifest.txt').read_text().splitlines()[0] != 'KaiyoLab 備份':
                continue
            if time.time() - item.stat().st_mtime > args.retention_days * 86400:
                shutil.rmtree(item)
    except Exception:
        record('.last-backup-failure.json', {'operation': 'backup', 'failedAt': iso()})
        raise
    finally:
        if lock and lock.poll() is None:
            try:
                lock.communicate(b'\\q\n', timeout=10)
            except (subprocess.TimeoutExpired, BrokenPipeError, OSError):
                lock.kill()
                lock.wait()


if __name__ == '__main__':
    os.umask(0o077)
    try:
        main()
    except Exception as error:
        # 只顯示錯誤類型，避免資料庫 URL 或憑證進入排程日誌
        print('備份失敗：' + type(error).__name__ + '；請核對部署狀態、磁碟與備份目錄', file=sys.stderr)
        sys.exit(1)
