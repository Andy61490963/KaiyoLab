import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import {
  decodeArchive,
  readArchiveRequest,
  transferLimits,
  type ContentArchive,
} from '../src/lib/portability';
import { defaultSettings, emptyContent } from '../src/lib/defaults';

function archive(): ContentArchive {
  const { siteUrl: _, ...settings } = defaultSettings;
  return {
    format: 'kaiyolab-content',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { ...settings, homeIntro: '# 測試首頁' },
    entries: [],
    media: [],
    taxonomies: [],
    revisions: [],
  };
}
const pack = (value: unknown) => gzipSync(JSON.stringify(value));

describe('內容封存檔的輸入邊界', () => {
  it('可讀取合法gzip JSON與可選內容欄位', async () => {
    const value = archive();
    value.entries.push({
      id: randomUUID(),
      kind: 'article',
      content: {
        ...emptyContent,
        slug: '測試文章',
        series: '教學',
        seriesOrder: 2,
        coverPosition: { x: 20, y: 60 },
      },
      published: null,
      publishedAt: null,
      updatedAt: value.exportedAt,
      deletedAt: null,
    });
    const loaded = await decodeArchive(pack(value));
    expect(loaded.archive).toEqual(value);
    expect(loaded.digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('拒絕非gzip、損毀JSON、過大壓縮輸入及gzip bomb', async () => {
    await expect(decodeArchive(Buffer.from('{}'))).rejects.toThrow('valid gzip');
    await expect(decodeArchive(gzipSync('{'))).rejects.toThrow('valid gzip');
    await expect(decodeArchive(Buffer.alloc(transferLimits.compressedBytes + 1))).rejects.toThrow(
      '32 MB',
    );
    const bomb = gzipSync(Buffer.alloc(transferLimits.expandedBytes + 1, 'a'));
    await expect(decodeArchive(bomb)).rejects.toThrow('64 MB');
  });

  it('拒絕帳號、session、部署URL及未來未知格式欄位', async () => {
    for (const key of ['accounts', 'users', 'sessions', 'secrets']) {
      await expect(decodeArchive(pack({ ...archive(), [key]: ['不應匯入'] }))).rejects.toThrow();
    }
    const value = archive();
    await expect(
      decodeArchive(
        pack({ ...value, settings: { ...value.settings, siteUrl: 'https://attacker.example' } }),
      ),
    ).rejects.toThrow();
    await expect(decodeArchive(pack({ ...value, version: 999 }))).rejects.toThrow();
  });

  it('拒絕過多項目、重複ID及指向不存在文章的歷史', async () => {
    const value = archive();
    const entry = {
      id: randomUUID(),
      kind: 'article' as const,
      content: { ...emptyContent, slug: 'test' },
      published: null,
      publishedAt: null,
      updatedAt: value.exportedAt,
      deletedAt: null,
    };
    await expect(decodeArchive(pack({ ...value, entries: [entry, entry] }))).rejects.toThrow(
      'Duplicate entry',
    );
    await expect(
      decodeArchive(pack({ ...value, entries: Array(transferLimits.entries + 1).fill(entry) })),
    ).rejects.toThrow();
    await expect(
      decodeArchive(
        pack({
          ...value,
          entries: [entry],
          revisions: [
            {
              entryId: entry.id,
              content: entry.content,
              source: 'draft',
              version: 2147483648,
              createdAt: value.exportedAt,
            },
          ],
        }),
      ),
    ).rejects.toThrow();
    await expect(
      decodeArchive(
        pack({
          ...value,
          revisions: [
            {
              entryId: randomUUID(),
              content: entry.content,
              source: 'draft',
              version: 1,
              createdAt: value.exportedAt,
            },
          ],
        }),
      ),
    ).rejects.toThrow('missing content');
  });

  it('圖片ID無法注入路徑，封面不能指向任意伺服器路徑', async () => {
    const value = archive();
    await expect(
      decodeArchive(
        pack({
          ...value,
          media: [
            {
              id: '../../outside',
              name: 'x',
              alt: '',
              mime: 'image/webp',
              width: 1,
              height: 1,
              data: 'AAAA',
            },
          ],
        }),
      ),
    ).rejects.toThrow();
    for (const cover of [
      '/../secrets/auth-secret',
      '/images/../../private.png',
      '//outside.example/file',
      '/images/%2e%2e/private.png',
    ]) {
      await expect(
        decodeArchive(
          pack({
            ...value,
            entries: [
              {
                id: randomUUID(),
                kind: 'article',
                content: { ...emptyContent, slug: 'test', cover },
                published: null,
                publishedAt: null,
                updatedAt: value.exportedAt,
                deletedAt: null,
              },
            ],
          }),
        ),
      ).rejects.toThrow();
    }
  });

  it('拒絕偽裝WebP、尺寸不符、損毀影像與遺失媒體引用', async () => {
    const value = archive();
    const picture = await sharp({
      create: { width: 4, height: 3, channels: 3, background: '#cccccc' },
    })
      .webp()
      .toBuffer();
    const media = {
      id: randomUUID(),
      name: 'tiny.webp',
      alt: '圖片',
      mime: 'image/webp' as const,
      width: 4,
      height: 3,
      data: picture.toString('base64'),
    };
    expect((await decodeArchive(pack({ ...value, media: [media] }))).images.size).toBe(1);
    for (const changed of [
      { width: 200 },
      { data: Buffer.from('<svg></svg>').toString('base64') },
      { data: picture.subarray(0, 25).toString('base64') },
      { data: 'bad!' },
    ]) {
      await expect(
        decodeArchive(pack({ ...value, media: [{ ...media, ...changed }] })),
      ).rejects.toThrow();
    }
    await expect(
      decodeArchive(
        pack({ ...value, settings: { ...value.settings, avatar: `/media/${randomUUID()}.webp` } }),
      ),
    ).rejects.toThrow('not included');
  });

  it('HTTP上傳拒絕錯誤類型與超過限制的宣告大小', async () => {
    await expect(
      readArchiveRequest(
        new Request('https://example.test/api/admin/transfer', {
          method: 'POST',
          body: '{}',
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      readArchiveRequest(
        new Request('https://example.test/api/admin/transfer', {
          method: 'POST',
          body: 'x',
          headers: {
            'Content-Type': 'application/gzip',
            'Content-Length': String(transferLimits.compressedBytes + 1),
          },
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
    const buffer = pack(archive());
    expect(
      await readArchiveRequest(
        new Request('https://example.test/api/admin/transfer', {
          method: 'POST',
          body: new Uint8Array(buffer),
          headers: { 'Content-Type': 'application/gzip' },
        }),
      ),
    ).toEqual(buffer);
  });
});
