import { setTimeout as delay } from 'node:timers/promises';

const origin = new URL(process.env.PRODUCTION_URL);
if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/') {
  throw new Error('PRODUCTION_URL 必須是沒有帳密或子路徑的 HTTPS 網站來源。');
}
const revision = process.env.EXPECTED_REVISION;
if (!/^[a-f0-9]{40}$/.test(revision || '')) throw new Error('缺少完整的預期 Git 版本。');
const deadline = Date.now() + 20 * 60 * 1000;
let ready = false;
while (Date.now() < deadline) {
  try {
    const response = await fetch(new URL('/api/health', origin), {
      signal: AbortSignal.timeout(15000),
      headers: { 'cache-control': 'no-cache' },
      redirect: 'error',
    });
    const health = await response.json();
    if (response.ok && health.status === 'ok' && health.revision === revision) {
      ready = true;
      break;
    }
  } catch {
    // 部署切換期間容許短暫斷線，但不能把舊版健康狀態當成成功。
  }
  console.log('等待 Zeabur 上線指定版本…');
  await delay(15000);
}
if (!ready) throw new Error('指定版本未在 20 分鐘內健康上線，請檢查 Zeabur 建置與執行記錄。');
for (const path of ['/', '/articles', '/projects', '/about', '/rss.xml', '/sitemap.xml']) {
  const response = await fetch(new URL(path, origin), {
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`公開頁面 ${path} 回傳 ${response.status}。`);
  if (!(await response.text()).length) throw new Error(`公開頁面 ${path} 為空。`);
}
const privateResponse = await fetch(new URL('/api/admin/entries', origin), {
  signal: AbortSignal.timeout(15000),
  redirect: 'manual',
});
if (privateResponse.status !== 401)
  throw new Error(`管理 API 未拒絕訪客：${privateResponse.status}。`);
console.log(`正式部署驗證通過：${revision}；公開頁面可讀取，管理 API 拒絕訪客。`);
