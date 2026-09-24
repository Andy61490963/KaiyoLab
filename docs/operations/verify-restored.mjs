import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const base = 'http://localhost:4321';
const login = await fetch(base + '/api/auth/sign-in/email', {
  method: 'POST',
  headers: { Origin: base, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: process.env.E2E_EMAIL || 'e2e@example.test',
    password: process.env.E2E_PASSWORD || 'KaiyoLab-e2e-password-2026',
  }),
});
assert.equal(login.status, 200, '還原後應可使用原站長帳號登入。');
const cookie = login.headers
  .getSetCookie()
  .map((value) => value.split(';', 1)[0])
  .join('; ');
assert(cookie, '還原後登入應建立 Session。');
const dashboard = await fetch(base + '/api/admin/dashboard', { headers: { Cookie: cookie } });
assert.equal(dashboard.status, 200, '還原後應可讀取私人管理總覽。');
for (const route of ['/', '/rss.xml']) {
  const response = await fetch(base + route);
  assert.equal(response.status, 200, '還原後的公開網站及 RSS 應可閱讀。');
  assert(
    (await response.text()).includes('Astro SSR 與 PostgreSQL 的部署筆記'),
    '還原後應保留瀏覽器驗收所發布的文章。',
  );
}
console.log('還原後的站長登入、私人總覽、首頁與 RSS 閱讀驗證完成。');

let recoveryOutput;
try {
  recoveryOutput = execFileSync(
    'docker',
    ['compose', '-p', 'kaiyolab-ci-restore', 'exec', '-T', 'app', 'npm', 'run', 'account:recover'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
} catch {
  throw new Error('還原環境的帳號復原指令執行失敗。');
}
const recoveredPassword = recoveryOutput.match(/一次性使用的新密碼：([^\r\n]+)/u)?.[1]?.trim();
assert(recoveredPassword, '帳號復原應產生新的隨機密碼。');
const expired = await fetch(base + '/api/admin/dashboard', { headers: { Cookie: cookie } });
assert.equal(expired.status, 401, '密碼復原後舊 Session 必須失效。');
async function signIn(password) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(base + '/api/auth/sign-in/email', {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: process.env.E2E_EMAIL || 'e2e@example.test', password }),
    });
    if (response.status !== 429 || attempt === 1) return response;
    // E2E 與還原驗證可能共用登入額度，遵守限流窗口再試一次。
    const seconds = Number(response.headers.get('retry-after')) || 60;
    await new Promise((resolve) => setTimeout(resolve, Math.min(Math.max(seconds, 1), 60) * 1000));
  }
}
const oldPassword = await signIn(process.env.E2E_PASSWORD || 'KaiyoLab-e2e-password-2026');
assert.equal(oldPassword.status, 401, '復原後原密碼必須失效。');
const newPassword = await signIn(recoveredPassword);
assert.equal(newPassword.status, 200, '復原後應可使用新密碼登入。');
const newCookie = newPassword.headers
  .getSetCookie()
  .map((value) => value.split(';', 1)[0])
  .join('; ');
assert(newCookie, '新密碼登入應建立有效 Session。');
assert.equal(
  (await fetch(base + '/api/admin/dashboard', { headers: { Cookie: newCookie } })).status,
  200,
  '新密碼登入後應可使用後台。',
);
console.log('帳號復原、新密碼登入、舊密碼及舊 Session 失效驗證完成。');
execFileSync(
  'docker',
  [
    'compose',
    '-p',
    'kaiyolab-ci-restore',
    '--profile',
    'maintenance',
    'run',
    '--rm',
    '--no-deps',
    '--entrypoint',
    'sh',
    'backup',
    '/operations/record-restore.sh',
  ],
  { stdio: 'inherit' },
);
const system = await fetch(base + '/api/admin/system', { headers: { Cookie: newCookie } });
assert.equal(system.status, 200);
const records = await system.json();
assert.equal(records.backup.status, 'recorded', '應顯示成功備份紀錄');
assert.equal(records.restore.status, 'recorded', '應顯示已完成還原驗證紀錄');
