#!/bin/sh
set -eu
if [ "${CI:-}" != "true" ]; then
  printf '此腳本僅適用於 CI 的空白測試資料庫。\n' >&2
  exit 1
fi
export SITE_URL=https://ci.example.test
export HOST=127.0.0.1
export PORT=4321
log_path="$(mktemp)"
node scripts/start.mjs > "$log_path" 2>&1 &
server_pid=$!
cleanup() {
  result=$?
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
  if [ "$result" -ne 0 ]; then cat "$log_path"; fi
  rm -f "$log_path"
  exit "$result"
}
trap cleanup 0
trap 'exit 1' HUP INT TERM
node docs/operations/verify-https.mjs
