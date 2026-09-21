import assert from 'node:assert/strict';
import sharp from 'sharp';

const base = 'http://127.0.0.1:4321';
const origin = 'https://ci.example.test';
const proxy = {
  Origin: origin,
  'X-Forwarded-Host': 'ci.example.test',
  'X-Forwarded-Proto': 'https',
};
let ready = false;
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    if ((await fetch(base + '/api/health')).ok) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 500));
}
assert(ready, 'HTTPS 代理驗證的應用程式未就緒。');
const credentials = { email: 'proxy@example.test', password: 'KaiyoLab-proxy-password-2026' };
const setup = await fetch(base + '/api/setup', {
  method: 'POST',
  headers: { ...proxy, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ...credentials,
    token: process.env.SETUP_TOKEN,
    name: '代理驗證站長',
    siteName: '代理驗證站',
  }),
});
assert.equal(setup.status, 200, '代理後的初始設定應成功。');
const login = await fetch(base + '/api/auth/sign-in/email', {
  method: 'POST',
  headers: { ...proxy, 'Content-Type': 'application/json' },
  body: JSON.stringify(credentials),
});
assert.equal(login.status, 200, '代理後應可登入。');
const cookie = login.headers
  .getSetCookie()
  .map((value) => value.split(';', 1)[0])
  .join('; ');
assert(cookie, '登入應提供 Session Cookie。');
const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#78dcd3' } })
  .png()
  .toBuffer();
function form() {
  const data = new FormData();
  data.set('file', new Blob([png], { type: 'image/png' }), '代理驗證圖片.png');
  data.set('alt', 'HTTPS 代理上傳驗證');
  return data;
}
const uploaded = await fetch(base + '/api/admin/media', {
  method: 'POST',
  headers: { ...proxy, Cookie: cookie },
  body: form(),
});
assert.equal(uploaded.status, 201, '可信 HTTPS 網域的 multipart 圖片上傳應成功。');
const invalidOrigin = await fetch(base + '/api/admin/media', {
  method: 'POST',
  headers: { ...proxy, Origin: 'https://untrusted.example.test', Cookie: cookie },
  body: form(),
});
assert.equal(invalidOrigin.status, 403, '不符 SITE_URL 的來源應被拒絕。');
const invalidHost = await fetch(base + '/api/admin/media', {
  method: 'POST',
  headers: { ...proxy, 'X-Forwarded-Host': 'untrusted.example.test', Cookie: cookie },
  body: form(),
});
assert.equal(invalidHost.status, 403, '未列入 Astro 白名單的代理網域應被拒絕。');
console.log('HTTPS 代理標頭、登入、圖片上傳及來源拒絕驗證完成。');
