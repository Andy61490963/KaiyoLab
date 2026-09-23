import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { contentSchema } from '../../src/lib/http';
import type { EntryContent } from '../../src/lib/types';

const source = process.env.DATABASE_URL;
const seed = await readFile(
  new URL('../../db/migrations/006_requested_engineering_notes.sql', import.meta.url),
  'utf8',
);
const existingContent = {
  title: 'Keep my writing',
  slug: 'dotnet-di-multiple-implementations',
  body: 'Original content',
  excerpt: '',
  cover: '',
  coverAlt: '',
  category: '',
  tags: [],
  featured: false,
  seoTitle: '',
  seoDescription: '',
  demoUrl: '',
  repoUrl: '',
};

describe.skipIf(!source)('requested notes: isolated database migration', () => {
  const databaseName = `kaiyo_seed_test_${randomUUID().replaceAll('-', '')}`;
  let admin: pg.Pool;
  let client: pg.Client;
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: source });
    await admin.query(`CREATE DATABASE ${databaseName}`);
    const url = new URL(source!);
    url.pathname = `/${databaseName}`;
    client = new pg.Client({ connectionString: url.href });
    await client.connect();
    await client.query(
      await readFile(new URL('../../db/migrations/001_initial.sql', import.meta.url), 'utf8'),
    );
  });
  beforeEach(async () => {
    await client.query('BEGIN');
  });
  afterEach(async () => {
    await client.query('ROLLBACK');
  });
  afterAll(async () => {
    if (client) await client.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      await admin.end();
    }
  });
  it('inserts five real, editable published notes and is repeatable', async () => {
    await client.query(seed);
    const first = await client.query<{
      id: string;
      content: EntryContent;
      published: EntryContent;
      published_at: Date;
    }>('SELECT * FROM entries ORDER BY id');
    expect(first.rows).toHaveLength(5);
    for (const row of first.rows) {
      expect(contentSchema.safeParse(row.content).success).toBe(true);
      expect(row.published).toEqual(row.content);
      expect(row.content.body.length).toBeGreaterThan(500);
      expect(row.content.body).toContain('https://');
      expect(row.published_at).toBeInstanceOf(Date);
    }
    await client.query(seed);
    expect((await client.query('SELECT * FROM entries ORDER BY id')).rows).toEqual(first.rows);
    expect((await client.query('SELECT * FROM settings')).rowCount).toBe(0);
  });
  it.each([false, true])(
    'never replaces an existing matching slug, including trash: %s',
    async (deleted) => {
      await client.query('INSERT INTO entries(id,kind,content,deleted_at) VALUES($1,$2,$3,$4)', [
        randomUUID(),
        'article',
        existingContent,
        deleted ? new Date() : null,
      ]);
      const original = (await client.query('SELECT * FROM entries')).rows[0];
      await client.query(seed);
      expect(
        (await client.query('SELECT * FROM entries WHERE id=$1', [original.id])).rows[0],
      ).toEqual(original);
      expect((await client.query('SELECT count(*)::int AS count FROM entries')).rows[0].count).toBe(
        5,
      );
    },
  );
  it('does not resurrect a seeded note or overwrite subsequent edits', async () => {
    await client.query(seed);
    await client.query(
      "UPDATE entries SET content = jsonb_set(content, '{title}', '\"An edited note\"'::jsonb), version=2, deleted_at=now(), published=NULL WHERE content->>'slug'=$1",
      [existingContent.slug],
    );
    const before = (await client.query('SELECT * FROM entries ORDER BY id')).rows;
    await client.query(seed);
    expect((await client.query('SELECT * FROM entries ORDER BY id')).rows).toEqual(before);
  });
});
