import type { Entry, Taxonomy } from '../../lib/types';
export type { Entry, EntryContent, Media, SiteSettings, Taxonomy } from '../../lib/types';
export interface Taxonomies { categories: Taxonomy[]; tags: Taxonomy[]; }
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && url.startsWith('/api/admin/')) throw new ApiError('Your session expired. Sign in in another tab, then retry without closing this editor.', response.status);
    if (url.startsWith('/api/auth/')) {
      const messages: Record<string, string> = {
        INVALID_EMAIL_OR_PASSWORD: 'The email or password is incorrect.', INVALID_PASSWORD: 'The current password is incorrect.',
        PASSWORD_TOO_SHORT: 'Use at least 12 characters for your password.', PASSWORD_TOO_LONG: 'Passwords cannot exceed 128 characters.', INVALID_EMAIL: 'Enter a valid email address.',
      };
      const message = response.status === 429 ? 'Too many attempts. Wait a minute and try again.' : messages[data?.code] || 'Authentication failed. Check your details and try again.';
      throw new ApiError(message, response.status);
    }
    throw new ApiError(data?.error || data?.message || 'The request failed. Please try again.', response.status);
  }
  return data as T;
}
export const json = (method: string, data: unknown): RequestInit => ({ method, body: JSON.stringify(data) });
export const errorMessage = (error: unknown) => error instanceof TypeError ? 'Unable to reach the server. Check your connection and retry.' : error instanceof Error ? error.message : 'The request failed. Please try again.';
export const dateLabel = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
export const editorUrl = (entry: Pick<Entry, 'id' | 'kind'>) => `/admin/${entry.kind === 'article' ? 'articles' : 'projects'}/${entry.id}`;
