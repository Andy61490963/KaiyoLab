import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import type { Entry, EntryContent, EntryKind } from '../../src/lib/types';
import { cleanupTestDatabase } from '../helpers/database-cleanup';

describe.skipIf(!process.env.DATABASE_URL)('PostgreSQL 垃圾桶永久刪除', () => {
  let admin: pg.Pool;
  let name: string;
  let directory: string;
  let database: typeof import('../../src/lib/db');
  let api: typeof import('../../src/pages/api/admin/[...path]');
  let middleware: typeof import('../../src/middleware');
  let listing: typeof import('../../src/lib/admin-listing');
  let content: typeof import('../../src/lib/content');
  let cookie = '';
  const origin = 'http://localhost:4321';

  async function call(
    route: string,
    method = 'GET',
    data?: unknown,
    options: { anonymous?: boolean; origin?: string } = {},
  ): Promise<Response> {
    const url = new URL(`/api/admin/${route}`, origin);
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (!options.anonymous) headers.set('Cookie', cookie);
    if (method !== 'GET') headers.set('Origin', options.origin ?? origin);
    const context: any = {
      url,
      request: new Request(url, {
        method,
        headers,
        body: data === undefined ? undefined : JSON.stringify(data),
      }),
      params: { path: route },
      locals: {},
      redirect: (target: string) =>
        new Response(null, { status: 302, headers: { Location: target } }),
    };
    const response = await middleware.onRequest(context, async () => api.ALL!(context));
    if (!(response instanceof Response)) throw new Error('永久刪除端點未回傳 Response');
    return response;
  }

  async function entryResponse(response: Response): Promise<Entry> {
    expect(response.status, await response.clone().text()).toBeLessThan(300);
    return response.json();
  }

  async function save(entry: Entry, changes: Partial<EntryContent>) {
    return entryResponse(
      await call(`entries/${entry.id}`, 'PATCH', {
        version: entry.version,
        content: { ...entry.content, ...changes },
      }),
    );
  }

  async function create(kind: EntryKind = 'article', slug = `delete-${randomUUID()}`) {
    const entry = await entryResponse(await call('entries', 'POST', { kind }));
    return save(entry, {
      title: slug,
      slug,
      body: '永久刪除驗收內容',
      category: '刪除驗收',
      tags: ['保留分類'],
    });
  }

  async function action(entry: Entry, action: string) {
    return entryResponse(
      await call(`entries/${entry.id}/action`, 'POST', { action, version: entry.version }),
    );
  }

  const remove = (entry: Entry) =>
    call(`entries/${entry.id}`, 'DELETE', { version: entry.version });

  beforeAll(async () => {
    const source = process.env.DATABASE_URL!;
    admin = new pg.Pool({ connectionString: source });
    name = `kaiyo_test_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE ${name}`);
    const connection = new URL(source);
    connection.pathname = `/${name}`;
    process.env.DATABASE_URL = connection.href;
    process.env.SITE_URL = origin;
    process.env.BETTER_AUTH_SECRET = 'trash-delete-only-secret-01234567890123456789';
    process.env.SETUP_TOKEN = 'trash-delete-only-setup-01234567890123456789';
    directory = await mkdtemp(path.join(os.tmpdir(), 'kaiyo-trash-delete-'));
    process.env.UPLOAD_DIR = directory;
    database = await import('../../src/lib/db');
    for (const migration of [
      '001_initial.sql',
      '007_content_history.sql',
      '008_settings_version.sql',
      '009_entry_order.sql',
    ]) {
      await database
        .getPool()
        .query(
          await readFile(new URL(`../../db/migrations/${migration}`, import.meta.url), 'utf8'),
        );
    }
    api = await import('../../src/pages/api/admin/[...path]');
    middleware = await import('../../src/middleware');
    listing = await import('../../src/lib/admin-listing');
    content = await import('../../src/lib/content');
    const setup = await import('../../src/pages/api/setup');
    const initialized = await setup.POST!({
      request: new Request(`${origin}/api/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: process.env.SETUP_TOKEN,
          name: '永久刪除驗收',
          siteName: '驗收網站',
          email: 'trash-delete@example.test',
          password: 'trash-delete-password-2026',
        }),
      }),
    } as any);
    expect(initialized.status).toBe(200);
    const { getAuth } = await import('../../src/lib/auth');
    const login = await getAuth().api.signInEmail({
      body: {
        email: 'trash-delete@example.test',
        password: 'trash-delete-password-2026',
      },
      asResponse: true,
    });
    expect(login.status).toBe(200);
    cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
  });

  beforeEach(async () => {
    await database.getPool().query('TRUNCATE entries, media, taxonomies CASCADE');
  });

  afterAll(async () => {
    await cleanupTestDatabase(admin, name, database?.getPool());
    if (directory) {
      const resolved = path.resolve(directory);
      if (
        !resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) ||
        !path.basename(resolved).startsWith('kaiyo-trash-delete-')
      )
        throw new Error('拒絕清除永久刪除驗收暫存目錄以外的路徑');
      await rm(resolved, { recursive: true, force: true });
    }
  });

  it.each(['article', 'project'] as const)(
    '%s 永久刪除移除內容、歷史與舊網址，並可重新使用原網址',
    async (kind) => {
      const firstSlug = `original-${kind}`;
      const secondSlug = `current-${kind}`;
      let entry = await action(await create(kind, firstSlug), 'publish');
      entry = await action(
        await save(entry, { slug: secondSlug, body: '第二份公開版本' }),
        'publish',
      );
      entry = await action(entry, 'trash');
      const other = await create(kind);
      expect(
        (
          await call(`entries/${other.id}`, 'PATCH', {
            version: other.version,
            content: { ...other.content, slug: firstSlug },
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await database
            .getPool()
            .query('SELECT id FROM entry_revisions WHERE entry_id=$1', [entry.id])
        ).rowCount,
      ).toBeGreaterThan(0);
      expect(
        (
          await database
            .getPool()
            .query('SELECT slug FROM entry_slugs WHERE entry_id=$1', [entry.id])
        ).rowCount,
      ).toBe(2);
      const deleted = await remove(entry);
      expect(deleted.status).toBe(200);
      expect(await deleted.json()).toEqual({ deleted: true, id: entry.id });
      expect((await call(`entries/${entry.id}`)).status).toBe(404);
      expect((await call(`history/${entry.id}`)).status).toBe(404);
      expect(
        (
          await database
            .getPool()
            .query('SELECT id FROM entry_revisions WHERE entry_id=$1', [entry.id])
        ).rows,
      ).toEqual([]);
      expect(
        (
          await database
            .getPool()
            .query('SELECT slug FROM entry_slugs WHERE entry_id=$1', [entry.id])
        ).rows,
      ).toEqual([]);
      expect(await content.getPublished(kind, secondSlug)).toBeNull();
      expect(await content.publishedRedirect(kind, firstSlug)).toBeNull();
      expect(
        (await listing.listAdminEntries(new URLSearchParams({ kind, status: 'trash' }))).items,
      ).toEqual([]);
      await action(await save(other, { slug: firstSlug }), 'publish');
      await action(await create(kind, secondSlug), 'publish');
      expect((await content.getPublished(kind, firstSlug))?.id).toBe(other.id);
      expect((await remove(entry)).status).toBe(404);
    },
  );

  it('正常草稿與已發布內容不能直接永久刪除，失敗不改版本或內容', async () => {
    let entry = await create();
    for (const publish of [false, true]) {
      if (publish) entry = await action(entry, 'publish');
      const rejected = await remove(entry);
      expect(rejected.status).toBe(409);
      expect(await rejected.json()).toEqual({
        error: 'Move this content to the trash before deleting it permanently.',
      });
      expect(await entryResponse(await call(`entries/${entry.id}`))).toEqual(entry);
    }
  });

  it('舊分頁不能刪除已還原或再次丟入垃圾桶的新版內容', async () => {
    const trashed = await action(await create(), 'trash');
    const restored = await action(trashed, 'restore');
    const stale = await remove(trashed);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({
      error: 'This content has changed. Refresh the list before deleting it permanently.',
    });
    expect((await remove(restored)).status).toBe(409);
    const newTrash = await action(restored, 'trash');
    expect((await remove(trashed)).status).toBe(409);
    expect(await entryResponse(await call(`entries/${newTrash.id}`))).toEqual(newTrash);
    expect((await remove(newTrash)).status).toBe(200);
  });

  it('還原與永久刪除同時執行僅一方成功，存活內容不被過期刪除', async () => {
    const entry = await action(await create(), 'trash');
    const results = await Promise.all([
      call(`entries/${entry.id}/action`, 'POST', { action: 'restore', version: entry.version }),
      remove(entry),
    ]);
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    const current = await call(`entries/${entry.id}`);
    if (results[0].status === 200) {
      expect(results[1].status).toBe(409);
      expect(await current.json()).toMatchObject({
        id: entry.id,
        deletedAt: null,
        version: entry.version + 1,
      });
    } else {
      expect(results[0].status).toBe(404);
      expect(current.status).toBe(404);
    }
  });

  it('匿名、跨站與非法版本不能刪除，額外欄位和錯誤路徑均被拒絕', async () => {
    const entry = await action(await create(), 'trash');
    const route = `entries/${entry.id}`;
    expect(
      (await call(route, 'DELETE', { version: entry.version }, { anonymous: true })).status,
    ).toBe(401);
    expect(
      (
        await call(
          route,
          'DELETE',
          { version: entry.version },
          { origin: 'https://external.example' },
        )
      ).status,
    ).toBe(403);
    expect((await call(route, 'DELETE', { version: entry.version }, { origin: '' })).status).toBe(
      403,
    );
    for (const data of [
      undefined,
      {},
      { version: 0 },
      { version: -1 },
      { version: 1.5 },
      { version: String(entry.version) },
      { version: entry.version, force: true },
    ]) {
      expect((await call(route, 'DELETE', data)).status).toBe(400);
    }
    expect((await call(`${route}/action`, 'DELETE', { version: entry.version })).status).toBe(404);
    expect((await call(`${route}//unexpected`, 'DELETE', { version: entry.version })).status).toBe(
      404,
    );
    expect((await call('entries/missing', 'DELETE', { version: 1 })).status).toBe(404);
    expect(await entryResponse(await call(route))).toEqual(entry);
  });

  it('保留媒體原檔與分類，只清除刪除內容的參照，其他內容仍阻止刪圖', async () => {
    const mediaId = randomUUID();
    const data = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#a22b5b' },
    })
      .webp()
      .toBuffer();
    const mediaPath = path.join(directory, `${mediaId}.webp`);
    await writeFile(mediaPath, data);
    await database.db().insert(database.media).values({
      id: mediaId,
      name: '保留圖片.webp',
      alt: '永久刪除驗收圖片',
      mime: 'image/webp',
      size: data.length,
      width: 8,
      height: 8,
    });
    let entry = await save(await create(), {
      body: `![歷史圖片](/media/${mediaId}.webp)`,
      cover: `/media/${mediaId}.webp`,
    });
    entry = await action(entry, 'publish');
    entry = await save(entry, { body: '目前草稿不用圖片', cover: '' });
    entry = await action(entry, 'trash');
    const retained = await save(await create('project'), {
      body: `![仍在使用](/media/${mediaId}.webp)`,
    });
    const { mediaUsages } = await import('../../src/lib/media');
    expect(
      (await mediaUsages(database.db(), mediaId)).some((usage) =>
        usage.includes(entry.content.title),
      ),
    ).toBe(true);
    const taxonomy = (await database.getPool().query('SELECT * FROM taxonomies ORDER BY id')).rows;
    expect((await remove(entry)).status).toBe(200);
    expect(await readFile(mediaPath)).toEqual(data);
    expect(
      (await database.getPool().query('SELECT id FROM media WHERE id=$1', [mediaId])).rows,
    ).toEqual([{ id: mediaId }]);
    expect((await database.getPool().query('SELECT * FROM taxonomies ORDER BY id')).rows).toEqual(
      taxonomy,
    );
    expect(await mediaUsages(database.db(), mediaId)).toEqual([
      `${retained.content.title} (draft)`,
    ]);
    expect((await call(`media/${mediaId}`, 'DELETE')).status).toBe(409);
    await save(retained, { body: '移除最後一個參照' });
    expect(await mediaUsages(database.db(), mediaId)).toEqual([]);
    expect(await readFile(mediaPath)).toEqual(data);
  });

  it('永久刪除不改其他文章、作品的排序欄位、版本及時間', async () => {
    const first = await create('article');
    const target = await action(await create('article'), 'trash');
    const last = await create('article');
    const project = await create('project');
    for (const [id, rank] of [
      [first.id, 10],
      [target.id, 20],
      [last.id, 30],
      [project.id, 40],
    ]) {
      await database.getPool().query('UPDATE entries SET sort_order=$1 WHERE id=$2', [rank, id]);
    }
    const survivors = (
      await database
        .getPool()
        .query('SELECT * FROM entries WHERE id<>$1 ORDER BY kind,sort_order,id', [target.id])
    ).rows;
    expect((await remove(target)).status).toBe(200);
    expect(
      (await database.getPool().query('SELECT * FROM entries ORDER BY kind,sort_order,id')).rows,
    ).toEqual(survivors);
    expect(
      (await listing.listAdminEntries(new URLSearchParams('kind=article'))).items.map(
        (entry) => entry.id,
      ),
    ).toEqual([first.id, last.id]);
  });
});
