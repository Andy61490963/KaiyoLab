import sharp from 'sharp';

export async function animatedGifFixture({
  width = 32,
  height = 24,
  frames = 2,
  loop = 3,
}: { width?: number; height?: number; frames?: number; loop?: number } = {}) {
  const pixels = Buffer.alloc(width * height * frames * 4);
  for (let frame = 0; frame < frames; frame++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = ((frame * height + y) * width + x) * 4;
        pixels[offset] = frame % 2 === 0 ? 240 : 24;
        pixels[offset + 1] = 40;
        pixels[offset + 2] = frame % 2 === 0 ? 24 : 240;
        pixels[offset + 3] = x < width / 4 && y < height / 4 ? 0 : 255;
      }
    }
  }
  // 將真正不同的 RGBA 影格交給 sharp 編碼，不用副檔名或魔術位元組冒充動畫
  return sharp(pixels, {
    raw: { width, height: height * frames, channels: 4, pageHeight: height },
  })
    .gif({ loop, delay: Array.from({ length: frames }, (_, frame) => (frame % 2 ? 240 : 120)) })
    .toBuffer();
}

export async function readAnimationFrames(input: Buffer) {
  const metadata = await sharp(input, { animated: true }).metadata();
  const { data, info } = await sharp(input, { animated: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const height = metadata.pageHeight || metadata.height!;
  return {
    metadata,
    frames: Array.from({ length: metadata.pages || 1 }, (_, frame) => {
      const first = frame * height * info.width * info.channels;
      const center =
        first + (Math.floor(height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
      return {
        cornerAlpha: data[first + 3],
        center: [...data.subarray(center, center + 4)],
      };
    }),
  };
}

export async function oversizedGifFixture() {
  const input = Buffer.from(await animatedGifFixture());
  const descriptor = input.indexOf(Buffer.from([0x2c, 0, 0, 0, 0, 32, 0, 24, 0]));
  if (descriptor < 0) throw new Error('找不到測試 GIF 的第一幀尺寸');
  // 只用於拒絕案例，同步擴大邏輯畫布與第一幀描述，確保解碼器讀到過大的尺寸
  input.writeUInt16LE(65535, 6);
  input.writeUInt16LE(1000, 8);
  input.writeUInt16LE(65535, descriptor + 5);
  input.writeUInt16LE(1000, descriptor + 7);
  return input;
}
