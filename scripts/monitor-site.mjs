import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { appendFile } from 'node:fs/promises';

export function monitorOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('PRODUCTION_URL 必須是沒有帳密、查詢或子路徑的 HTTPS 來源');
  }
  return url;
}

export async function checkSite(origin, request = fetch) {
  const routes = ['/api/health', '/', '/login', '/api/admin/entries'];
  return Promise.all(
    routes.map(async (route) => {
      const started = performance.now();
      try {
        const response = await request(new URL(route, origin), {
          signal: AbortSignal.timeout(15000),
          redirect: 'manual',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (response.status !== (route === '/api/admin/entries' ? 401 : 200))
          throw new Error(`HTTP ${response.status}`);
        if (route === '/api/health') {
          const data = await response.json();
          if (data.status !== 'ok') throw new Error('資料庫健康檢查失敗');
        } else if (route !== '/api/admin/entries') {
          const body = await response.text();
          if (
            !response.headers.get('content-type')?.includes('text/html') ||
            !/<html[\s>]/i.test(body)
          ) {
            throw new Error('未收到有效網站頁面');
          }
        } else await response.body?.cancel();
        return { route, ok: true, milliseconds: Math.round(performance.now() - started) };
      } catch (error) {
        // 不把回應內容、憑證或遠端堆疊寫入公開 Actions 日誌
        const detail = error?.message?.startsWith('HTTP ')
          ? error.message
          : '連線、格式或服務狀態異常';
        return { route, ok: false, milliseconds: Math.round(performance.now() - started), detail };
      }
    }),
  );
}

async function main() {
  const origin = monitorOrigin(process.env.PRODUCTION_URL);
  let results;
  for (let attempt = 1; attempt <= 3; attempt++) {
    results = await checkSite(origin);
    if (results.every((result) => result.ok)) break;
    console.log(
      `第 ${attempt} 次檢查未通過：${results
        .filter((result) => !result.ok)
        .map((result) => `${result.route} ${result.detail}`)
        .join('、')}`,
    );
    if (attempt < 3) await delay(10000);
  }
  const summary = `檢查時間：${new Date().toISOString()}\n\n| 路徑 | 結果 | 毫秒 |\n| --- | --- | --- |\n${results.map((result) => `| ${result.route} | ${result.ok ? '通過' : result.detail} | ${result.milliseconds} |`).join('\n')}\n`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  if (results.some((result) => !result.ok)) throw new Error('網站外部監測失敗，請查看本次執行摘要');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
