import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const migration = await readFile(
  new URL('../../db/migrations/006_engineering_notes.sql', import.meta.url),
  'utf8',
);
const source = process.env.DATABASE_URL;
// Temporary tables shadow real tables. Every test rolls back; no production data is changed.
describe.skipIf(!source)('owner-requested article seed', () => {
  let client: pg.Client;
  beforeEach(async () => {
    client = new pg.Client({ connectionString: source });
    await client.connect();
    await client.query('BEGIN');
    await client.query(`
      CREATE TEMP TABLE entries (LIKE public.entries INCLUDING ALL) ON COMMIT DROP;
      CREATE TEMP TABLE taxonomies (LIKE public.taxonomies INCLUDING ALL) ON COMMIT DROP;
      CREATE TEMP TABLE settings (LIKE public.settings INCLUDING ALL) ON COMMIT DROP;
      INSERT INTO settings VALUES(1, '{"homeIntro":"# My original timeline","about":"私人自訂介紹"}');
    `);
  });
  afterEach(async () => {
    if (client) {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
  const snapshot = async () => (await client.query('SELECT * FROM entries ORDER BY id')).rows;
  it('inserts five full public snapshots with actual dates and usable taxonomies', async () => {
    const before = (await client.query('SELECT * FROM settings')).rows;
    await client.query(migration);
    const rows = await snapshot();
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.content).toEqual(row.published);
      expect(row.content.body.length).toBeGreaterThan(1000);
      expect(row.content.body).toContain('https://');
      expect(row.version).toBe(1);
      expect(row.published_at).not.toBeNull();
      expect(row.deleted_at).toBeNull();
    }
    expect(
      (await client.query('SELECT count(*)::int AS n FROM taxonomies')).rows[0].n,
    ).toBeGreaterThan(5);
    expect((await client.query('SELECT * FROM settings')).rows).toEqual(before);
  });
  it('never overwrites edits, republishes drafts, restores trash, or changes dates', async () => {
    await client.query(migration);
    const rows = await snapshot();
    await client.query(
      "UPDATE entries SET content = jsonb_set(content, '{body}', '\"My edited body\"'), version = 7 WHERE id=$1",
      [rows[0].id],
    );
    await client.query('UPDATE entries SET published=NULL WHERE id=$1', [rows[1].id]);
    await client.query('UPDATE entries SET deleted_at=now() WHERE id=$1', [rows[2].id]);
    const before = await snapshot();
    const taxonomyBefore = (await client.query('SELECT * FROM taxonomies ORDER BY id')).rows;
    await client.query(migration);
    expect(await snapshot()).toEqual(before);
    expect((await client.query('SELECT * FROM taxonomies ORDER BY id')).rows).toEqual(
      taxonomyBefore,
    );
  });
  it('protects conflicting private/deleted and published slugs even under different IDs', async () => {
    await client.query(`INSERT INTO entries(id,kind,content,deleted_at) VALUES
      ('existing-private','article','{"slug":"tls-name-mismatch-file-sync","body":"Keep this private"}',now());
      INSERT INTO entries(id,kind,content,published,published_at) VALUES
      ('existing-live','article','{"slug":"my-new-slug"}','{"slug":"502-follow-the-request","body":"Keep this live"}',now());`);
    const before = await snapshot();
    await client.query(migration);
    expect(await snapshot()).toHaveLength(5);
    for (const row of before) expect((await snapshot()).find((r) => r.id === row.id)).toEqual(row);
  });
});
