import { describe, it, expect, vi } from 'vitest';
import type pg from 'pg';
import { cleanupTestDatabase } from './helpers/database-cleanup';

const name = `kaiyo_listing_${'a'.repeat(32)}`;

describe('整合測試資料庫的連線清理', () => {
  it('pool 結束後仍等待伺服器連線歸零才正常 DROP，不強制斷線', async () => {
    const order: string[] = [];
    const remaining = [2, 1, 0];
    const pool = {
      end: vi.fn(async () => {
        order.push('pool end');
      }),
    };
    const admin = {
      query: vi.fn(async (query: string, values?: string[]) => {
        if (query.startsWith('SELECT')) {
          expect(values).toEqual([name]);
          const total = remaining.shift()!;
          order.push(`connections ${total}`);
          return { rows: [{ total }] };
        }
        expect(query).toBe(`DROP DATABASE IF EXISTS "${name}"`);
        expect(query).not.toContain('FORCE');
        order.push('drop');
        return { rows: [] };
      }),
      end: vi.fn(async () => {
        order.push('admin end');
      }),
    };
    await cleanupTestDatabase(admin as unknown as pg.Pool, name, pool as unknown as pg.Pool);
    expect(order).toEqual([
      'pool end',
      'connections 2',
      'connections 1',
      'connections 0',
      'drop',
      'admin end',
    ]);
  });

  it('持續洩漏連線時明確失敗，保留資料庫而非 FORCE 或吞掉錯誤', async () => {
    const admin = {
      query: vi.fn(async () => ({ rows: [{ total: 1 }] })),
      end: vi.fn(async () => {}),
    };
    const pool = { end: vi.fn(async () => {}) };
    await expect(
      cleanupTestDatabase(admin as unknown as pg.Pool, name, pool as unknown as pg.Pool, 0),
    ).rejects.toThrow('仍有 1 個連線');
    expect(admin.query).toHaveBeenCalledTimes(1);
    expect(admin.end).toHaveBeenCalledTimes(1);
  });

  it('拒絕非測試資料庫名稱', async () => {
    const admin = { query: vi.fn(), end: vi.fn(async () => {}) };
    await expect(cleanupTestDatabase(admin as unknown as pg.Pool, 'kaiyolab')).rejects.toThrow(
      '拒絕清除',
    );
    expect(admin.query).not.toHaveBeenCalled();
    expect(admin.end).toHaveBeenCalledTimes(1);
  });
});
