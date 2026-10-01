import type { APIContext } from 'astro';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { emptyContent } from '../../src/lib/defaults';
import type { Entry, EntryContent } from '../../src/lib/types';
import { cleanupTestDatabase } from '../helpers/database-cleanup';

 describe.skipIf(!process.env.DATABASE_URL)('draft body protection and recovery', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalSiteUrl = process.env.SITE_URL;
  let admin: pg.Pool;
  let name: string;
  let database: typeof import('../../src/lib/db');
  let legacy: typeof import('../../src/pages/api/admin/[...path]');
  let restoreRoute: typeof import('../../src/pages/api/admin/entries/[id]/restore-body');

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: originalDatabaseUrl! });
    name = `kaiyo_test_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE ${name}`);
    const connection = new URL(originalDatabaseUrl!);
    connection.pathname = `/${name}`;
    process.env.DATABASE_URL = connection.href;
    process.env.SITE_URL = 'http://localhost:4321';
    database = await import('../../src/lib/db');
    for (const file of [
      '001_initial.sql',
      '007_content_history.sql',
      '008_settings_version.sql',
      '009_entry_order.sql',
    ])
      await database
        .getPool()
        .query(await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8'));
    legacy = await import('../../src/pages/api/admin/[...path]');
    restoreRoute = await import('../../src/pages/api/admin/entries/[id]/restore-body');
  });

  beforeEach(async () => {
    await database.getPool().query('TRUNCATE entries, entry_revisions, entry_slugs, taxonomies CASCADE');
  });

  afterAll(async () => {
    try {
      await cleanupTestDatabase(admin, name, database?.getPool());
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
      if (originalSiteUrl === undefined) delete process.env.SITE_URL;
      else process.env.SITE_URL = originalSiteUrl;
    }
  });

  const published: EntryContent = {
    ...emptyContent,
    title: 'Published title',
    slug: 'original-url',
    body: '# Published\n\n```mermaid\nflowchart LR\nA-->B\n```\n',
  };
  const draft: EntryContent = {
    ...emptyContent,
    title: 'Current title',
    slug: 'guid',
    body: '',
    tags: ['冪等', 'Backend'],
    excerpt: 'Current summary',
    series: 'Current series',
    seriesOrder: 2,
    coverPosition: { x: 25, y: 75 },
  };

  async function seed(options: {
    body?: string;
    published?: EntryContent | null;
    deletedAt?: Date | null;
  } = {}) {
    const [row] = await database.db().insert(database.entries).values({
      id: randomUUID(),
      kind: 'article',
      content: { ...draft, body: options.body ?? '' },
      published: options.published === undefined ? published : options.published,
      version: 17,
      publishedAt: new Date('2026-01-01T00:00:00Z'),
      publishedUpdatedAt: new Date('2026-01-02T00:00:00Z'),
      deletedAt: options.deletedAt ?? null,
    }).returning();
    return row;
  }
  async function call(method: string, path: string, payload?: unknown) {
    const url = new URL(`/api/admin/${path}`, 'http://localhost:4321');
    return await legacy.ALL({
      request: new Request(url, {
        method,
        headers: { 'Content-Type': 'application/json', Origin: url.origin },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      }),
      params: { path },
      url,
    } as APIContext);
  }
  async function restore(id: string, payload: unknown = { version: 17 }) {
    const url = new URL(`/api/admin/entries/${id}/restore-body`, 'http://localhost:4321');
    return await restoreRoute.POST({
      request: new Request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: url.origin },
        body: JSON.stringify(payload),
      }),
      params: { id },
      url,
    } as APIContext);
  }
  async function stored() {
    const [row] = await database.db().select().from(database.entries);
    return row;
  }
  async function revisions() {
    return await database.db().select().from(database.entryRevisions);
  }

  it('GET does not silently repair or write an empty draft', async () => {
    const before = await seed();
    const response = await call('GET', `entries/${before.id}`);
    expect(response.status).toBe(200);
    const result = await response.json() as Entry;
    expect(result.content.body).toBe('');
    expect(result.published?.body).toBe(published.body);
    expect(await stored()).toEqual(before);
    expect(await revisions()).toHaveLength(0);
  });

  it.each(['', ' \n\t'])('rejects an unconfirmed empty body %j without any mutation', async (body) => {
    const before = await seed({ body: 'Recent unpublished work' });
    const response = await call('PATCH', `entries/${before.id}`, {
      version: 17,
      content: { ...before.content, body, slug: 'should-not-change' },
    });
    expect(response.status).toBe(422);
    expect(await stored()).toEqual(before);
    expect(await revisions()).toHaveLength(0);
  });

  it('explicit clearing creates an immediate pre-clear revision without changing publication', async () => {
    const before = await seed({ body: 'Newest draft body' });
    await database.db().insert(database.entryRevisions).values({
      id: randomUUID(), entryId: before.id, version: 16, source: 'draft',
      content: { ...draft, body: 'Earlier checkpoint' }, createdAt: new Date(),
    });
    const response = await call('PATCH', `entries/${before.id}`, {
      version: 17, content: { ...before.content, body: '' }, confirmEmptyBody: true,
    });
    expect(response.status).toBe(200);
    const after = await stored();
    expect(after.content.body).toBe('');
    expect(after.version).toBe(18);
    expect(after.published).toEqual(before.published);
    expect(after.publishedUpdatedAt).toEqual(before.publishedUpdatedAt);
    expect(await revisions()).toEqual(expect.arrayContaining([
      expect.objectContaining({ version: 17, source: 'draft', content: before.content }),
    ]));
  });

  it('keeps supporting metadata edits on a draft that is already empty', async () => {
    const before = await seed();
    const content = { ...before.content, title: 'Updated metadata' };
    const response = await call('PATCH', `entries/${before.id}`, { version: 17, content });
    expect(response.status).toBe(200);
    expect((await stored()).content).toEqual(content);
    expect((await stored()).published).toEqual(before.published);
  });

  it('restores only the body, keeps the current slug/tags and leaves publication dates intact', async () => {
    const before = await seed();
    const response = await restore(before.id);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const after = await stored();
    expect(after.content).toEqual({ ...before.content, body: published.body });
    expect(after.version).toBe(18);
    expect(after.published).toEqual(before.published);
    expect(after.publishedAt).toEqual(before.publishedAt);
    expect(after.publishedUpdatedAt).toEqual(before.publishedUpdatedAt);
    expect(await revisions()).toEqual([
      expect.objectContaining({ version: 17, source: 'restore', content: before.content }),
    ]);
  });

  it('does not overwrite a newer non-empty draft', async () => {
    const before = await seed({ body: 'Newer work' });
    expect((await restore(before.id)).status).toBe(409);
    expect(await stored()).toEqual(before);
    expect(await revisions()).toHaveLength(0);
  });

  it('rejects a stale restore version', async () => {
    const before = await seed();
    expect((await restore(before.id, { version: 16 })).status).toBe(409);
    expect(await stored()).toEqual(before);
    expect(await revisions()).toHaveLength(0);
  });

  it.each([null, { ...published, body: ' \n' }])('does not restore without a usable public body', async (value) => {
    const before = await seed({ published: value });
    expect((await restore(before.id)).status).toBe(422);
    expect(await stored()).toEqual(before);
    expect(await revisions()).toHaveLength(0);
  });

  it('allows only one concurrent recovery for a version', async () => {
    const before = await seed();
    const responses = await Promise.all([restore(before.id), restore(before.id)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect((await stored()).version).toBe(18);
    expect(await revisions()).toHaveLength(1);
  });

  it('does not recover trashed or missing entries', async () => {
    const before = await seed({ deletedAt: new Date() });
    expect((await restore(before.id)).status).toBe(409);
    expect((await restore(randomUUID())).status).toBe(404);
    expect(await stored()).toEqual(before);
  });

  it('does not accept metadata in a body-only recovery request', async () => {
    const before = await seed();
    expect((await restore(before.id, { version: 17, content: published })).status).toBe(400);
    expect(await stored()).toEqual(before);
  });
});
