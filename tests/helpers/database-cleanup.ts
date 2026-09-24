import { setTimeout as delay } from 'node:timers/promises';
import type pg from 'pg';

// pg-pool.end() 可能在 client 的 socket 完全關閉前 resolve
// 等伺服器確認測試資料庫已無連線，再正常刪除，不能用 FORCE 終止仍在關閉的 client
export async function cleanupTestDatabase(
  admin: pg.Pool | undefined,
  name: string | undefined,
  applicationPool?: pg.Pool,
  timeoutMs = 10000,
) {
  try {
    if (name && !/^kaiyo_(test|history|listing|transfer)_[a-f0-9]{32}$/.test(name))
      throw new Error('拒絕清除隨機整合測試資料庫以外的名稱');
    if (applicationPool) await applicationPool.end();
    if (!admin || !name) return;
    const deadline = performance.now() + timeoutMs;
    while (true) {
      const result = await admin.query<{ total: number }>(
        'SELECT count(*)::int AS total FROM pg_stat_activity WHERE datname = $1',
        [name],
      );
      if (result.rows[0].total === 0) break;
      if (performance.now() >= deadline)
        throw new Error(
          `測試資料庫 ${name} 仍有 ${result.rows[0].total} 個連線，停止清理以保留洩漏證據`,
        );
      await delay(25);
    }
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  } finally {
    if (admin) await admin.end();
  }
}
