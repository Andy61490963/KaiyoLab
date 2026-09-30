// 僅移除已停用的內建 K 圖示，不修改站長自訂的圖片網址或其他內容
export function normalizeLegacyBranding<
  T extends { logo: string; avatar: string; heroImage: string },
>(value: T): T {
  const result = { ...value };
  for (const field of ['logo', 'avatar', 'heroImage'] as const) {
    if (result[field] === '/favicon.svg') result[field] = '';
  }
  return result;
}
