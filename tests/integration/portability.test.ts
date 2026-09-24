import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { defaultSettings, emptyContent } from '../../src/lib/defaults';

describe.skipIf(!process.env.DATABASE_URL)('真實資料庫的內容搬移', () => {
  let admin: pg.Pool;
  let database: typeof import('../../src/lib/db');
  let transfer: typeof import('../../src/lib/portability');
  let directory: string;
  let name: string;
  let imageId: string;
  let entryId: string;
  let sourceArchive: Buffer;
  const origin = 'http://localhost:4321';

  beforeAll(async () => {
    const source = process.env.DATABASE_URL!;
    admin = new pg.Pool({ connectionString: source });
    name = `kaiyo_transfer_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE ${name}`);
    const connection = new URL(source);
    connection.pathname = `/${name}`;
    process.env.DATABASE_URL = connection.href;
    process.env.SITE_URL = origin;
    process.env.BETTER_AUTH_SECRET = 'transfer-test-only-secret-01234567890123456789';
    directory = await mkdtemp(path.join(os.tmpdir(), 'kaiyo-transfer-'));
    process.env.UPLOAD_DIR = directory;
    database = await import('../../src/lib/db');
    for (const file of ['001_initial.sql', '007_content_history.sql']) {
      await database.getPool().query(await readFile(path.resolve('db/migrations', file), 'utf8'));
    }
    transfer = await import('../../src/lib/portability');
    await database
      .getPool()
      .query(
        `INSERT INTO "user"(id,name,email) VALUES('private-owner','ACCOUNT-NAME-EXCLUDED','SECRET-EMAIL@example.test')`,
      );
    await database
      .getPool()
      .query(
        `INSERT INTO account(id,account_id,provider_id,user_id,password,access_token) VALUES('account','private-owner','credential','private-owner','PASSWORD-HASH-EXCLUDED','ACCESS-TOKEN-EXCLUDED')`,
      );
  });

  beforeEach(async () => {
    await database
      .getPool()
      .query('TRUNCATE entries, entry_revisions, entry_slugs, media, taxonomies, settings CASCADE');
    for (const file of await readdir(directory))
      await rm(path.join(directory, file), { recursive: true, force: true });
    imageId = randomUUID();
    entryId = randomUUID();
    const picture = await sharp({
      create: { width: 12, height: 8, channels: 3, background: '#9d2357' },
    })
      .webp()
      .toBuffer();
    await writeFile(path.join(directory, `${imageId}.webp`), picture);
    await database.db().insert(database.media).values({
      id: imageId,
      name: '封面.webp',
      alt: '測試圖片',
      mime: 'image/webp',
      size: picture.length,
      width: 12,
      height: 8,
    });
    const draft = {
      ...emptyContent,
      title: '私人新版',
      slug: 'article-one',
      body: `# 私人草稿\n\n![圖片](/media/${imageId}.webp)`,
      cover: `/media/${imageId}.webp`,
      category: '技術',
      tags: ['TypeScript'],
      series: '系列',
      seriesOrder: 3,
      coverPosition: { x: 10, y: 90 },
    };
    const published = { ...draft, title: '公開舊版', slug: 'article-old', body: '舊的公開內容' };
    await database
      .db()
      .insert(database.entries)
      .values({
        id: entryId,
        kind: 'article',
        content: draft,
        published,
        publishedAt: new Date('2026-01-02T00:00:00Z'),
      });
    await database
      .db()
      .insert(database.entryRevisions)
      .values({
        id: randomUUID(),
        entryId,
        content: { ...draft, body: '更早的草稿' },
        source: 'draft',
        version: 1,
      });
    await database
      .db()
      .insert(database.taxonomies)
      .values([
        { id: randomUUID(), kind: 'category', name: '技術', slug: 'technology' },
        { id: randomUUID(), kind: 'tag', name: 'TypeScript', slug: 'typescript' },
      ]);
    await database
      .db()
      .insert(database.settings)
      .values({
        id: 1,
        value: {
          ...defaultSettings,
          siteName: '來源站',
          authorName: '來源作者',
          homeIntro: '# 來源網站',
          avatar: `/media/${imageId}.webp`,
          siteUrl: 'https://SOURCE-URL-EXCLUDED.test',
        },
      });
    sourceArchive = await transfer.exportArchive();
  });

  afterAll(async () => {
    if (database) await database.getPool().end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    }
    if (directory) {
      const resolved = path.resolve(directory);
      if (
        !resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) ||
        !path.basename(resolved).startsWith('kaiyo-transfer-')
      )
        throw new Error('拒絕移除測試目錄以外的路徑');
      await rm(resolved, { recursive: true, force: true });
    }
  });

  it('匯出沒有帳密部署資訊，roundtrip保留媒體與歷史但不意外公開', async () => {
    const json = gunzipSync(sourceArchive).toString('utf8');
    for (const secret of [
      'ACCOUNT-NAME-EXCLUDED',
      'SECRET-EMAIL',
      'PASSWORD-HASH-EXCLUDED',
      'ACCESS-TOKEN-EXCLUDED',
      'SOURCE-URL-EXCLUDED',
      'BETTER_AUTH_SECRET',
    ])
      expect(json).not.toContain(secret);
    const loaded = await transfer.decodeArchive(sourceArchive);
    const preview = await transfer.previewImport(loaded);
    expect(preview.counts).toMatchObject({ articles: 1, images: 1, revisions: 3 });
    expect(preview.adjustments).toEqual(
      expect.arrayContaining([
        { type: 'article', from: 'article-one', to: 'article-one-import-1' },
      ]),
    );
    const result = await transfer.importArchive(loaded, preview.review);
    const all = await database.db().select().from(database.entries);
    expect(all).toHaveLength(2);
    const imported = all.find((entry) => entry.id === result.entryIds[0])!;
    expect(imported.id).not.toBe(entryId);
    expect(imported.published).toBeNull();
    expect(imported.publishedAt).toBeNull();
    expect(imported.content.slug).toBe('article-one-import-1');
    expect(imported.content.body).toContain('私人草稿');
    expect(imported.content.cover).not.toContain(imageId);
    const image = await readFile(path.join(directory, path.basename(imported.content.cover)));
    expect((await sharp(image).metadata()).width).toBe(12);
    const revisions = (await database.db().select().from(database.entryRevisions)).filter(
      (item) => item.entryId === imported.id,
    );
    expect(revisions.map((item) => item.content.body)).toEqual(
      expect.arrayContaining(['更早的草稿', '舊的公開內容']),
    );
    expect(revisions.every((item) => item.content.slug === imported.content.slug)).toBe(true);
    const cms = await import('../../src/pages/api/admin/[...path]');
    const oldPublished = revisions.find((item) => item.source === 'published')!;
    const request = new Request(`${origin}/api/admin/history/${imported.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1, revisionId: oldPublished.id }),
    });
    const restored = await cms.ALL!({
      request,
      url: new URL(request.url),
      params: { path: `history/${imported.id}` },
    } as any);
    expect(restored.status).toBe(200);
    const restoredEntry = await restored.json();
    expect(restoredEntry.content.body).toBe('舊的公開內容');
    expect(restoredEntry.content.slug).toBe('article-one-import-1');
    expect(restoredEntry.published).toBeNull();
    const content = await import('../../src/lib/content');
    expect(await content.getPublished('article', imported.content.slug)).toBeNull();
    expect((await content.allPublished()).length).toBe(1);
    expect((await database.db().select().from(database.settings))[0].value.siteName).toBe('來源站');
    const exportedAgain = await transfer.decodeArchive(await transfer.exportArchive());
    expect(exportedAgain.archive.entries).toHaveLength(2);
    expect(exportedAgain.images.size).toBe(2);
  });

  it('空站匯入可選套用設定，保留目的站URL並重寫設定圖片', async () => {
    const loaded = await transfer.decodeArchive(sourceArchive);
    await database
      .getPool()
      .query('TRUNCATE entries, entry_revisions, entry_slugs, media, taxonomies CASCADE');
    await database
      .getPool()
      .query(`UPDATE settings SET value = jsonb_set(value, '{siteName}', '"目的站"'::jsonb)`);
    const preview = await transfer.previewImport(loaded, true);
    expect(preview.counts.categories).toBe(1);
    await transfer.importArchive(loaded, preview.review, true);
    const [settings] = await database.db().select().from(database.settings);
    expect(settings.value.siteName).toBe('來源站');
    expect(settings.value.siteUrl).toBe(origin);
    expect(settings.value.avatar).not.toContain(imageId);
    const rows = await database.db().select().from(database.entries);
    expect(rows[0].content.slug).toBe('article-one');
    expect(rows[0].published).toBeNull();
    expect((await database.getPool().query('SELECT count(*) FROM "user"')).rows[0].count).toBe('1');
  });

  it('舊公開網址被保留時清楚調整匯入slug，不接管別篇網址', async () => {
    await database
      .db()
      .insert(database.entrySlugs)
      .values({ kind: 'article', slug: 'historical-url', entryId });
    const value = JSON.parse(gunzipSync(sourceArchive).toString());
    value.entries[0].content.slug = 'historical-url';
    const loaded = await transfer.decodeArchive(gzipSync(JSON.stringify(value)));
    const preview = await transfer.previewImport(loaded);
    expect(preview.adjustments).toContainEqual({
      type: 'article',
      from: 'historical-url',
      to: 'historical-url-import-1',
    });
    await transfer.importArchive(loaded, preview.review);
  });

  it('確認後有變更回409，並行或重送不重複匯入', async () => {
    const loaded = await transfer.decodeArchive(sourceArchive);
    const preview = await transfer.previewImport(loaded);
    const results = await Promise.allSettled([
      transfer.importArchive(loaded, preview.review),
      transfer.importArchive(loaded, preview.review),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(rejected.reason.status).toBe(409);
    expect(await readdir(directory)).toHaveLength(2);
    expect(await database.db().select().from(database.entries)).toHaveLength(2);
    await expect(transfer.importArchive(loaded, preview.review)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('資料庫提交失敗時刪除已搬入圖片且不留任何部分資料', async () => {
    const loaded = await transfer.decodeArchive(sourceArchive);
    const preview = await transfer.previewImport(loaded);
    const files = await readdir(directory);
    await database
      .getPool()
      .query(
        `CREATE FUNCTION transfer_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '模擬提交失败'; END $$; CREATE CONSTRAINT TRIGGER transfer_test_fail AFTER INSERT ON entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION transfer_test_fail()`,
      );
    try {
      await expect(transfer.importArchive(loaded, preview.review)).rejects.toThrow();
      expect(await readdir(directory)).toEqual(files);
      expect(await database.db().select().from(database.entries)).toHaveLength(1);
      expect(await database.db().select().from(database.media)).toHaveLength(1);
    } finally {
      await database
        .getPool()
        .query('DROP TRIGGER transfer_test_fail ON entries; DROP FUNCTION transfer_test_fail()');
    }
  });

  it('設定不套用時保持不變，預覽與確認的選項必須相同', async () => {
    const loaded = await transfer.decodeArchive(sourceArchive);
    const preview = await transfer.previewImport(loaded, false);
    await expect(transfer.importArchive(loaded, preview.review, true)).rejects.toMatchObject({
      status: 409,
    });
    expect(await readdir(directory)).toHaveLength(1);
    await database
      .getPool()
      .query(
        `UPDATE settings SET value = jsonb_set(value, '{siteName}', '"保留目的站名稱"'::jsonb)`,
      );
    const checked = await transfer.previewImport(loaded, false);
    await transfer.importArchive(loaded, checked.review, false);
    expect((await database.db().select().from(database.settings))[0].value.siteName).toBe(
      '保留目的站名稱',
    );
  });

  it('匯入保存當下草稿，保留100筆草稿歷史與所有公開版本', async () => {
    const value = JSON.parse(gunzipSync(sourceArchive).toString());
    const historical = value.revisions[0];
    value.revisions = Array.from({ length: 110 }, (_, index) => ({
      ...historical,
      content: { ...historical.content, body: `草稿版本-${index}` },
      version: index + 1,
      createdAt: new Date(Date.UTC(2020, 0, 1) + index * 1000).toISOString(),
    }));
    value.revisions.push({
      ...historical,
      source: 'published',
      content: { ...historical.content, body: '第一個公開版本' },
    });
    value.revisions.push({
      ...historical,
      source: 'published',
      content: { ...historical.content, body: '第二個公開版本' },
    });
    const loaded = await transfer.decodeArchive(gzipSync(JSON.stringify(value)));
    const preview = await transfer.previewImport(loaded);
    expect(preview.counts.trimmedDraftRevisions).toBe(11);
    expect(preview.counts.revisions).toBe(103);
    const result = await transfer.importArchive(loaded, preview.review);
    const revisions = (await database.db().select().from(database.entryRevisions)).filter(
      (row) => row.entryId === result.entryIds[0],
    );
    expect(revisions.filter((row) => row.source !== 'published')).toHaveLength(100);
    expect(revisions.filter((row) => row.source === 'published')).toHaveLength(3);
    expect(revisions.some((row) => row.content.body.includes('私人草稿'))).toBe(true);
    expect(revisions.some((row) => row.content.body === '草稿版本-0')).toBe(false);
    expect(revisions.some((row) => row.content.body === '草稿版本-109')).toBe(true);
  });

  it('COMMIT已成功但回應中斷時保留資料庫正在引用的圖片', async () => {
    const loaded = await transfer.decodeArchive(sourceArchive);
    const preview = await transfer.previewImport(loaded);
    const actual = database.db();
    const transaction = actual.transaction.bind(actual);
    const txSpy = vi
      .spyOn(actual, 'transaction')
      .mockImplementationOnce(async (callback, config) => {
        await transaction(callback, config);
        throw new Error('模擬 COMMIT 已成功但網路回應遺失');
      });
    const databaseSpy = vi.spyOn(database, 'db').mockReturnValue(actual);
    try {
      await expect(transfer.importArchive(loaded, preview.review)).rejects.toThrow('網路回應遺失');
      expect(await actual.select().from(database.entries)).toHaveLength(2);
      const images = await actual.select().from(database.media);
      expect(images).toHaveLength(2);
      for (const item of images)
        expect((await readFile(path.join(directory, `${item.id}.webp`))).length).toBeGreaterThan(0);
    } finally {
      txSpy.mockRestore();
      databaseSpy.mockRestore();
    }
  });

  it('API邊界禁止匿名匯出及跨站匯入', async () => {
    const middleware = await import('../../src/middleware');
    const api = await import('../../src/pages/api/admin/transfer');
    async function request(method: string, headers: Record<string, string> = {}) {
      const request = new Request(`${origin}/api/admin/transfer`, { method, headers });
      const ctx: any = {
        request,
        url: new URL(request.url),
        locals: {},
        params: {},
        redirect: (url: string) => new Response(null, { status: 302, headers: { Location: url } }),
      };
      return middleware.onRequest(ctx, async () => api.ALL!(ctx)) as Promise<Response>;
    }
    expect((await request('GET')).status).toBe(401);
    expect((await request('POST', { Origin: 'https://foreign.example' })).status).toBe(403);
  });
});
