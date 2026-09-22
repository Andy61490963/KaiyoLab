import type { Entry, Taxonomy } from '../../lib/types';
export type { Entry, EntryContent, Media, SiteSettings, Taxonomy } from '../../lib/types';
export interface Taxonomies {
  categories: Taxonomy[];
  tags: Taxonomy[];
}
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && url.startsWith('/api/admin/')) {
      throw new ApiError('登入已過期，請另開分頁登入後再重試，編輯中的內容會保留', response.status);
    }
    if (url.startsWith('/api/auth/')) {
      const messages: Record<string, string> = {
        INVALID_EMAIL_OR_PASSWORD: '電子郵件或密碼不正確',
        INVALID_PASSWORD: '目前密碼不正確',
        PASSWORD_TOO_SHORT: '密碼至少需要 12 個字元',
        PASSWORD_TOO_LONG: '密碼不能超過 128 個字元',
        INVALID_EMAIL: '請輸入有效的電子郵件',
      };
      const message =
        response.status === 429
          ? '嘗試次數過多，請稍候一分鐘再試'
          : messages[data?.code] || '驗證失敗，請確認輸入資料並稍後再試';
      throw new ApiError(message, response.status);
    }
    throw new ApiError(data?.error || data?.message || '操作失敗，請稍後重試', response.status);
  }
  return data as T;
}
export const json = (method: string, data: unknown): RequestInit => ({
  method,
  body: JSON.stringify(data),
});
export const errorMessage = (error: unknown) =>
  error instanceof TypeError
    ? '無法連線至伺服器，請確認網路後重試'
    : error instanceof Error
      ? error.message
      : '操作失敗，請稍後重試';
export const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('zh-TW', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
export const editorUrl = (entry: Pick<Entry, 'id' | 'kind'>) =>
  `/admin/${entry.kind === 'article' ? 'articles' : 'projects'}/${entry.id}`;
