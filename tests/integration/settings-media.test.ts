import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { access, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { defaultSettings } from '../../src/lib/defaults';
import { persistMediaFile } from '../../src/lib/media-persistence';
import type { SettingsSnapshot } from '../../src/lib/settings';
import { cleanupTestDatabase } from '../helpers/database-cleanup';

describe.skipIf(!process.env.DATABASE_URL)('PostgreSQL 設定版本與媒體提交復原', () => {
  let admin: pg.Pool;
  let name: string;
  let directory: string;
  let database: typeof import('../../src/lib/db');
  let api: typeof import('../../src/pages/api/admin/[...path]');
  const origin = 'http://localhost:4321';

  async function call(method = 'GET', data?: unknown) {
    const url = new URL('/api/admin/settings', origin);
    return api.ALL!({
      request: new Request(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: data === undefined ? undefined : JSON.stringify(data),
      }),
      url,
      params: { path: 'settings' },
    } as any) as Promise<Response>;
  }
  const current = async () => (await (await call()).json()) as SettingsSnapshot;

  beforeAll(async () => {
    const source = process.env.DATABASE_URL!;
    admin = new pg.Pool({ connectionString: source });
    name = `kaiyo_test_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE ${name}`);
    const url = new URL(source);
    url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.href;
    process.env.SITE_URL = origin;
    directory = await mkdtemp(path.join(os.tmpdir(), 'kaiyo-media-recovery-'));
    database = await import('../../src/lib/db');
    for (const migration of ['001_initial.sql', '007_content_history.sql'])
      await database
        .getPool()
        .query(
          await readFile(new URL(`../../db/migrations/${migration}`, import.meta.url), 'utf8'),
        );
    await database
      .getPool()
      .query('INSERT INTO settings(id, value) VALUES(1, $1)', [
        JSON.stringify({ ...defaultSettings, tagline: '既有設定', homeIntro: '# 原有首頁' }),
      ]);
    api = await import('../../src/pages/api/admin/[...path]');
  });

  afterAll(async () => {
    await cleanupTestDatabase(admin, name, database?.getPool());
    if (directory) {
      const target = path.resolve(directory);
      if (
        !target.startsWith(path.resolve(os.tmpdir()) + path.sep) ||
        !path.basename(target).startsWith('kaiyo-media-recovery-')
      )
        throw new Error('拒絕清除測試目錄以外的檔案');
      await rm(target, { recursive: true, force: true });
    }
  });

  it('設定版本遷移保留既有內容且可重跑', async () => {
    const migration = await readFile(
      new URL('../../db/migrations/008_settings_version.sql', import.meta.url),
      'utf8',
    );
    await database.getPool().query(migration);
    await database.getPool().query(migration);
    expect(await current()).toMatchObject({ tagline: '既有設定', version: 1 });
  });

  it('缺少或非法版本拒絕寫入，設定 JSON 不包含版本', async () => {
    const original = await current();
    for (const version of [undefined, 0, -1, 1.5, '1'])
      expect((await call('PUT', { ...original, version, tagline: '不應寫入' })).status).toBe(400);
    expect(await current()).toEqual(original);
    const response = await call('PUT', { ...original, siteUrl: 'https://invalid.example' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ version: original.version + 1, siteUrl: origin });
    const [stored] = await database.db().select().from(database.settings);
    expect(stored.value).not.toHaveProperty('version');
  });

  it('設定與關於頁的舊快照不能覆蓋另一分頁的變更', async () => {
    const original = await current();
    const first = await call('PUT', { ...original, homeIntro: '# 已儲存的新首頁' });
    expect(first.status).toBe(200);
    const stale = await call('PUT', { ...original, about: '# 舊分頁編輯的關於我' });
    expect(stale.status).toBe(409);
    const latest = await current();
    expect(latest.homeIntro).toBe('# 已儲存的新首頁');
    expect(latest.about).toBe(original.about);
    expect(latest.version).toBe(original.version + 1);
    expect((await call('PUT', { ...latest, about: '# 重新載入後編輯' })).status).toBe(200);
  });

  it('同版本併發更新只能有一筆成功，沒有靜默覆蓋', async () => {
    const original = await current();
    const responses = await Promise.all([
      call('PUT', { ...original, tagline: '並行修改甲' }),
      call('PUT', { ...original, tagline: '並行修改乙' }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect((await current()).version).toBe(original.version + 1);
  });

  it('參照缺失圖片的設定不會消耗版本或改變內容', async () => {
    const original = await current();
    expect((await call('PUT', { ...original, avatar: `/media/${randomUUID()}.webp` })).status).toBe(
      400,
    );
    expect(await current()).toEqual(original);
  });

  it('真實 INSERT 成功後模擬回應斷線，圖片與資料庫記錄都保留', async () => {
    const id = randomUUID();
    const file = path.join(directory, `${id}.webp`);
    await writeFile(file, '測試圖片');
    const find = async () =>
      (await database.getPool().query('SELECT * FROM media WHERE id=$1', [id])).rows[0];
    const recovered = await persistMediaFile({
      insert: async () => {
        await database
          .getPool()
          .query(
            "INSERT INTO media(id,name,mime,size,width,height) VALUES($1,'提交後斷線.webp','image/webp',12,1,1)",
            [id],
          );
        throw new Error('資料庫已提交，但模擬連線未收到結果');
      },
      find,
      remove: () => unlink(file),
    });
    expect(recovered.id).toBe(id);
    await expect(access(file)).resolves.toBeUndefined();
    expect(await find()).toBeDefined();
  });

  it('提交後連查詢也中斷時仍保留圖片，後續可找回記錄', async () => {
    const id = randomUUID();
    const file = path.join(directory, `${id}.webp`);
    await writeFile(file, '測試圖片');
    const error = new Error('結果不明');
    await expect(
      persistMediaFile({
        insert: async () => {
          await database
            .getPool()
            .query(
              "INSERT INTO media(id,name,mime,size,width,height) VALUES($1,'結果不明.webp','image/webp',12,1,1)",
              [id],
            );
          throw error;
        },
        find: async () => {
          throw new Error('模擬查詢連線中斷');
        },
        remove: () => unlink(file),
      }),
    ).rejects.toBe(error);
    await expect(access(file)).resolves.toBeUndefined();
    expect(
      (await database.getPool().query('SELECT id FROM media WHERE id=$1', [id])).rowCount,
    ).toBe(1);
  });

  it('真實 NOT NULL 拒絕且查無記錄時才移除孤立檔案', async () => {
    const id = randomUUID();
    const file = path.join(directory, `${id}.webp`);
    await writeFile(file, '測試圖片');
    await expect(
      persistMediaFile({
        insert: async () =>
          database
            .getPool()
            .query(
              "INSERT INTO media(id,name,mime,size,width,height) VALUES($1,NULL,'image/webp',12,1,1)",
              [id],
            ),
        find: async () =>
          (await database.getPool().query('SELECT id FROM media WHERE id=$1', [id])).rows[0],
        remove: () => unlink(file),
      }),
    ).rejects.toMatchObject({ code: '23502' });
    await expect(access(file)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
