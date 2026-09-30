import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  imageLimits,
  processMediaVariant,
  processUploadImage,
  sanitizeArchiveImage,
} from '../src/lib/image-processing';
import {
  animatedGifFixture,
  oversizedGifFixture,
  readAnimationFrames,
} from './helpers/animated-image';

async function expectTwoFrames(input: Buffer, width: number, height: number) {
  const { metadata, frames } = await readAnimationFrames(input);
  expect(metadata).toMatchObject({
    format: 'webp',
    width,
    pages: 2,
    pageHeight: height,
    loop: 3,
    delay: [120, 240],
  });
  expect(frames).toHaveLength(2);
  expect(frames[0].center[0]).toBeGreaterThan(frames[0].center[2] + 150);
  expect(frames[1].center[2]).toBeGreaterThan(frames[1].center[0] + 150);
  for (const frame of frames) expect(frame.cornerAlpha).toBeLessThanOrEqual(1);
}

describe('GIF 與動態 WebP 的完整影格處理', () => {
  it('真實雙影格 GIF 轉為 WebP，保留不同畫面、透明區、播放次數與延遲', async () => {
    const gif = await animatedGifFixture();
    expect((await sharp(gif, { animated: true }).metadata()).pages).toBe(2);
    const result = await processUploadImage(gif, 'image/gif');
    expect(result).toMatchObject({ width: 32, height: 24, frames: 2, decodedPixels: 32 * 24 * 2 });
    await expectTwoFrames(result.data, 32, 24);
    const again = await processUploadImage(result.data, 'image/webp');
    await expectTwoFrames(again.data, 32, 24);
  });

  it('尺寸以單幀計算，長形動畫不因疊加高度被裁斷或誤縮小', async () => {
    const tall = await processUploadImage(
      await animatedGifFixture({ width: 64, height: 1300 }),
      'image/gif',
    );
    expect(tall).toMatchObject({ width: 64, height: 1300, frames: 2 });
    await expectTwoFrames(tall.data, 64, 1300);
    const resized = await processUploadImage(
      await animatedGifFixture({ width: 64, height: 2600 }),
      'image/gif',
    );
    expect(resized.height).toBe(imageLimits.dimension);
    expect(resized.width).toBeGreaterThan(0);
    expect(resized.width).toBeLessThan(64);
    await expectTwoFrames(resized.data, resized.width, imageLimits.dimension);
  });

  it('封面縮圖保留動畫與每幀比例，不放大原圖', async () => {
    const original = await processUploadImage(
      await animatedGifFixture({ width: 640, height: 96 }),
      'image/gif',
    );
    for (const width of [480, 960, 1600]) {
      const variant = await processMediaVariant(original.data, width);
      const actualWidth = Math.min(width, 640);
      await expectTwoFrames(variant, actualWidth, (actualWidth * 96) / 640);
    }
  });

  it('封存檔允許動態 WebP 並以每幀高度驗證，重編碼不抹掉動畫', async () => {
    const original = await processUploadImage(await animatedGifFixture(), 'image/gif');
    const restored = await sanitizeArchiveImage(original.data, 32, 24);
    await expectTwoFrames(restored.data, 32, 24);
    await expect(sanitizeArchiveImage(original.data, 32, 48)).rejects.toMatchObject({
      status: 400,
    });
    await expect(sanitizeArchiveImage(await animatedGifFixture(), 32, 24)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('拒絕偽裝 MIME、損壞 GIF 及非圖片內容，不能只靠檔頭通過', async () => {
    const gif = await animatedGifFixture();
    for (const [input, mime] of [
      [gif, 'image/png'],
      [gif, 'image/jpeg'],
      [gif, 'application/octet-stream'],
      [gif.subarray(0, 20), 'image/gif'],
      [gif.subarray(0, gif.length / 2), 'image/gif'],
      [Buffer.from('<svg onload="alert(1)"></svg>'), 'image/gif'],
    ] as const)
      await expect(processUploadImage(input, mime)).rejects.toMatchObject({ status: 400 });
  });

  it('接受幀數上限，拒絕超過上限與高解碼像素量的 GIF', async () => {
    const maximum = await animatedGifFixture({ width: 4, height: 4, frames: imageLimits.frames });
    const accepted = await processUploadImage(maximum, 'image/gif');
    expect(accepted.frames).toBe(imageLimits.frames);
    expect((await sharp(accepted.data, { animated: true }).metadata()).pages).toBe(
      imageLimits.frames,
    );
    const tooMany = await animatedGifFixture({
      width: 4,
      height: 4,
      frames: imageLimits.frames + 1,
    });
    await expect(processUploadImage(tooMany, 'image/gif')).rejects.toMatchObject({
      status: 400,
      message: 'Images cannot exceed 200 frames or 40 million decoded pixels.',
    });
    const oversizedCanvas = await oversizedGifFixture();
    const dimensions = await sharp(oversizedCanvas, {
      animated: true,
      limitInputPixels: false,
    }).metadata();
    expect(dimensions.width! * dimensions.height!).toBeGreaterThan(imageLimits.decodedPixels);
    await expect(processUploadImage(oversizedCanvas, 'image/gif')).rejects.toMatchObject({
      status: 400,
      message: 'Images cannot exceed 200 frames or 40 million decoded pixels.',
    });
    await expect(
      processUploadImage(Buffer.alloc(imageLimits.bytes + 1), 'image/gif'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('靜態 PNG 維持單張轉換與透明度，不能被當成多影格動畫', async () => {
    const png = await sharp({
      create: { width: 8, height: 6, channels: 4, background: '#00000000' },
    })
      .png()
      .toBuffer();
    const result = await processUploadImage(png, 'image/png');
    expect(result).toMatchObject({ width: 8, height: 6, frames: 1 });
    const decoded = await readAnimationFrames(result.data);
    expect(decoded.frames).toHaveLength(1);
    expect(decoded.frames[0].cornerAlpha).toBe(0);
  });
});
