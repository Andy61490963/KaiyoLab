import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import type { APIContext } from 'astro';
import { defaultSettings, emptyContent } from '../../src/lib/defaults';
import { ARTICLE_VIEWS_KEY } from '../../src/lib/view-metrics';

const source = process.env.DATABASE_URL;
describe.skipIf(!source)('persistent article views without schema changes', () => {
  let admin: pg.Pool, pool: pg.Pool, name: string;
  let views: typeof import('../../src/lib/article-views');
  let api: typeof import('../../src/pages/api/admin/[...path]');
  let route: typeof import('../../src/pages/api/article-views/[id]');
  let content: typeof import('../../src/lib/content');
  const origin = 'http://localhost:4321';
  const closedConnections: Promise<void>[] = [];
  const trackConnection = (client: pg.PoolClient) => {
    closedConnections.push(new Promise<void>((resolve) => client.once('end', () => resolve())));
  };
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: source });
    name = `view_test_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE ${name}`);
    const url = new URL(source!);
    url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.href;
    process.env.SITE_URL = origin;
    process.env.BETTER_AUTH_SECRET = 'integration-view-secret-000000000000000000000';
    const database = await import('../../src/lib/db');
    pool = database.getPool();
    pool.on('connect', trackConnection);
    await pool.query(
      await readFile(new URL('../../db/migrations/001_initial.sql', import.meta.url), 'utf8'),
    );
    await pool.query('INSERT INTO settings(id,value) VALUES(1,$1)', [
      { ...defaultSettings, homeIntro: '# Original' },
    ]);
    const article = {
      ...emptyContent,
      title: 'Unchanged title',
      slug: 'public',
      body: '## Body\n\nOriginal',
    };
    await pool.query(
      `INSERT INTO entries(id,kind,content,published,published_at) VALUES
      ('public','article',$1,$1,now()),('private','article',jsonb_set($1,'{slug}','"private"'),NULL,NULL),('project','project',$1,$1,now())`,
      [article],
    );
    await pool.query(
      `INSERT INTO entries(id,kind,content,published,deleted_at) VALUES ('trash','article',$1,$1,now())`,
      [article],
    );
    views = await import('../../src/lib/article-views');
    api = await import('../../src/pages/api/admin/[...path]');
    route = await import('../../src/pages/api/article-views/[id]');
    content = await import('../../src/lib/content');
  });
  afterAll(async () => {
    try {
      if (pool) await pool.end();
      // Pool.end() can finish removing idle clients before their sockets emit 'end'.
      // Do not force-terminate those still-closing connections during fixture teardown.
      await Promise.all(closedConnections);
      if (admin && name) await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    } finally {
      if (admin) await admin.end();
      process.env.DATABASE_URL = source;
    }
  });
  it('GET never increments, and draft/project/trash IDs are not exposed', async () => {
    expect(await views.getArticleViews('public')).toBe(0);
    expect(await views.getArticleViews('public')).toBe(0);
    for (const id of ['private', 'project', 'trash', 'absent']) {
      await expect(views.getArticleViews(id)).rejects.toMatchObject({ status: 404 });
      await expect(views.incrementArticleViews(id)).rejects.toMatchObject({ status: 404 });
    }
  });
  it('serializes concurrent increments without changing publishing versions or content', async () => {
    const before = (await pool.query('SELECT * FROM entries ORDER BY id')).rows;
    const results = await Promise.all(
      Array.from({ length: 24 }, () => views.incrementArticleViews('public')),
    );
    expect([...results].sort((a, b) => a - b)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    expect(await views.getArticleViews('public')).toBe(24);
    expect((await pool.query('SELECT * FROM entries ORDER BY id')).rows).toEqual(before);
    const other = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    other.on('connect', trackConnection);
    try {
      expect(await views.getArticleViews('public', other)).toBe(24);
    } finally {
      await other.end();
    }
  });
  it('preserves counters during concurrent admin settings saves and hides them in settings reads', async () => {
    const before = await views.getArticleViews('public');
    const save = () =>
      api.ALL!({
        request: new Request(`${origin}/api/admin/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...defaultSettings,
            homeIntro: '# Keep my edits',
            [ARTICLE_VIEWS_KEY]: { public: 999999 },
          }),
        }),
        params: { path: 'settings' },
        url: new URL(`${origin}/api/admin/settings`),
      } as unknown as APIContext);
    await Promise.all([
      save(),
      save(),
      ...Array.from({ length: 12 }, () => views.incrementArticleViews('public')),
    ]);
    expect(await views.getArticleViews('public')).toBe(before + 12);
    const result = await content.getSettings();
    expect(result.homeIntro).toBe('# Keep my edits');
    expect(result).not.toHaveProperty(ARTICLE_VIEWS_KEY);
  });
  it('API validates Origin, methods, payloads, visibility and signed cooldown receipts', async () => {
    const jar = new Map<string, string>();
    const call = async (id: string, method = 'POST', originHeader = origin, payload?: string) => {
      const request = new Request(`${origin}/api/article-views/${id}`, {
        method,
        headers: { Origin: originHeader },
        body: payload,
      });
      return (await route.ALL!({
        request,
        params: { id },
        url: new URL(request.url),
        cookies: {
          get: (key: string) => (jar.has(key) ? { value: jar.get(key) } : undefined),
          set: (key: string, value: string) => jar.set(key, value),
        },
      } as unknown as APIContext)) as Response;
    };
    expect((await call('public', 'POST', 'https://evil.example')).status).toBe(403);
    expect((await call('public', 'DELETE')).status).toBe(405);
    expect((await call('public', 'POST', origin, '{"views":9000}')).status).toBe(400);
    expect((await call('private')).status).toBe(404);
    const before = await views.getArticleViews('public');
    expect((await call('public', 'GET')).status).toBe(200);
    expect(await views.getArticleViews('public')).toBe(before);
    expect(await (await call('public')).json()).toEqual({ views: before + 1, counted: true });
    expect(await (await call('public')).json()).toEqual({ views: before + 1, counted: false });
    expect(jar.size).toBe(1);
  });
  it('does not reset corrupt counts or expose errors, and unavailable telemetry is isolated', async () => {
    await pool.query(
      'UPDATE settings SET value=jsonb_set(value,ARRAY[$1,$2],$3::jsonb) WHERE id=1',
      [ARTICLE_VIEWS_KEY, 'public', '"bad-count"'],
    );
    await expect(views.incrementArticleViews('public')).rejects.toThrow(
      'Invalid article view count',
    );
    expect((await content.getPublished('article', 'public'))?.title).toBe('Unchanged title');
    const response = (await route.ALL!({
      request: new Request(`${origin}/api/article-views/public`),
      params: { id: 'public' },
      url: new URL(origin),
    } as unknown as APIContext)) as Response;
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('bad-count');
  });
});
