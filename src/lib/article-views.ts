import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { getPool, settings } from './db';
import type { SiteSettings } from './types';
import { HttpError } from './http';
import { ARTICLE_VIEWS_KEY, VIEW_COOLDOWN_SECONDS, parseViewCount } from './view-metrics';

interface CountRow {
  views: unknown;
  valid: boolean;
}

// Preserve the CURRENT counter document, not a stale copy read by the admin browser.
export function settingsWithPreservedViews(value: SiteSettings) {
  return sql`${JSON.stringify(value)}::jsonb || CASE
    WHEN ${settings.value} ? ${ARTICLE_VIEWS_KEY}
    THEN jsonb_build_object(${ARTICLE_VIEWS_KEY}::text, ${settings.value}->${ARTICLE_VIEWS_KEY})
    ELSE '{}'::jsonb END`;
}

async function inViewTransaction<T>(
  pool: pg.Pool,
  readOnly: boolean,
  operation: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query(readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
    // Optional telemetry must not indefinitely block content or settings operations.
    await client.query("SET LOCAL lock_timeout='1500ms'; SET LOCAL statement_timeout='2500ms'");
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard);
  }
}

export function getArticleViews(id: string, pool: pg.Pool = getPool()): Promise<number> {
  return inViewTransaction(pool, true, async (client) => {
    const { rows } = await client.query<CountRow>(
      `SELECT s.value #> ARRAY[$1::text, $2::text] AS views,
      (s.value IS NULL OR NOT s.value ? $1 OR jsonb_typeof(s.value->$1)='object') AS valid
      FROM entries e LEFT JOIN settings s ON s.id=1
      WHERE e.id=$2 AND e.kind='article' AND e.deleted_at IS NULL AND e.published IS NOT NULL`,
      [ARTICLE_VIEWS_KEY, id],
    );
    if (!rows[0]) throw new HttpError(404, 'Article not found.');
    if (!rows[0].valid) throw new Error('Invalid article view metadata.');
    return parseViewCount(rows[0].views);
  });
}

export function incrementArticleViews(id: string, pool: pg.Pool = getPool()): Promise<number> {
  return inViewTransaction(pool, false, async (client) => {
    const visible = await client.query(
      `SELECT id FROM entries
      WHERE id=$1 AND kind='article' AND deleted_at IS NULL AND published IS NOT NULL FOR SHARE`,
      [id],
    );
    if (!visible.rowCount) throw new HttpError(404, 'Article not found.');
    const { rows } = await client.query<CountRow>(
      `SELECT value #> ARRAY[$1::text,$2::text] AS views,
      (NOT value ? $1 OR jsonb_typeof(value->$1)='object') AS valid
      FROM settings WHERE id=1 FOR UPDATE`,
      [ARTICLE_VIEWS_KEY, id],
    );
    if (!rows[0] || !rows[0].valid) throw new Error('Article view storage is unavailable.');
    const count = Math.min(Number.MAX_SAFE_INTEGER, parseViewCount(rows[0].views) + 1);
    await client.query(
      `UPDATE settings SET value=jsonb_set(value, ARRAY[$1::text],
      COALESCE(value->$1, '{}'::jsonb) || jsonb_build_object($2::text,$3::bigint), true)
      WHERE id=1`,
      [ARTICLE_VIEWS_KEY, id, count],
    );
    return count;
  });
}

// A receipt records only an expiry, signed for this article. No visitor ID, IP, or fingerprint.
export const viewCookieName = (id: string) =>
  `kaiyo-view-${createHash('sha256').update(id).digest('hex').slice(0, 16)}`;
const signature = (id: string, expiry: number, key: string) =>
  createHmac('sha256', key).update(`article-view:v1:${id}:${expiry}`).digest('base64url');
export function createViewReceipt(id: string, key: string, now = Date.now()): string {
  if (key.length < 32) throw new Error('View receipt key is unavailable.');
  const expiry = Math.floor(now / 1000) + VIEW_COOLDOWN_SECONDS;
  return `${expiry}.${signature(id, expiry, key)}`;
}
export function validViewReceipt(
  value: string | undefined,
  id: string,
  key: string,
  now = Date.now(),
): boolean {
  if (!value || key.length < 32 || !/^\d{10}\.[A-Za-z0-9_-]{43}$/.test(value)) return false;
  const [expires, mac] = value.split('.');
  const expiry = Number(expires),
    seconds = Math.floor(now / 1000);
  if (expiry <= seconds || expiry > seconds + VIEW_COOLDOWN_SECONDS + 5) return false;
  const expected = signature(id, expiry, key);
  return timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
}
