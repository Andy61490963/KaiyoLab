import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const mode = process.argv[2];
assert(['healthy', 'unavailable', 'recovered'].includes(mode), '必須指定維護驗證階段');
const base = 'http://proxy';
const expected = mode === 'unavailable' ? 503 : 200;
let ready = false;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    const response = await fetch(base, { signal: AbortSignal.timeout(3000) });
    await response.arrayBuffer();
    if (response.status === expected) {
      ready = true;
      break;
    }
  } catch {}
  await delay(200);
}
assert(ready, `Caddy 在 ${mode} 階段未回傳預期狀態 ${expected}`);

if (mode === 'unavailable') {
  for (const [path, method] of [
    ['/', 'GET'],
    ['/articles/example', 'GET'],
    ['/api/admin/entries', 'POST'],
    ['/', 'HEAD'],
  ]) {
    const response = await fetch(base + path, { method, signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 503, '暫停上游時須明確回傳 503');
    assert.equal(response.headers.get('retry-after'), '15', '維護回應須提供重試間隔');
    assert.equal(response.headers.get('cache-control'), 'no-store', '維護回應不得快取');
    assert.match(response.headers.get('content-type'), /text\/plain; charset=utf-8/i);
    const body = await response.text();
    if (method === 'HEAD') assert.equal(body, '');
    else assert.match(body, /網站暫時無法提供服務/);
    assert.doesNotMatch(body, /app:4321|dial tcp|connection refused/i, '不得暴露內部錯誤');
  }
} else {
  for (const status of [200, 401, 403, 404, 409, 500, 502, 503, 504]) {
    const response = await fetch(`${base}/${status}`, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, status, '應保留上游實際回傳的 HTTP 狀態');
    assert.equal(response.headers.get('x-fixture'), 'upstream');
    assert.equal(response.headers.get('retry-after'), null, '正常代理不得殘留維護標頭');
    assert.deepEqual(await response.json(), {
      status,
      host: 'proxy',
      forwardedHost: 'proxy',
      forwardedProto: 'http',
    });
  }
}
console.log(`Caddy ${mode} 階段驗證通過`);
