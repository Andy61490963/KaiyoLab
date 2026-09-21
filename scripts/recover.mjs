import pg from 'pg';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
const secretDir = process.env.SECRETS_DIR || '/run/kaiyo-secrets';
const connectionString =
  process.env.DATABASE_URL ||
  `postgresql://kaiyo:${encodeURIComponent(readFileSync(`${secretDir}/pg-password`, 'utf8').trim())}@${process.env.DB_HOST || 'db'}:5432/kaiyolab`;
const pool = new pg.Pool({ connectionString });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const state = await client.query('SELECT owner_id FROM system_state WHERE id=1 FOR UPDATE');
  if (!state.rows[0]?.owner_id) throw new Error('網站尚未初始化。');
  const password = randomBytes(24).toString('base64url');
  const hash = await hashPassword(password);
  await client.query(
    "UPDATE account SET password=$1,updated_at=now() WHERE user_id=$2 AND provider_id='credential'",
    [hash, state.rows[0].owner_id],
  );
  await client.query('DELETE FROM session');
  await client.query('COMMIT');
  console.log(
    `站長密碼已重設，所有登入已登出。\n一次性使用的新密碼：${password}\n請登入後立即變更密碼。`,
  );
} catch (e) {
  await client.query('ROLLBACK');
  console.error(e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
