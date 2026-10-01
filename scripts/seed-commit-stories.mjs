import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

export const CONTENT_BATCH = 'commit-stories-20261001';
export const TARGET_ORIGIN = 'https://kaiyo.zeabur.app';
const CHECKSUM = 'adca6cc9f9b49285882a219f0aa5cf1b138f75763a2bff1ca913006b4c432c32';
const MARKER = `content/${CONTENT_BATCH}`;
const MIGRATION_LOCK = 620214;
const CONTENT_LOCK = 620215;

function isTargetSite(siteUrl) {
  try {
    const url = new URL(siteUrl);
    return url.origin === TARGET_ORIGIN && !url.username && !url.password && url.pathname === '/';
  } catch {
    return false;
  }
}

export async function readCommitStories() {
  const bytes = await readFile(new URL('../db/content/commit-stories-20261001.json.gz', import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== CHECKSUM)
    throw new Error('Commit story payload checksum mismatch');
  const payload = JSON.parse(gunzipSync(bytes, { maxOutputLength: 256 * 1024 }).toString('utf8'));
  if (payload.format !== 'kaiyolab-draft-seed' || payload.version !== 1 ||
      payload.batch !== CONTENT_BATCH || payload.siteOrigin !== TARGET_ORIGIN ||
      !Array.isArray(payload.entries) || payload.entries.length !== 5 ||
      new Set(payload.entries.map((item) => item.id)).size !== 5 ||
      payload.entries.some((item) => !item.content?.body?.trim()))
    throw new Error('Invalid commit story payload');
  return payload.entries;
}

async function availableSlug(client, desired) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const suffix = attempt ? `-story-${attempt}` : '';
    const slug = `${desired.slice(0, 160 - suffix.length)}${suffix}`;
    const result = await client.query(
      `SELECT 1 FROM entries WHERE kind = 'article'
         AND (content->>'slug' = $1 OR published->>'slug' = $1)
       UNION ALL SELECT 1 FROM entry_slugs WHERE kind = 'article' AND slug = $1 LIMIT 1`,
      [slug],
    );
    if (!result.rowCount) return slug;
  }
  throw new Error('Unable to allocate a commit story URL without overwriting existing content');
}

async function ensureTaxonomy(client, kind, name) {
  const existing = await client.query('SELECT id FROM taxonomies WHERE kind = $1 AND name = $2', [kind, name]);
  if (existing.rowCount) return;
  const id = randomUUID();
  const stem = name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || kind;
  // The suffix avoids collisions with existing category/tag URLs; names are reused above.
  await client.query(
    'INSERT INTO taxonomies(id,kind,name,slug) VALUES($1,$2,$3,$4)',
    [id, kind, name, `${stem.slice(0, 115)}-${id}`],
  );
}

// One explicit owner-requested content batch, not a general import endpoint.
// The caller owns this dedicated connection; do not invoke within another transaction.
export async function seedCommitStories(client, siteUrl) {
  if (!isTargetSite(siteUrl)) return null;
  const stories = await readCommitStories();
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);
    await client.query('SELECT pg_advisory_xact_lock($1)', [CONTENT_LOCK]);
    const marker = await client.query('SELECT checksum FROM schema_migrations WHERE name = $1', [MARKER]);
    if (marker.rowCount) {
      if (marker.rows[0].checksum !== CHECKSUM) throw new Error('Commit story batch checksum changed');
      await client.query('COMMIT');
      return { batch: CONTENT_BATCH, status: 'already-applied' };
    }
    const state = await client.query('SELECT setup_complete, owner_id FROM system_state WHERE id = 1');
    if (!state.rows[0]?.setup_complete || !state.rows[0]?.owner_id) {
      await client.query('ROLLBACK');
      return null;
    }
    let created = 0;
    let preserved = 0;
    const order = await client.query("SELECT COALESCE(MAX(sort_order), -1) AS last FROM entries WHERE kind = 'article'");
    let nextOrder = Number(order.rows[0].last) + 1;
    for (const story of stories) {
      const existing = await client.query(
        `SELECT id,kind,content->>'title' AS title FROM entries WHERE id = $1 OR (kind = 'article' AND
          (content->>'title' = $2 OR published->>'title' = $2))`,
        [story.id, story.content.title],
      );
      if (existing.rows.some((row) => row.id === story.id &&
          (row.kind !== 'article' || row.title !== story.content.title)))
        throw new Error('A commit story ID belongs to different content; nothing was overwritten');
      if (existing.rowCount) {
        // Preserve existing, edited, published and trashed copies; never resurrect or overwrite.
        preserved++;
        continue;
      }
      if (!Number.isSafeInteger(nextOrder) || nextOrder > 2147483647)
        throw new Error('Article order has reached its storage limit');
      const content = { ...story.content, slug: await availableSlug(client, story.content.slug) };
      if (content.category) await ensureTaxonomy(client, 'category', content.category);
      for (const tag of content.tags) await ensureTaxonomy(client, 'tag', tag);
      const inserted = await client.query(
        `INSERT INTO entries(id,kind,content,published,published_at,published_updated_at,
          deleted_at,version,sort_order) VALUES($1,'article',$2::jsonb,NULL,NULL,NULL,NULL,1,$3)
          RETURNING id, content, published`,
        [story.id, JSON.stringify(content), nextOrder++],
      );
      if (inserted.rowCount !== 1 || inserted.rows[0].content.body !== story.content.body ||
          inserted.rows[0].published !== null) throw new Error('Commit story draft verification failed');
      await client.query(
        `INSERT INTO entry_revisions(id,entry_id,content,source,version)
          VALUES($1,$2,$3::jsonb,'draft',1)`,
        [randomUUID(), story.id, JSON.stringify(content)],
      );
      created++;
    }
    await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [MARKER, CHECKSUM]);
    await client.query('COMMIT');
    // Only non-sensitive batch status is exposed in the deployment receipt, never draft content.
    return { batch: CONTENT_BATCH, status: 'applied', created, preserved };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Keep the original failure; reconnect to inspect an uncertain commit. */ }
    throw error;
  }
}
