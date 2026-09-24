import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Each integration file uses its own database; never seed or mutate production.
describe.skipIf(!process.env.DATABASE_URL)('PostgreSQL list pagination and ordering', () => {
  let admin: pg.Pool;
  let name: string;
  let database: typeof import('../../src/lib/db');
  let listing: typeof import('../../src/lib/admin-listing');
  let content: typeof import('../../src/lib/content');
  beforeAll(async () => {
    const source = process.env.DATABASE_URL!;
    admin = new pg.Pool({ connectionString: source });
    name = `kaiyo_listing_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE ${name}`);
    const url = new URL(source);
    url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.href;
    database = await import('../../src/lib/db');
    await database.getPool().query(await readFile(new URL('../../db/migrations/001_initial.sql', import.meta.url), 'utf8'));
    listing = await import('../../src/lib/admin-listing');
    content = await import('../../src/lib/content');
    const { emptyContent } = await import('../../src/lib/defaults');
    for (let i = 1; i <= 25; i++) {
      const n = String(i).padStart(2, '0');
      const value = { ...emptyContent, title: `Note ${n}`, slug: `note-${n}`, body: 'Published content', category: 'Engineering', tags: ['API'] };
      // A private draft title must not affect public ordering or search.
      const draft = { ...value, title: `Private ${String(26 - i).padStart(2, '0')}` };
      await database.getPool().query(
        'INSERT INTO entries(id,kind,content,published,published_at,updated_at) VALUES($1,$2,$3,$4,$5,$5)',
        [`entry-${n}`, 'article', JSON.stringify(draft), JSON.stringify(value), new Date(Date.UTC(2026, 0, i))],
      );
      await database.getPool().query(
        'INSERT INTO media(id,name,alt,mime,size,width,height,created_at) VALUES($1,$2,$3,$4,$5,10,10,$6)',
        [`media-${n}`, `Image ${n}.png`, i === 25 ? '100%_ literal' : '', 'image/webp', i * 100, new Date(Date.UTC(2026, 0, i))],
      );
    }
    await database.getPool().query(`INSERT INTO entries(id,kind,content) VALUES('draft','article',$1)`, [JSON.stringify({ ...emptyContent, title: 'Private draft', slug: 'draft' })]);
    await database.getPool().query(`INSERT INTO entries(id,kind,content,published,deleted_at) VALUES('trash','article',$1,$1,now())`, [JSON.stringify({ ...emptyContent, title: 'Trash', slug: 'trash' })]);
    await database.getPool().query(`INSERT INTO settings(id,value) VALUES(1,$1)`, [JSON.stringify({ avatar: '/media/media-25.webp' })]);
  });
  afterAll(async () => {
    if (database) await database.getPool().end();
    if (name) await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    if (admin) await admin.end();
  });
  it('sorts all public results before slicing and preserves snapshot privacy', async () => {
    const result = await content.listPublished({ kind: 'article', sort: 'title-asc', page: 2, pageSize: 8, category: 'Engineering', tag: 'API' });
    expect(result).toMatchObject({ total: 25, page: 2, pages: 4, from: 9, to: 16 });
    expect(result.items.map((item) => item.title)).toEqual(Array.from({ length: 8 }, (_, i) => `Note ${String(i + 9).padStart(2, '0')}`));
    expect((await content.listPublished({ kind: 'article', q: 'Private' })).total).toBe(0);
    const oldest = await content.listPublished({ kind: 'article', sort: 'oldest', pageSize: 8 });
    expect(oldest.items[0].title).toBe('Note 01');
    const newest = await content.listPublished({ kind: 'article', sort: 'newest', pageSize: 8 });
    expect(newest.items[0].title).toBe('Note 25');
  });
  it('uses admin draft titles for global sorting, and filters before counting', async () => {
    const result = await listing.listAdminEntries(new URLSearchParams('kind=article&status=published&sort=title-asc&pageSize=10&page=2'));
    expect(result).toMatchObject({ total: 25, page: 2, pages: 3, from: 11, to: 20 });
    expect(result.items[0].content.title).toBe('Private 11');
    expect((await listing.listAdminEntries(new URLSearchParams('status=draft'))).items.map((e) => e.id)).toEqual(['draft']);
    expect((await listing.listAdminEntries(new URLSearchParams('status=trash'))).items.map((e) => e.id)).toEqual(['trash']);
    expect((await listing.listAdminEntries(new URLSearchParams('q=100%25_'))).total).toBe(0);
    expect((await listing.listAdminEntries(new URLSearchParams('kind=project'))).total).toBe(0);
  });
  it('has stable ID tie-breakers across page boundaries', async () => {
    await database.getPool().query(`UPDATE entries SET updated_at='2026-01-01' WHERE published IS NOT NULL`);
    const first = await listing.listAdminEntries(new URLSearchParams('status=published&sort=updated-desc&pageSize=20'));
    const second = await listing.listAdminEntries(new URLSearchParams('status=published&sort=updated-desc&pageSize=20&page=2'));
    expect(new Set([...first.items, ...second.items].map((e) => e.id)).size).toBe(25);
    expect(first.items[0].id).toBe('entry-25');
    expect(second.items.at(-1)?.id).toBe('entry-01');
  });
  it('paginates media with global size ordering and accurate usage', async () => {
    const first = await listing.listAdminMedia(new URLSearchParams('sort=size-desc&pageSize=12'));
    expect(first).toMatchObject({ total: 25, pages: 3, from: 1, to: 12 });
    expect(first.items[0]).toMatchObject({ name: 'Image 25.png', usedBy: ['Site settings / About me'] });
    const second = await listing.listAdminMedia(new URLSearchParams('sort=size-desc&pageSize=12&page=2'));
    expect(second.items[0].name).toBe('Image 13.png');
    const literal = await listing.listAdminMedia(new URLSearchParams({ q: '100%_' }));
    expect(literal.total).toBe(1);
    expect(literal.items[0].id).toBe('media-25');
  });
  it('normalizes invalid input and clamps a page after the last item is deleted', async () => {
    const invalid = await listing.listAdminEntries(new URLSearchParams('sort=title;DROP TABLE entries&pageSize=Infinity&page=-1'));
    expect(invalid).toMatchObject({ page: 1, pageSize: 20 });
    await database.getPool().query(`DELETE FROM media WHERE id='media-25'`);
    const result = await listing.listAdminMedia(new URLSearchParams('pageSize=12&page=3'));
    expect(result).toMatchObject({ total: 24, pages: 2, page: 2, from: 13, to: 24 });
    expect(result.items).toHaveLength(12);
    const empty = await listing.listAdminMedia(new URLSearchParams('q=absent&page=999999'));
    expect(empty).toMatchObject({ total: 0, page: 1, pages: 1, from: 0, to: 0, items: [] });
  });
});
