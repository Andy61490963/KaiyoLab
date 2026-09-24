import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getPool } from '../../../lib/db';
import { json } from '../../../lib/http';
import { readOperation, type SystemReport } from '../../../lib/operations';

export const GET: APIRoute = async () => {
  const report: SystemReport = {
    checkedAt: new Date().toISOString(),
    revision: import.meta.env.KAIYO_BUILD_SHA || 'development',
    runtime: process.version,
    database: { available: false, latencyMs: 0 },
    storage: { writable: false, images: null, bytes: null },
    backup: { status: 'unconfigured', completedAt: null },
    restore: { status: 'unconfigured', completedAt: null },
  };
  const started = performance.now();
  try {
    // pg 支援單次查詢逾時，@types/pg 尚未在 QueryConfig 列出此欄位
    const query = {
      text: 'SELECT count(*)::int AS images, COALESCE(sum(size), 0)::text AS bytes FROM media',
      query_timeout: 5000,
    };
    const result = await getPool().query(query);
    report.database.available = true;
    report.storage.images = result.rows[0].images;
    report.storage.bytes = Number(result.rows[0].bytes);
  } catch {
    /* 回傳局部狀態，資料庫故障不應隱藏其他診斷 */
  }
  report.database.latencyMs = Math.round(performance.now() - started);
  const probe = path.join(process.env.UPLOAD_DIR || './data/uploads', `.health-${randomUUID()}`);
  let created = false;
  try {
    await writeFile(probe, 'ok', { flag: 'wx', mode: 0o600 });
    created = true;
    await unlink(probe);
    created = false;
    report.storage.writable = true;
  } catch {
    /* 權限不足時只顯示失敗，避免洩漏路徑 */
  } finally {
    if (created) await unlink(probe).catch(() => {});
  }
  [report.backup, report.restore] = await Promise.all([
    readOperation(process.env.OPERATIONS_DIR, 'backup'),
    readOperation(process.env.OPERATIONS_DIR, 'restore'),
  ]);
  return json(report);
};
