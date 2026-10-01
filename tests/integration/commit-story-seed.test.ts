import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { readCommitStories, seedCommitStories, TARGET_ORIGIN } from '../../scripts/seed-commit-stories.mjs';
import { cleanupTestDatabase } from '../helpers/database-cleanup';

// Every operation below uses a newly created random test database, never the source database.
describe.skipIf(!process.env.DATABASE_URL)('one-time commit story creation', () => {
  let admin: pg.Pool;
  let pool: pg.Pool;
  let name: string;
  let stories: Awaited<ReturnType<typeof readCommitStories>>;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    name = `kaiyo_test_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE ${name}`);
    const connection = new URL(process.env.DATABASE_URL!);
    connection.pathname = `/${name}`;
    pool = new pg.Pool({ connectionString: connection.href });
    for (const file of ['001_initial.sql', '007_content_history.sql', '008_settings_version.sql', '009_entry_order.sql'])
      await pool.query(await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8'));
    await pool.query('CREATE TABLE schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz DEFAULT now())');
    await pool.query(`INSERT INTO "user"(id,name,email) VALUES('seed-test-owner','Test owner','owner@example.invalid')`);
    stories = await readCommitStories();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE entries,entry_revisions,entry_slugs,taxonomies,schema_migrations CASCADE');
    await pool.query('DELETE FROM settings');
    await pool.query(`INSERT INTO settings(id,value) VALUES(1,'{"keep":"owner settings"}'::jsonb)`);
    await pool.query("UPDATE system_state SET owner_id='seed-test-owner',setup_complete=true WHERE id=1");
  });

  afterAll(async () => {
    await cleanupTestDatabase(admin, name, pool);
  });

  async function apply(site = TARGET_ORIGIN) {
    const client = await pool.connect();
    try { return await seedCommitStories(client, site); }
    finally { client.release(); }
  }
  async function snapshot() {
    return {
      entries: (await pool.query('SELECT * FROM entries ORDER BY id')).rows,
      revisions: (await pool.query('SELECT * FROM entry_revisions ORDER BY id')).rows,
      settings: (await pool.query('SELECT * FROM settings')).rows,
      taxonomies: (await pool.query('SELECT * FROM taxonomies ORDER BY id')).rows,
    };
  }
  async function existingEntry(id: string, content: Record<string, unknown>, deleted = false) {
    await pool.query(
      `INSERT INTO entries(id,kind,content,published,published_at,published_updated_at,version,sort_order,deleted_at)
       VALUES($1,'article',$2::jsonb,$2::jsonb,'2026-01-01','2026-01-02',17,100,$3)`,
      [id, JSON.stringify(content), deleted ? new Date('2026-01-03') : null],
    );
  }

  it('creates five complete private drafts and initial revisions without touching existing content or settings', async () => {
    const existingId = randomUUID();
    await existingEntry(existingId, { ...stories[0].content, title: 'Existing author content', slug: 'keep-this', body: 'Do not change this' });
    const before = await snapshot();
    expect(await apply()).toEqual({ batch: 'commit-stories-20261001', status: 'applied', created: 5, preserved: 0 });
    const after = await snapshot();
    expect(after.entries.find((row) => row.id === existingId)).toEqual(before.entries[0]);
    expect(after.settings).toEqual(before.settings);
    for (const story of stories) {
      const row = after.entries.find((item) => item.id === story.id);
      expect(row.content).toEqual(story.content);
      expect(row.published).toBeNull();
      expect(row.published_at).toBeNull();
      expect(row.published_updated_at).toBeNull();
      expect(row.deleted_at).toBeNull();
      expect(row.version).toBe(1);
      expect(row.sort_order).toBe(100 + story.content.seriesOrder);
      expect(after.revisions.filter((item) => item.entry_id === story.id)).toEqual([
        expect.objectContaining({ content: story.content, source: 'draft', version: 1 }),
      ]);
    }
    expect(after.taxonomies.filter((row) => row.kind === 'category')).toHaveLength(1);
  });

  it('restarts do not overwrite edits, duplicate or resurrect deleted articles', async () => {
    await apply();
    await pool.query("UPDATE entries SET content=jsonb_set(content,'{body}','\"Author revision\"'::jsonb),version=2 WHERE id=$1", [stories[0].id]);
    await pool.query('DELETE FROM entries WHERE id=$1', [stories[1].id]);
    const before = await snapshot();
    expect(await apply()).toEqual({ batch: 'commit-stories-20261001', status: 'already-applied' });
    expect(await snapshot()).toEqual(before);
  });

  it('preserves a previously imported or trashed copy rather than overwriting by title', async () => {
    const id = randomUUID();
    await existingEntry(id, { ...stories[0].content, slug: 'previous-import', body: 'Newer author changes' }, true);
    const before = (await snapshot()).entries[0];
    expect(await apply()).toEqual({ batch: 'commit-stories-20261001', status: 'applied', created: 4, preserved: 1 });
    const rows = (await snapshot()).entries;
    expect(rows).toHaveLength(5);
    expect(rows.find((row) => row.id === id)).toEqual(before);
    expect(rows.some((row) => row.id === stories[0].id)).toBe(false);
  });

  it('allocates a different slug when a historical public URL is reserved', async () => {
    const id = randomUUID();
    await existingEntry(id, { ...stories[0].content, title: 'Unrelated owner article', slug: 'current-owner-url' });
    await pool.query("INSERT INTO entry_slugs(kind,slug,entry_id) VALUES('article',$1,$2)", [stories[0].content.slug, id]);
    await apply();
    const row = (await pool.query('SELECT content FROM entries WHERE id=$1', [stories[0].id])).rows[0];
    expect(row.content).toEqual({ ...stories[0].content, slug: `${stories[0].content.slug}-story-1` });
    expect((await pool.query('SELECT entry_id FROM entry_slugs WHERE slug=$1', [stories[0].content.slug])).rows[0].entry_id).toBe(id);
  });

  it('serializes concurrent startup attempts into one batch', async () => {
    const results = await Promise.all([apply(), apply()]);
    expect(results.map((item) => item?.status).sort()).toEqual(['already-applied', 'applied']);
    expect((await snapshot()).entries).toHaveLength(5);
    expect((await snapshot()).revisions).toHaveLength(5);
    expect((await pool.query('SELECT * FROM schema_migrations')).rowCount).toBe(1);
  });

  it('rolls back the entire batch if creating a history snapshot fails', async () => {
    const client = await pool.connect();
    const before = await snapshot();
    try {
      const failing = {
        query(text: string, values?: unknown[]) {
          if (text.includes('INSERT INTO entry_revisions')) throw new Error('Injected history failure');
          return client.query(text, values);
        },
      };
      await expect(seedCommitStories(failing, TARGET_ORIGIN)).rejects.toThrow('Injected history failure');
    } finally { client.release(); }
    expect(await snapshot()).toEqual(before);
    expect((await pool.query('SELECT * FROM schema_migrations')).rowCount).toBe(0);
    expect((await apply())?.created).toBe(5);
  });

  it('rejects a fixed ID collision without changing unrelated content', async () => {
    await existingEntry(stories[0].id, { ...stories[0].content, title: 'Unrelated content', slug: 'do-not-touch' });
    const before = await snapshot();
    await expect(apply()).rejects.toThrow('belongs to different content');
    expect(await snapshot()).toEqual(before);
  });

  it('does not seed other origins or an uninitialized site', async () => {
    expect(await apply('https://other.example')).toBeNull();
    await pool.query('UPDATE system_state SET setup_complete=false,owner_id=NULL WHERE id=1');
    expect(await apply()).toBeNull();
    expect((await snapshot()).entries).toHaveLength(0);
    expect((await pool.query('SELECT * FROM schema_migrations')).rowCount).toBe(0);
  });
});
