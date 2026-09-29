import path from 'node:path';
import os from 'node:os';
import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import sharp, { type OverlayOptions } from 'sharp';
import { escapeXml } from './xml';

export interface ShareImageText {
  siteName: string;
  title: string;
  category: string;
  footer: string;
}

const width = 1200;
const height = 630;
const cache = new Map<string, Buffer>();
const pending = new Map<string, Promise<Buffer>>();
let cachedBytes = 0;
let fontPath: Promise<string> | undefined;
export class ShareImageBusyError extends Error {}

export function shareText(value: string, limit: number): string {
  const text = Array.from(
    value
      .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  return text.length > limit ? `${text.slice(0, limit - 1).join('')}…` : text.join('');
}

export function normalizeShareText(value: ShareImageText): ShareImageText {
  const siteName = shareText(value.siteName, 60) || 'KaiyoLab';
  return {
    siteName,
    title: shareText(value.title, 180) || siteName,
    category: shareText(value.category, 60),
    footer: shareText(value.footer, 100),
  };
}

export function shareImageKey(value: ShareImageText): string {
  return createHash('sha256')
    .update(`share-image-v1:${JSON.stringify(normalizeShareText(value))}`)
    .digest('hex');
}

async function bundledFont() {
  if (!fontPath) {
    fontPath = (async () => {
      const name = 'NotoSansCJKtc-Regular.otf';
      const directories =
        process.env.NODE_ENV === 'production'
          ? ['dist/client/fonts', 'public/fonts']
          : ['public/fonts', 'dist/client/fonts'];
      for (const directory of directories) {
        const filename = path.resolve(directory, name);
        try {
          await access(filename);
        } catch {
          continue;
        }
        // Windows 的 fontconfig 無法讀取部分非 ASCII 路徑，只快取這個隨附字型
        if (process.platform !== 'win32' || /^[\x00-\x7f]+$/.test(filename)) return filename;
        const fontCacheDirectory = path.join(os.tmpdir(), 'kaiyolab-share-fonts');
        if (!/^[\x00-\x7f]+$/.test(fontCacheDirectory))
          throw new Error('分享圖片的 Windows 暫存目錄需使用 ASCII 路徑');
        const bytes = await readFile(filename);
        const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
        const digest = hash(bytes);
        const cached = path.join(fontCacheDirectory, `${digest}.otf`);
        await mkdir(fontCacheDirectory, { recursive: true, mode: 0o700 });
        try {
          if (hash(await readFile(cached)) === digest) return cached;
        } catch {}
        const temporary = `${cached}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
          try {
            await rename(temporary, cached);
          } catch (error) {
            if (hash(await readFile(cached)) !== digest) throw error;
          }
        } finally {
          await unlink(temporary).catch(() => {});
        }
        return cached;
      }
      throw new Error('缺少隨專案提供的分享圖中文字型');
    })().catch((error) => {
      fontPath = undefined;
      throw error;
    });
  }
  return fontPath;
}

async function render(value: ShareImageText): Promise<Buffer> {
  const fontfile = await bundledFont();
  const textLayer = async (
    text: string,
    size: number,
    color: string,
    maxWidth: number,
    maxHeight: number,
  ) => {
    if (!text) return undefined;
    return sharp({
      text: {
        text: `<span foreground="${color}">${escapeXml(text)}</span>`,
        font: `Noto Sans CJK TC ${size}`,
        fontfile,
        width: maxWidth,
        wrap: 'word-char',
        spacing: 10,
        rgba: true,
      },
    })
      .resize({ width: maxWidth, height: maxHeight, fit: 'inside', withoutEnlargement: true })
      .png()
      .timeout({ seconds: 5 })
      .toBuffer();
  };
  // 所有作者文字均經 XML 跳脫，SVG 只包含固定幾何元素
  const background = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#f8f4e6"/><rect width="14" height="630" fill="#9d2357"/><path d="M72 132H1128M72 520H1128" stroke="#d8cfb5" stroke-width="2"/></svg>`,
  );
  const layers: OverlayOptions[] = [];
  for (const [text, size, color, top, maxHeight] of [
    [value.siteName, 34, '#28282e', 56, 52],
    [value.category, 22, '#9d2357', 162, 36],
    [value.title, 56, '#28282e', 224, 266],
    [value.footer, 22, '#5e5b65', 552, 40],
  ] as const) {
    const input = await textLayer(text, size, color, 1056, maxHeight);
    if (input) layers.push({ input, left: 72, top });
  }
  return sharp(background, { limitInputPixels: width * height })
    .composite(layers)
    .png()
    .timeout({ seconds: 5 })
    .toBuffer();
}

/** 固定尺寸、最多兩筆產圖工作、32 張／16 MiB 快取，網址參數不參與產圖 */
export async function shareImage(input: ShareImageText): Promise<Buffer> {
  const value = normalizeShareText(input);
  const key = shareImageKey(value);
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const existing = pending.get(key);
  if (existing) return existing;
  if (pending.size >= 2) throw new ShareImageBusyError('分享圖片正在產生中');
  const job = render(value)
    .then((buffer) => {
      while (cache.size >= 32 || cachedBytes + buffer.byteLength > 16 * 1024 * 1024) {
        const oldest = cache.keys().next().value;
        if (!oldest) break;
        cachedBytes -= cache.get(oldest)!.byteLength;
        cache.delete(oldest);
      }
      if (buffer.byteLength <= 16 * 1024 * 1024) {
        cache.set(key, buffer);
        cachedBytes += buffer.byteLength;
      }
      return buffer;
    })
    .finally(() => {
      pending.delete(key);
    });
  pending.set(key, job);
  return job;
}

export async function shareImageResponse(
  request: Request,
  value: ShareImageText,
): Promise<Response> {
  const etag = `"${shareImageKey(value)}"`;
  const headers = {
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    ETag: etag,
  };
  if (
    request.headers
      .get('if-none-match')
      ?.split(',')
      .map((part) => part.trim())
      .includes(etag)
  )
    return new Response(null, { status: 304, headers });
  try {
    return new Response(new Uint8Array(await shareImage(value)), { headers });
  } catch (error) {
    if (!(error instanceof ShareImageBusyError)) console.error('分享圖片產生失敗');
    return new Response(null, {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '5' },
    });
  }
}
