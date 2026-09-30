import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { gzipSync, gunzipSync } from 'node:zlib';
import pg from 'pg';
import type { Entry, EntryKind, Media } from '../../src/lib/types';
import { cleanupTestDatabase } from '../helpers/database-cleanup';
import {
  animatedGifFixture,
  oversizedGifFixture,
  readAnimationFrames,
} from '../helpers/animated-image';

describe.skipIf(!process.env.DATABASE_URL)('GIF 媒體的真實資料庫、發布與搬移流程', () => {
  let admin: pg.Pool;
  let name: string;
  let directory: string;
  let database: typeof import('../../src/lib/db');
  let cms: typeof import('../../src/pages/api/admin/[...path]');
  let mediaRoute: typeof import('../../src/pages/media/[file]');
  let middleware: typeof import('../../src/middleware');
  let setup: typeof import('../../src/pages/api/setup');
  let auth: typeof import('../../src/pages/api/auth/[...all]');
  let transfer: typeof import('../../src/lib/portability');
  let cookie = '';
  let gif: Buffer;
  const origin = 'http://localhost:4321';

  async function call(
    route: string,
    method = 'GET',
    payload?: unknown,
    options: { form?: FormData; anonymous?: boolean; origin?: string; length?: number } = {},
  ) {
    const headers = new Headers();
    if (!options.anonymous && cookie) headers.set('Cookie', cookie);
    if (method !== 'GET') headers.set('Origin', options.origin || origin);
    if (payload !== undefined) headers.set('Content-Type', 'application/json');
    if (options.length) headers.set('Content-Length', String(options.length));
    const request = new Request(origin + route, {
      method,
      headers,
      body: options.form || (payload === undefined ? undefined : JSON.stringify(payload)),
    });
    const url = new URL(request.url);
    const context: any = {
      request,
      url,
      params: {
        path: url.pathname.replace('/api/admin/', ''),
        file: url.pathname.replace('/media/', ''),
      },
      locals: {},
      clientAddress: '127.0.0.1',
      redirect: (location: string) =>
        new Response(null, { status: 302, headers: { Location: location } }),
    };
    const response = await middleware.onRequest(context, async () => {
      if (route === '/api/setup') return setup.POST!(context);
      if (route.startsWith('/api/auth/')) return auth.ALL!(context);
      if (route.startsWith('/media/')) return mediaRoute.GET!(context);
      return cms.ALL!(context);
    });
    if (!(response instanceof Response)) throw new Error('測試請求沒有回傳 Response');
    return response;
  }

  function form(input = gif, mime = 'image/gif') {
    const value = new FormData();
    value.set('file', new File([new Uint8Array(input)], '雙影格驗收.gif', { type: mime }));
    value.set('alt', '紅藍兩個影格與透明角落');
    return value;
  }

  async function upload(): Promise<Media> {
    const response = await call('/api/admin/media', 'POST', undefined, { form: form() });
    expect(response.status, await response.clone().text()).toBe(201);
    return response.json();
  }

  async function entryResponse(response: Response): Promise<Entry> {
    expect(response.status, await response.clone().text()).toBeLessThan(300);
    return response.json();
  }

  async function createEntry(kind: EntryKind, picture: Media): Promise<Entry> {
    const entry = await entryResponse(
      await call('/api/admin/entries', 'POST', { kind, title: `GIF-${kind}` }),
    );
    return entryResponse(
      await call(`/api/admin/entries/${entry.id}`, 'PATCH', {
        version: entry.version,
        content: {
          ...entry.content,
          body: `# GIF 流程\n\n![正文動畫](${picture.url})`,
          cover: picture.url,
          coverAlt: '封面動畫',
          excerpt: '保留兩個不同影格',
        },
      }),
    );
  }

  async function act(entry: Entry, action: 'publish' | 'unpublish' | 'trash') {
    return entryResponse(
      await call(`/api/admin/entries/${entry.id}/action`, 'POST', {
        version: entry.version,
        action,
      }),
    );
  }

  async function expectAnimated(response: Response, width = 640, height = 96) {
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const buffer = Buffer.from(await response.arrayBuffer());
    const { metadata, frames } = await readAnimationFrames(buffer);
    expect(metadata).toMatchObject({
      format: 'webp',
      width,
      pageHeight: height,
      pages: 2,
      loop: 3,
      delay: [120, 240],
    });
    expect(frames[0].center[0]).toBeGreaterThan(frames[0].center[2] + 150);
    expect(frames[1].center[2]).toBeGreaterThan(frames[1].center[0] + 150);
    for (const frame of frames) expect(frame.cornerAlpha).toBeLessThanOrEqual(1);
    return buffer;
  }

  beforeAll(async () => {
    const source = process.env.DATABASE_URL!;
    admin = new pg.Pool({ connectionString: source });
    name = `kaiyo_test_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE ${name}`);
    const connection = new URL(source);
    connection.pathname = `/${name}`;
    process.env.DATABASE_URL = connection.href;
    process.env.SITE_URL = origin;
    process.env.BETTER_AUTH_SECRET = 'gif-integration-only-secret-01234567890123456789';
    process.env.SETUP_TOKEN = 'gif-integration-only-setup-01234567890123456789';
    directory = await mkdtemp(path.join(os.tmpdir(), 'kaiyo-gif-'));
    process.env.UPLOAD_DIR = directory;
    database = await import('../../src/lib/db');
    for (const migration of [
      '001_initial.sql',
      '007_content_history.sql',
      '008_settings_version.sql',
      '009_entry_order.sql',
    ])
      await database
        .getPool()
        .query(await readFile(path.resolve('db/migrations', migration), 'utf8'));
    cms = await import('../../src/pages/api/admin/[...path]');
    mediaRoute = await import('../../src/pages/media/[file]');
    middleware = await import('../../src/middleware');
    setup = await import('../../src/pages/api/setup');
    auth = await import('../../src/pages/api/auth/[...all]');
    transfer = await import('../../src/lib/portability');
    expect(
      (
        await call('/api/setup', 'POST', {
          token: process.env.SETUP_TOKEN,
          email: 'gif@example.test',
          password: 'gif-test-password-12345',
          name: 'GIF 站長',
          siteName: 'GIF 驗收',
        })
      ).status,
    ).toBe(200);
    const signedIn = await call('/api/auth/sign-in/email', 'POST', {
      email: 'gif@example.test',
      password: 'gif-test-password-12345',
    });
    expect(signedIn.status).toBe(200);
    cookie = signedIn.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    gif = await animatedGifFixture({ width: 640, height: 96 });
  });

  beforeEach(async () => {
    await database
      .getPool()
      .query('TRUNCATE entries, entry_revisions, entry_slugs, media, taxonomies CASCADE');
    for (const file of await readdir(directory)) {
      const target = path.resolve(directory, file);
      if (!target.startsWith(path.resolve(directory) + path.sep))
        throw new Error('拒絕移除測試圖片目錄以外的檔案');
      await rm(target, { recursive: true, force: true });
    }
  });

  afterAll(async () => {
    await cleanupTestDatabase(admin, name, database?.getPool());
    if (directory) {
      const resolved = path.resolve(directory);
      if (
        !resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) ||
        !path.basename(resolved).startsWith('kaiyo-gif-')
      )
        throw new Error('拒絕清理 GIF 測試目錄以外的路徑');
      await rm(resolved, { recursive: true, force: true });
    }
  });

  it('上傳動畫在草稿中保持私人，文章與作品發布後原圖和各尺寸快取都保留影格', async () => {
    const picture = await upload();
    expect(picture).toMatchObject({
      mime: 'image/webp',
      width: 640,
      height: 96,
      alt: '紅藍兩個影格與透明角落',
    });
    expect(picture.url).toBe(`/media/${picture.id}.webp`);
    await expectAnimated(await call(picture.url));
    expect((await call(picture.url, 'GET', undefined, { anonymous: true })).status).toBe(404);
    const entries: Entry[] = [];
    for (const kind of ['article', 'project'] as const) {
      let entry = await createEntry(kind, picture);
      expect(
        (await call(`${picture.url}?w=480`, 'GET', undefined, { anonymous: true })).status,
      ).toBe(entries.length ? 200 : 404);
      entry = await act(entry, 'publish');
      entries.push(entry);
    }
    const media = await (await call('/api/admin/media')).json();
    expect(media.items[0].usedBy).toEqual(
      expect.arrayContaining([
        'GIF-article (draft)',
        'GIF-article (published)',
        'GIF-project (draft)',
        'GIF-project (published)',
      ]),
    );
    const original = await call(picture.url, 'GET', undefined, { anonymous: true });
    expect(original.headers.get('Cache-Control')).toContain('public');
    await expectAnimated(original);
    for (const width of [480, 960, 1600]) {
      const actualWidth = Math.min(width, picture.width);
      const route = `${picture.url}?w=${width}`;
      const first = await expectAnimated(
        await call(route, 'GET', undefined, { anonymous: true }),
        actualWidth,
        (actualWidth * 96) / 640,
      );
      const cached = await expectAnimated(
        await call(route, 'GET', undefined, { anonymous: true }),
        actualWidth,
        (actualWidth * 96) / 640,
      );
      expect(cached).toEqual(first);
    }
    expect((await call(`/api/admin/media/${picture.id}`, 'DELETE')).status).toBe(409);
    for (const entry of entries) await act(entry, 'unpublish');
    // 已生成的動畫縮圖也必須重新檢查權限，不能因快取留下公開副本
    for (const suffix of ['', '?w=480', '?w=960', '?w=1600'])
      expect((await call(picture.url + suffix, 'GET', undefined, { anonymous: true })).status).toBe(
        404,
      );
    await expectAnimated(await call(`${picture.url}?w=480`), 480, 72);
    expect((await call(`/api/admin/media/${picture.id}`, 'DELETE')).status).toBe(409);
  });

  it('封存匯出匯入保留動畫與引用，匯入保持草稿且歷史仍阻擋圖片誤刪', async () => {
    const picture = await upload();
    const originals: Entry[] = [];
    for (const kind of ['article', 'project'] as const)
      originals.push(await act(await createEntry(kind, picture), 'publish'));
    const exported = await transfer.exportArchive();
    const archive = JSON.parse(gunzipSync(exported).toString('utf8'));
    expect(archive.media[0]).toMatchObject({ mime: 'image/webp', width: 640, height: 96 });
    expect(
      (await readAnimationFrames(Buffer.from(archive.media[0].data, 'base64'))).metadata.pages,
    ).toBe(2);
    const loaded = await transfer.decodeArchive(exported);
    const preview = await transfer.previewImport(loaded);
    const result = await transfer.importArchive(loaded, preview.review);
    expect(result.entryIds).toHaveLength(2);
    let importedUrl = '';
    for (const id of result.entryIds) {
      const imported = await entryResponse(await call(`/api/admin/entries/${id}`));
      expect(imported.published).toBeNull();
      expect(imported.content.cover).not.toBe(picture.url);
      expect(imported.content.body).toContain(imported.content.cover);
      expect(imported.content.body).not.toContain(picture.url);
      importedUrl = imported.content.cover;
      await expectAnimated(await call(importedUrl));
      expect((await call(importedUrl, 'GET', undefined, { anonymous: true })).status).toBe(404);
    }
    const importedMedia = (await (await call('/api/admin/media')).json()).items.find(
      (item: Media) => item.url === importedUrl,
    ) as Media;
    expect(importedMedia.usedBy.length).toBeGreaterThanOrEqual(2);
    expect((await call(`/api/admin/media/${importedMedia.id}`, 'DELETE')).status).toBe(409);
    const imported = await entryResponse(await call(`/api/admin/entries/${result.entryIds[0]}`));
    await act(imported, 'publish');
    await expectAnimated(
      await call(`${importedUrl}?w=480`, 'GET', undefined, { anonymous: true }),
      480,
      72,
    );
    for (const entry of originals) {
      const trashed = await act(entry, 'trash');
      expect(
        (await call(`/api/admin/entries/${trashed.id}`, 'DELETE', { version: trashed.version }))
          .status,
      ).toBe(200);
    }
    expect((await call(`/api/admin/media/${picture.id}`, 'DELETE')).status).toBe(200);
    expect((await call(picture.url)).status).toBe(404);
    await expectAnimated(await call(importedUrl));
    const secondExport = await transfer.decodeArchive(await transfer.exportArchive());
    expect(secondExport.archive.media).toHaveLength(1);
    expect((await readAnimationFrames([...secondExport.images.values()][0])).metadata.pages).toBe(
      2,
    );
    // 封存宣告的是單幀高度，不能把動畫疊加高度冒充成正常尺寸
    archive.media[0].height *= 2;
    await expect(transfer.decodeArchive(gzipSync(JSON.stringify(archive)))).rejects.toThrow();
  });

  it('拒絕訪客、跨站、假 MIME、壞 GIF、過多影格與高像素量，失敗不留下記錄或檔案', async () => {
    expect(
      (await call('/api/admin/media', 'POST', undefined, { anonymous: true, form: form() })).status,
    ).toBe(401);
    expect(
      (
        await call('/api/admin/media', 'POST', undefined, {
          origin: 'https://untrusted.example',
          form: form(),
        })
      ).status,
    ).toBe(403);
    for (const [input, mime] of [
      [gif, 'image/png'],
      [gif.subarray(0, 20), 'image/gif'],
      [Buffer.from('GIF89a-not-an-image'), 'image/gif'],
      [await animatedGifFixture({ width: 4, height: 4, frames: 201 }), 'image/gif'],
      [await oversizedGifFixture(), 'image/gif'],
    ] as const)
      expect(
        (await call('/api/admin/media', 'POST', undefined, { form: form(input, mime) })).status,
      ).toBe(400);
    expect(
      (
        await call('/api/admin/media', 'POST', undefined, {
          form: form(),
          length: 11 * 1024 * 1024,
        })
      ).status,
    ).toBe(413);
    expect(await database.db().select().from(database.media)).toHaveLength(0);
    expect(await readdir(directory)).toEqual([]);
  });
});
