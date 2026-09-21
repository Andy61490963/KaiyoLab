import { describe, expect, it } from 'vitest';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { createRequest } from 'astro/app/node';
import { isForbiddenCrossOriginRequest } from '../node_modules/astro/dist/core/app/origin-check.js';
import { validateForwardedHeaders } from '../node_modules/astro/dist/core/app/validate-headers.js';
import config, { allowedDomainsForSite } from '../astro.config.mjs';

// 使用目前鎖定的 Astro Node adapter，檢查代理來源解析與內建 CSRF 邊界。
function proxyRequest(siteUrl: string, headers: Record<string, string>) {
  const socket = new Socket();
  const incoming = new IncomingMessage(socket);
  incoming.method = 'POST';
  incoming.url = '/api/admin/media';
  incoming.headers = { 'content-type': 'multipart/form-data; boundary=kaiyo-test', ...headers };
  incoming.push(null);
  const request = createRequest(incoming, {
    allowedDomains: allowedDomainsForSite(siteUrl),
    port: 4321,
  });
  const forbidden = isForbiddenCrossOriginRequest(request, new URL(request.url), false);
  socket.destroy();
  return { request, forbidden };
}

describe('固定 SITE_URL 的精確 HTTPS 代理來源', () => {
  it('維持 Astro Origin 保護，HTTP 本機不信任代理標頭', () => {
    expect(config.security?.checkOrigin).toBe(true);
    expect(allowedDomainsForSite('http://localhost:4321')).toEqual([]);
    const result = proxyRequest('http://localhost:4321', {
      host: 'localhost:4321',
      origin: 'https://evil.example',
      'x-forwarded-host': 'evil.example',
      'x-forwarded-proto': 'https',
    });
    expect(result.request.url).toBe('http://localhost:4321/api/admin/media');
    expect(result.forbidden).toBe(true);
  });

  it('允許來自精確 HTTPS 網域的合法代理 multipart 請求', () => {
    expect(allowedDomainsForSite('https://blog.example.com')).toEqual([
      { hostname: 'blog.example.com', protocol: 'https' },
    ]);
    const result = proxyRequest('https://blog.example.com', {
      host: 'app:4321',
      origin: 'https://blog.example.com',
      'x-forwarded-host': 'blog.example.com',
      'x-forwarded-proto': 'https',
    });
    expect(result.request.url).toBe('https://blog.example.com/api/admin/media');
    expect(result.forbidden).toBe(false);
  });

  it('未知 forwarded host 會被忽略，不能使跨站來源通過', () => {
    const allowedDomains = allowedDomainsForSite('https://blog.example.com');
    expect(
      validateForwardedHeaders('https', 'evil.example', undefined, allowedDomains).host,
    ).toBeUndefined();
    const result = proxyRequest('https://blog.example.com', {
      host: 'app:4321',
      origin: 'https://evil.example',
      'x-forwarded-host': 'evil.example',
      'x-forwarded-proto': 'https',
    });
    expect(new URL(result.request.url).hostname).not.toBe('evil.example');
    expect(result.forbidden).toBe(true);
  });

  it('合法代理網域仍拒絕其他網站送出的寫入請求', () => {
    const result = proxyRequest('https://blog.example.com', {
      host: 'app:4321',
      origin: 'https://evil.example',
      'x-forwarded-host': 'blog.example.com',
      'x-forwarded-proto': 'https',
    });
    expect(result.forbidden).toBe(true);
  });

  it('HTTPS 非預設連接埠必須吻合，預設 443 由 URL 正規化', () => {
    expect(allowedDomainsForSite('https://blog.example.com:443')).toEqual([
      { hostname: 'blog.example.com', protocol: 'https' },
    ]);
    expect(allowedDomainsForSite('https://blog.example.com:8443')).toEqual([
      { hostname: 'blog.example.com', protocol: 'https', port: '8443' },
    ]);
    const result = proxyRequest('https://blog.example.com:8443', {
      host: 'app:4321',
      origin: 'https://blog.example.com:8443',
      'x-forwarded-host': 'blog.example.com:8443',
      'x-forwarded-proto': 'https',
    });
    expect(result.request.url).toBe('https://blog.example.com:8443/api/admin/media');
    expect(result.forbidden).toBe(false);
    expect(
      validateForwardedHeaders(
        'https',
        'blog.example.com:9443',
        undefined,
        allowedDomainsForSite('https://blog.example.com:8443'),
      ).host,
    ).toBeUndefined();
  });

  it.each([
    'https://*.example.com',
    'https://user:password@example.com',
    'https://example.com/subpath',
    'https://example.com?key=value',
    'https://example.com#fragment',
    'ftp://example.com',
  ])('拒絕非網站來源設定：%s', (value) => {
    expect(() => allowedDomainsForSite(value)).toThrow();
  });
});
