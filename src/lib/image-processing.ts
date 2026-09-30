import sharp, { type Metadata, type ResizeOptions } from 'sharp';
import { HttpError } from './http';

export const imageLimits = {
  bytes: 10 * 1024 * 1024,
  decodedPixels: 40_000_000,
  frames: 200,
  dimension: 2400,
  processingSeconds: 15,
} as const;

const formats: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

export interface ProcessedImage {
  data: Buffer;
  width: number;
  height: number;
  frames: number;
  decodedPixels: number;
}

interface ImageInfo {
  metadata: Metadata;
  width: number;
  height: number;
  frames: number;
  decodedPixels: number;
}

const invalidImage = () =>
  new HttpError(400, 'The image is invalid or could not be processed within 15 seconds.');

async function inspectImage(input: Buffer): Promise<ImageInfo> {
  if (!input.length) throw invalidImage();
  if (input.length > imageLimits.bytes) throw new HttpError(400, 'Images cannot exceed 10 MB.');
  // 先只讀首幀的標頭取得總幀數，未驗證總像素前不解碼整段動畫
  const metadata = await sharp(input, {
    pages: 1,
    limitInputPixels: imageLimits.decodedPixels,
    failOn: 'warning',
  })
    .metadata()
    .catch((error: unknown) => {
      if (error instanceof Error && error.message.includes('pixel limit'))
        throw new HttpError(400, 'Images cannot exceed 200 frames or 40 million decoded pixels.');
      throw error;
    });
  const width = metadata.width || 0;
  const height = metadata.pageHeight || metadata.height || 0;
  const frames = metadata.pages ?? 1;
  const decodedPixels = width * height * frames;
  if (
    !Number.isSafeInteger(width) ||
    width <= 0 ||
    !Number.isSafeInteger(height) ||
    height <= 0 ||
    !Number.isSafeInteger(frames) ||
    frames <= 0
  )
    throw invalidImage();
  if (
    frames > imageLimits.frames ||
    !Number.isSafeInteger(decodedPixels) ||
    decodedPixels > imageLimits.decodedPixels
  ) {
    throw new HttpError(400, 'Images cannot exceed 200 frames or 40 million decoded pixels.');
  }
  return { metadata, width, height, frames, decodedPixels };
}

async function encodeImage(
  input: Buffer,
  source: ImageInfo,
  options: { resize?: ResizeOptions; orient?: boolean; quality?: number; lossless?: boolean },
): Promise<ProcessedImage> {
  let pipeline = sharp(input, {
    animated: true,
    limitInputPixels: imageLimits.decodedPixels,
    failOn: 'warning',
  });
  // 多幀不做可能改變影格順序的整圖旋轉；單幀照片延續原本 EXIF 轉正行為
  if (options.orient && source.frames === 1) pipeline = pipeline.rotate();
  if (options.resize) pipeline = pipeline.resize(options.resize);
  // 保留來源 loop 與 delay，完整解碼重編碼亦會移除額外附加內容與非必要中繼資料
  const data = await pipeline
    .webp({ quality: options.quality, lossless: options.lossless })
    .timeout({ seconds: imageLimits.processingSeconds })
    .toBuffer();
  if (data.length > imageLimits.bytes) {
    throw new HttpError(
      400,
      'The processed image exceeds 10 MB. Use a smaller image or fewer frames.',
    );
  }
  const output = await inspectImage(data);
  // 動畫 height 是所有幀堆疊的高度，媒體資料和 HTML 版面只儲存每幀尺寸
  return {
    data,
    width: output.width,
    height: output.height,
    frames: output.frames,
    decodedPixels: output.decodedPixels,
  };
}

async function withImageErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw invalidImage();
  }
}

export async function processUploadImage(input: Buffer, mime: string): Promise<ProcessedImage> {
  return withImageErrors(async () => {
    if (!Object.values(formats).includes(mime))
      throw new HttpError(400, 'Only PNG, JPEG, WebP, and GIF images are supported.');
    const source = await inspectImage(input);
    if (formats[source.metadata.format || ''] !== mime)
      throw new HttpError(400, 'The image format does not match its MIME type.');
    return encodeImage(input, source, {
      orient: true,
      resize: {
        width: imageLimits.dimension,
        height: imageLimits.dimension,
        fit: 'inside',
        withoutEnlargement: true,
      },
      quality: 85,
    });
  });
}

export async function processMediaVariant(input: Buffer, width: number): Promise<Buffer> {
  return withImageErrors(async () => {
    const source = await inspectImage(input);
    if (source.metadata.format !== 'webp') throw invalidImage();
    return (
      await encodeImage(input, source, {
        resize: { width, withoutEnlargement: true },
        quality: 82,
      })
    ).data;
  });
}

export async function sanitizeArchiveImage(
  input: Buffer,
  width: number,
  height: number,
): Promise<ProcessedImage> {
  return withImageErrors(async () => {
    const source = await inspectImage(input);
    if (
      source.metadata.format !== 'webp' ||
      source.width !== width ||
      source.height !== height ||
      width > imageLimits.dimension ||
      height > imageLimits.dimension
    ) {
      throw new HttpError(400, 'An image is invalid or does not match its declared dimensions.');
    }
    return encodeImage(input, source, { lossless: true });
  });
}
