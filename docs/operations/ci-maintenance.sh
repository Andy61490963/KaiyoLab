#!/bin/sh
set -eu
if [ "${CI:-}" != "true" ]; then
  printf '此腳本僅適用於 CI 的獨立維護回應驗證\n' >&2
  exit 1
fi

# 使用獨立網路及測試容器，不停止 Compose 應用程式，不掛載資料硬碟
network="kaiyolab-ci-maintenance-$$"
upstream="$network-app"
proxy="$network-caddy"
root="$(pwd)"
image="$(docker compose images -q app | head -n 1)"
if [ -z "$image" ]; then
  printf '請先完成 CI 的應用程式映像建置\n' >&2
  exit 1
fi
cleanup() {
  result=$?
  trap - 0 HUP INT TERM
  if [ "$result" -ne 0 ]; then
    docker logs "$proxy" 2>&1 || true
    docker logs "$upstream" 2>&1 || true
  fi
  docker rm -f "$proxy" "$upstream" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  exit "$result"
}
trap cleanup 0
trap 'exit 1' HUP INT TERM

docker network create "$network" >/dev/null
docker run -d --name "$upstream" --network "$network" --network-alias app \
  --mount "type=bind,src=$root/docs/operations/maintenance-fixture.mjs,dst=/maintenance-fixture.mjs,readonly" \
  --entrypoint node "$image" /maintenance-fixture.mjs >/dev/null
docker run -d --name "$proxy" --network "$network" --network-alias proxy \
  -e DOMAIN=http://proxy \
  --mount "type=bind,src=$root/docs/Caddyfile,dst=/etc/caddy/Caddyfile,readonly" \
  caddy:2-alpine >/dev/null

verify() {
  docker run --rm --network "$network" \
    --mount "type=bind,src=$root/docs/operations/verify-maintenance.mjs,dst=/verify-maintenance.mjs,readonly" \
    --entrypoint node "$image" /verify-maintenance.mjs "$1"
}
verify healthy
docker stop -t 5 "$upstream" >/dev/null
verify unavailable
docker start "$upstream" >/dev/null
verify recovered
printf '真實 Caddy 維護回應、Retry-After、API 狀態保留與復原驗證完成\n'
