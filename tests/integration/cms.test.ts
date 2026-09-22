import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import type { Entry, Media, Taxonomy } from '../../src/lib/types';

const enabled = !!process.env.DATABASE_URL;

describe.skipIf(!enabled)('真實 PostgreSQL 的 CMS 流程', () => {
  let admin: pg.Pool;
  let databaseName: string;
  let database: typeof import('../../src/lib/db');
  let setup: typeof import('../../src/pages/api/setup');
  let api: typeof import('../../src/pages/api/admin/[...path]');
  let auth: typeof import('../../src/pages/api/auth/[...all]');
  let mediaRoute: typeof import('../../src/pages/media/[file]');
  let content: typeof import('../../src/lib/content');
  let middleware: typeof import('../../src/middleware');
  let cookie = '';
  let dir: string;
  let entry: Entry;
  let uploadedImage: Media;
  const origin = 'http://localhost:4321';

  interface CallOptions {
    anonymous?: boolean;
    origin?: string;
    form?: FormData;
    headers?: Record<string, string>;
    clientAddress?: string;
  }

  async function call(
    route: string,
    method = 'GET',
    payload?: unknown,
    options: CallOptions = {},
  ): Promise<Response> {
    const headers = new Headers(options.headers);
    if (!options.anonymous && cookie) headers.set('Cookie', cookie);
    if (method !== 'GET') headers.set('Origin', options.origin || origin);
    if (payload !== undefined) headers.set('Content-Type', 'application/json');
    const request = new Request(origin + route, {
      method,
      headers,
      body: options.form || (payload === undefined ? undefined : JSON.stringify(payload)),
    });
    const ctx: any = {
      request,
      url: new URL(request.url),
      params: { path: route.replace('/api/admin/', ''), file: route.replace('/media/', '') },
      clientAddress: options.clientAddress || '127.0.0.1',
      locals: {},
      redirect: (url: string) => new Response(null, { status: 302, headers: { Location: url } }),
    };
    const result = await middleware.onRequest(ctx, async () => {
      if (route === '/api/setup') return setup.POST!(ctx);
      if (route.startsWith('/api/auth/')) return auth.ALL!(ctx);
      if (route.startsWith('/media/')) return mediaRoute.GET!(ctx);
      return api.ALL!(ctx);
    });
    if (!(result instanceof Response)) throw new Error('請求未回傳 Response');
    return result;
  }

  async function entryResponse(response: Response): Promise<Entry> {
    expect(response.status).toBeLessThan(300);
    return response.json() as Promise<Entry>;
  }

  beforeAll(async () => {
    const source = process.env.DATABASE_URL!;
    admin = new pg.Pool({ connectionString: source });
    databaseName = `kaiyo_test_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE ${databaseName}`);
    const url = new URL(source);
    url.pathname = `/${databaseName}`;
    process.env.DATABASE_URL = url.href;
    process.env.SITE_URL = origin;
    process.env.BETTER_AUTH_SECRET = 'integration-only-secret-000000000000000000000';
    process.env.SETUP_TOKEN = 'integration-only-setup-0000000000000000000000';
    dir = await mkdtemp(path.join(os.tmpdir(), 'kaiyo-tests-'));
    process.env.UPLOAD_DIR = dir;
    database = await import('../../src/lib/db');
    await database
      .getPool()
      .query(
        await readFile(new URL('../../db/migrations/001_initial.sql', import.meta.url), 'utf8'),
      );
    setup = await import('../../src/pages/api/setup');
    api = await import('../../src/pages/api/admin/[...path]');
    auth = await import('../../src/pages/api/auth/[...all]');
    mediaRoute = await import('../../src/pages/media/[file]');
    content = await import('../../src/lib/content');
    middleware = await import('../../src/middleware');
  });

  afterAll(async () => {
    if (database) await database.getPool().end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      await admin.end();
    }
    if (dir) {
      const resolved = path.resolve(dir);
      const expectedRoot = path.resolve(os.tmpdir()) + path.sep;
      if (!resolved.startsWith(expectedRoot) || !path.basename(resolved).startsWith('kaiyo-tests-'))
        throw new Error('拒絕清除測試暫存目錄以外的路徑。');
      await rm(resolved, { recursive: true, force: true });
    }
  });

  it('初始化具原子性，並行請求只能建立一位站長', async () => {
    const input = {
      token: process.env.SETUP_TOKEN,
      email: 'owner@example.com',
      password: 'integration-password-123',
      name: '測試站長',
      siteName: '測試實驗室',
    };
    const responses = await Promise.all([
      call('/api/setup', 'POST', input),
      call('/api/setup', 'POST', input),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await database.getPool().query('SELECT count(*) FROM "user"')).rows[0].count).toBe('1');
  });

  it('訪客無法管理，跨來源請求被拒絕，一般註冊關閉', async () => {
    expect((await call('/api/admin/entries', 'GET', undefined, { anonymous: true })).status).toBe(
      401,
    );
    expect(
      (
        await call(
          '/api/admin/entries',
          'POST',
          { kind: 'article' },
          { origin: 'https://evil.example' },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call('/api/auth/sign-up/email', 'POST', {
          name: '第二位',
          email: 'other@example.com',
          password: 'integration-password-123',
        })
      ).status,
    ).toBe(403);
  });

  it('站長可登入取得資料庫 Session', async () => {
    const result = await call('/api/auth/sign-in/email', 'POST', {
      email: 'owner@example.com',
      password: 'integration-password-123',
    });
    expect(result.status).toBe(200);
    cookie = result.headers
      .getSetCookie()
      .map((v) => v.split(';')[0])
      .join('; ');
    expect(cookie).toContain('session_token');
    expect((await call('/api/admin/dashboard')).status).toBe(200);
  });

  it('草稿不公開，發布後才出現在搜尋與內容頁', async () => {
    entry = await entryResponse(await call('/api/admin/entries', 'POST', { kind: 'article' }));
    entry = await entryResponse(
      await call(`/api/admin/entries/${entry.id}`, 'PATCH', {
        version: entry.version,
        content: {
          ...entry.content,
          title: '海洋與星空',
          slug: 'ocean',
          body: '# 公開內容\n\n探索宇宙。',
          tags: ['實驗'],
          category: '研究',
        },
      }),
    );
    expect((await content.listPublished({ kind: 'article' })).total).toBe(0);
    entry = await entryResponse(
      await call(`/api/admin/entries/${entry.id}/action`, 'POST', {
        action: 'publish',
        version: entry.version,
      }),
    );
    expect((await content.listPublished({ kind: 'article', q: '海洋' })).total).toBe(1);
    expect((await content.getPublished('article', 'ocean'))?.body).toContain('公開內容');
  });

  it('已發布的修改不洩漏，過期版本回傳 409', async () => {
    const oldVersion = entry.version;
    entry = await entryResponse(
      await call(`/api/admin/entries/${entry.id}`, 'PATCH', {
        version: entry.version,
        content: { ...entry.content, title: '秘密草稿', body: '尚未公開的修訂' },
      }),
    );
    expect((await content.getPublished('article', 'ocean'))?.title).toBe('海洋與星空');
    expect((await content.listPublished({ kind: 'article', q: '秘密' })).total).toBe(0);
    expect(
      (
        await call(`/api/admin/entries/${entry.id}`, 'PATCH', {
          version: oldVersion,
          content: entry.content,
        })
      ).status,
    ).toBe(409);
  });

  it('圖片會轉成 WebP 並阻止刪除使用中的媒體', async () => {
    const png = await sharp({
      create: { width: 30, height: 30, channels: 3, background: '#44ccff' },
    })
      .png()
      .toBuffer();
    const form = new FormData();
    form.set('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), '圖片.png');
    form.set('alt', '測試圖片');
    const response = await call('/api/admin/media', 'POST', undefined, { form });
    expect(response.status).toBe(201);
    uploadedImage = (await response.json()) as Media;
    expect(uploadedImage.mime).toBe('image/webp');
    entry = await entryResponse(
      await call(`/api/admin/entries/${entry.id}`, 'PATCH', {
        version: entry.version,
        content: { ...entry.content, cover: uploadedImage.url },
      }),
    );
    expect((await call(`/api/admin/media/${uploadedImage.id}`, 'DELETE')).status).toBe(409);
    const invalid = new FormData();
    invalid.set('file', new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'x.svg');
    expect((await call('/api/admin/media', 'POST', undefined, { form: invalid })).status).toBe(400);
  });

  it('分類改名更新引用且防止刪除使用中的分類', async () => {
    const taxa = (await (await call('/api/admin/taxonomies')).json()) as { categories: Taxonomy[] };
    const category = taxa.categories.find((item) => item.name === '研究');
    expect(category).toBeDefined();
    expect((await call(`/api/admin/taxonomies/${category!.id}`, 'DELETE')).status).toBe(409);
    expect(
      (
        await call(`/api/admin/taxonomies/${category!.id}`, 'PATCH', {
          name: '技術研究',
          slug: 'research',
        })
      ).status,
    ).toBe(200);
    expect((await content.getPublished('article', 'ocean'))?.category).toBe('技術研究');
  });

  it('垃圾桶與還原不會意外重新公開', async () => {
    entry = await entryResponse(await call(`/api/admin/entries/${entry.id}`));
    entry = await entryResponse(
      await call(`/api/admin/entries/${entry.id}/action`, 'POST', {
        action: 'trash',
        version: entry.version,
      }),
    );
    expect(await content.getPublished('article', 'ocean')).toBeNull();
    entry = await entryResponse(
      await call(`/api/admin/entries/${entry.id}/action`, 'POST', {
        action: 'restore',
        version: entry.version,
      }),
    );
    expect(entry.deletedAt).toBeNull();
    expect(entry.published).toBeNull();
  });

  it('C++ 與 C# 的標籤名稱不會因網址代稱相同而遺失', async () => {
    let draft = await entryResponse(await call('/api/admin/entries', 'POST', { kind: 'article' }));
    draft = await entryResponse(
      await call(`/api/admin/entries/${draft.id}`, 'PATCH', {
        version: draft.version,
        content: {
          ...draft.content,
          title: '語言研究筆記',
          slug: 'language-notes',
          body: '比較兩種程式語言。',
          category: '程式語言草稿',
          tags: ['C++', 'C#'],
        },
      }),
    );
    const stored = await content.listTaxonomies(false);
    const languageTags = stored.tags.filter((item) => ['C++', 'C#'].includes(item.name));
    expect(languageTags.map((item) => item.name).sort()).toEqual(['C#', 'C++']);
    expect(new Set(languageTags.map((item) => item.slug)).size).toBe(2);
    expect((await call('/api/admin/taxonomies')).status).toBe(200);
    const adminTaxonomies = (await (await call('/api/admin/taxonomies')).json()) as {
      tags: Taxonomy[];
    };
    expect(adminTaxonomies.tags.map((item) => item.name)).toEqual(
      expect.arrayContaining(['C++', 'C#']),
    );
  });

  it('公開分類僅來自發布快照，草稿及未發布的分類修改不外洩', async () => {
    const initialTaxonomies = await content.listTaxonomies();
    expect(initialTaxonomies.categories.map((item) => item.name)).not.toContain('程式語言草稿');
    expect(initialTaxonomies.tags.map((item) => item.name)).not.toContain('C++');
    expect(initialTaxonomies.tags.map((item) => item.name)).not.toContain('C#');
    const rows = (await (await call('/api/admin/entries')).json()) as { items: Entry[] };
    let draft = rows.items.find((item) => item.content.slug === 'language-notes')!;
    expect(draft).toBeDefined();
    draft = await entryResponse(
      await call(`/api/admin/entries/${draft.id}/action`, 'POST', {
        action: 'publish',
        version: draft.version,
      }),
    );
    let publicTaxonomies = await content.listTaxonomies();
    expect(publicTaxonomies.categories.map((item) => item.name)).toContain('程式語言草稿');
    expect(publicTaxonomies.tags.map((item) => item.name)).toEqual(
      expect.arrayContaining(['C++', 'C#']),
    );
    draft = await entryResponse(
      await call(`/api/admin/entries/${draft.id}`, 'PATCH', {
        version: draft.version,
        content: { ...draft.content, category: '私人研究方向', tags: ['尚未發表的標籤'] },
      }),
    );
    publicTaxonomies = await content.listTaxonomies();
    expect(publicTaxonomies.categories.map((item) => item.name)).not.toContain('私人研究方向');
    expect(publicTaxonomies.tags.map((item) => item.name)).not.toContain('尚未發表的標籤');
    expect(publicTaxonomies.categories.map((item) => item.name)).toContain('程式語言草稿');
    expect(publicTaxonomies.tags.map((item) => item.name)).toEqual(
      expect.arrayContaining(['C++', 'C#']),
    );
    const privateTaxonomies = await content.listTaxonomies(false);
    expect(privateTaxonomies.categories.map((item) => item.name)).toContain('私人研究方向');
    expect(privateTaxonomies.tags.map((item) => item.name)).toContain('尚未發表的標籤');
  });

  it('草稿圖片僅站長可讀，發布後公開，下架後重新禁止匿名存取', async () => {
    let response = await call(uploadedImage.url, 'GET', undefined, { anonymous: true });
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    response = await call(uploadedImage.url);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(response.headers.get('Cache-Control')).toContain('private');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    let pictureEntry = await entryResponse(
      await call('/api/admin/entries', 'POST', { kind: 'article' }),
    );
    pictureEntry = await entryResponse(
      await call(`/api/admin/entries/${pictureEntry.id}`, 'PATCH', {
        version: pictureEntry.version,
        content: {
          ...pictureEntry.content,
          title: '圖片公開測試',
          slug: 'public-picture',
          body: '公開圖片測試。',
          cover: uploadedImage.url,
        },
      }),
    );
    pictureEntry = await entryResponse(
      await call(`/api/admin/entries/${pictureEntry.id}/action`, 'POST', {
        action: 'publish',
        version: pictureEntry.version,
      }),
    );
    response = await call(uploadedImage.url, 'GET', undefined, { anonymous: true });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate');
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    pictureEntry = await entryResponse(
      await call(`/api/admin/entries/${pictureEntry.id}/action`, 'POST', {
        action: 'unpublish',
        version: pictureEntry.version,
      }),
    );
    response = await call(uploadedImage.url, 'GET', undefined, { anonymous: true });
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect((await call(uploadedImage.url)).status).toBe(200);
  });

  it('輪替偽造代理 IP 與內部 IP 標頭仍觸發登入限流', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const response = await call(
        '/api/auth/sign-in/email',
        'POST',
        { email: 'owner@example.com', password: 'incorrect-password-123' },
        {
          anonymous: true,
          clientAddress: '203.0.113.40',
          headers: {
            'x-forwarded-for': `198.51.100.${i + 1}`,
            'x-real-ip': `198.51.100.${i + 1}`,
            'x-kaiyo-client-ip': `198.51.100.${i + 1}`,
          },
        },
      );
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  }, 15000);

  it('登出會撤銷資料庫 Session，重用舊 Cookie 仍回傳 401', async () => {
    expect(cookie).toContain('session_token');
    expect((await call('/api/auth/sign-out', 'POST', {})).status).toBe(200);
    expect((await call('/api/admin/dashboard')).status).toBe(401);
    expect((await call(uploadedImage.url)).status).toBe(404);
    expect((await database.getPool().query('SELECT count(*) FROM session')).rows[0].count).toBe(
      '0',
    );
  });

  it('預設文案遷移只更新舊版預設值，保留自訂內容且可重複執行', async () => {
    const client = await database.getPool().connect();
    try {
      await client.query('BEGIN');
      const original = await client.query<{ value: Record<string, unknown> }>(
        'SELECT value FROM settings WHERE id = 1 FOR UPDATE',
      );
      expect(original.rows).toHaveLength(1);
      const previousSettings = {
        ...original.rows[0].value,
        siteName: '預設文案遷移驗收站',
        tagline: '在想像與技術之間，探索更多可能。',
        about:
          '## 嗨，歡迎來到我的實驗室\n\n這裡記錄我的學習、創作，以及對世界的好奇。\n\n你可以在管理後台編輯這段介紹。',
        bio: '這是站長自行撰寫的介紹。保留原本的句號。',
        description: '自訂的網站介紹。請原樣保留。',
        socialLinks: [{ label: '原始碼。', url: 'https://example.test/source' }],
      };
      await client.query('UPDATE settings SET value = $1::jsonb WHERE id = 1', [
        JSON.stringify(previousSettings),
      ]);
      const migration = await readFile(
        new URL('../../db/migrations/002_default_copy.sql', import.meta.url),
        'utf8',
      );
      const expected = {
        ...previousSettings,
        tagline: '在想像與技術之間，探索更多可能',
        about:
          '## 嗨，歡迎來到我的實驗室\n\n這裡記錄我的學習、創作，以及對世界的好奇\n\n你可以在管理後台編輯這段介紹',
      };

      await client.query(migration);
      const first = await client.query('SELECT value FROM settings WHERE id = 1');
      expect(first.rows[0].value).toEqual(expected);

      await client.query(migration);
      const second = await client.query('SELECT value FROM settings WHERE id = 1');
      expect(second.rows[0].value).toEqual(first.rows[0].value);
    } finally {
      try {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    }
  });
});
