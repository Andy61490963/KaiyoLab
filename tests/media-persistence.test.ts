import { describe, expect, it, vi } from 'vitest';
import { persistMediaFile } from '../src/lib/media-persistence';

describe('媒體檔案與資料庫提交結果', () => {
  const row = { id: '新圖片' };

  it('正常提交不需要查詢或清理', async () => {
    const find = vi.fn();
    const remove = vi.fn();
    expect(await persistMediaFile({ insert: async () => row, find, remove })).toBe(row);
    expect(find).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('寫入已提交但回應中斷時，查回記錄並保留圖片', async () => {
    let committed: typeof row | undefined;
    const remove = vi.fn();
    const result = await persistMediaFile({
      insert: async () => {
        committed = row;
        throw new Error('提交後連線中斷');
      },
      find: async () => committed,
      remove,
    });
    expect(result).toEqual(row);
    expect(remove).not.toHaveBeenCalled();
  });

  it.each(['查詢失敗', '暫時查無記錄'])('提交不明且%s時保留圖片', async (state) => {
    const error = Object.assign(new Error('連線中斷'), { code: '08006' });
    const remove = vi.fn();
    await expect(
      persistMediaFile({
        insert: async () => {
          throw error;
        },
        find: async () => {
          if (state === '查詢失敗') throw new Error('仍無法連線');
          return undefined;
        },
        remove,
      }),
    ).rejects.toBe(error);
    expect(remove).not.toHaveBeenCalled();
  });

  it('明確拒絕且查無記錄才清理，支援 Drizzle 包裝的 SQLSTATE', async () => {
    const error = new Error('查詢失敗', {
      cause: Object.assign(new Error('違反約束'), { code: '23514' }),
    });
    const remove = vi.fn();
    await expect(
      persistMediaFile({
        insert: async () => {
          throw error;
        },
        find: async () => undefined,
        remove,
      }),
    ).rejects.toBe(error);
    expect(remove).toHaveBeenCalledOnce();
  });

  it('清理失敗仍回報原始資料庫錯誤', async () => {
    const error = Object.assign(new Error('必要欄位缺少'), { code: '23502' });
    await expect(
      persistMediaFile({
        insert: async () => {
          throw error;
        },
        find: async () => undefined,
        remove: async () => {
          throw new Error('磁碟忙碌');
        },
      }),
    ).rejects.toBe(error);
  });
});
