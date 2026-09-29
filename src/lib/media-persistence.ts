function rejectedStatement(error: unknown): boolean {
  // 只清理由資料、約束或 SQL 驗證明確拒絕的寫入，不推測連線中斷時的提交結果
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (typeof code === 'string' && /^(22|23|42)[A-Z0-9]{3}$/.test(code)) return true;
    current = cause;
  }
  return false;
}

export async function persistMediaFile<T>({
  insert,
  find,
  remove,
}: {
  insert: () => Promise<T>;
  find: () => Promise<T | undefined>;
  remove: () => Promise<void>;
}): Promise<T> {
  try {
    return await insert();
  } catch (error) {
    let committed: T | undefined;
    try {
      committed = await find();
    } catch {
      // 無法確認時保留圖片，避免資料庫已有記錄卻失去檔案
      throw error;
    }
    if (committed !== undefined) return committed;
    // 查無記錄仍可能是原連線尚未提交，只有確定拒絕的寫入才可清除
    if (rejectedStatement(error)) {
      try {
        await remove();
      } catch {
        // 清理失敗時保留原始資料庫錯誤，檔案可由後續維運檢查處理
      }
    }
    throw error;
  }
}
