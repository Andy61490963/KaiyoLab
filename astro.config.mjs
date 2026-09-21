import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

/**
 * 僅信任建置時明確指定的 HTTPS 網域，不接受萬用字元或網址子路徑。
 * HTTP 本機部署不需要代理標頭；正式部署的建置與執行必須使用相同 SITE_URL。
 * @param {string} value
 */
export function allowedDomainsForSite(value) {
  const site = new URL(value);
  if (
    !['http:', 'https:'].includes(site.protocol) ||
    site.username ||
    site.password ||
    site.hostname.includes('*') ||
    site.pathname !== '/' ||
    site.search ||
    site.hash
  ) {
    throw new Error(
      'SITE_URL 必須是完整的 http 或 https 網站來源，不能包含帳密、萬用字元、子路徑、查詢或片段。',
    );
  }
  if (site.protocol !== 'https:') return [];
  return [
    { hostname: site.hostname, protocol: 'https', ...(site.port ? { port: site.port } : {}) },
  ];
}

export default defineConfig({
  output: 'server',
  session: false,
  security: {
    checkOrigin: true,
    allowedDomains: allowedDomainsForSite(process.env.SITE_URL || 'http://localhost:4321'),
  },
  adapter: node({ mode: 'standalone', bodySizeLimit: 11 * 1024 * 1024 }),
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
  server: { port: 4321 },
});
