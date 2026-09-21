import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('SELECT pg_advisory_lock(620214)');
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz DEFAULT now())',
  );
  const folder = new URL('../db/migrations/', import.meta.url);
  for (const name of (await readdir(folder)).filter((n) => n.endsWith('.sql')).sort()) {
    const query = await readFile(new URL(name, folder), 'utf8');
    const checksum = createHash('sha256').update(query).digest('hex');
    const result = await client.query('SELECT checksum FROM schema_migrations WHERE name=$1', [
      name,
    ]);
    if (result.rowCount) {
      if (result.rows[0].checksum !== checksum)
        throw new Error(`已套用的 migration 不可修改：${name}`);
      continue;
    }
    await client.query('BEGIN');
    try {
      await client.query(query);
      await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [
        name,
        checksum,
      ]);
      await client.query('COMMIT');
      console.log(`資料庫更新完成：${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.query('SELECT pg_advisory_unlock(620214)');
  client.release();
  await pool.end();
}
