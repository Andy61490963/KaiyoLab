import { z } from 'zod';
z.config(z.locales.zhTW());
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
export async function body(request: Request) {
  const limit = 2_000_000;
  if (Number(request.headers.get('content-length') || 0) > limit)
    throw new HttpError(413, '內容超過大小限制。');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, '請送出 JSON 資料。');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    length += result.value.length;
    if (length > limit) {
      await reader.cancel();
      throw new HttpError(413, '內容超過大小限制。');
    }
    chunks.push(result.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, '無法讀取送出的資料。');
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError)
    return json(
      { error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；') },
      400,
    );
  if ((error as { code?: string })?.code === '23505')
    return json({ error: '網址代稱或名稱已經存在。' }, 409);
  console.error('處理請求失敗', error instanceof Error ? error.message : error);
  return json({ error: '處理失敗，請稍後再試。' }, 500);
}
export const safeUrl = z
  .string()
  .max(2048)
  .refine(
    (v) =>
      !v ||
      (/^https?:\/\//.test(v) &&
        (() => {
          try {
            new URL(v);
            return true;
          } catch {
            return false;
          }
        })()),
    '請輸入 http 或 https 網址',
  );
export const assetUrl = z
  .string()
  .max(2048)
  .refine((v) => !v || /^\/(?!\/)[a-zA-Z0-9_./%-]+$/.test(v), '請使用媒體庫或內建圖片路徑');
export const contentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)*$/u, '網址代稱只能包含文字、數字、連字號'),
  excerpt: z.string().max(1000),
  body: z.string().max(500000),
  cover: assetUrl,
  coverAlt: z.string().max(300),
  category: z.string().max(80),
  tags: z
    .array(z.string().trim().min(1).max(80))
    .max(20)
    .transform((v) => [...new Set(v)]),
  featured: z.boolean(),
  seoTitle: z.string().max(200),
  seoDescription: z.string().max(500),
  demoUrl: safeUrl,
  repoUrl: safeUrl,
});
export const settingsSchema = z.object({
  siteName: z.string().trim().min(1).max(80),
  tagline: z.string().max(200),
  description: z.string().max(500),
  authorName: z.string().trim().min(1).max(100),
  bio: z.string().max(1000),
  about: z.string().max(100000),
  logo: assetUrl,
  avatar: assetUrl,
  heroImage: assetUrl,
  socialLinks: z
    .array(z.object({ label: z.string().min(1).max(50), url: safeUrl.refine(Boolean) }))
    .max(12),
  siteUrl: safeUrl.refine(Boolean),
});
