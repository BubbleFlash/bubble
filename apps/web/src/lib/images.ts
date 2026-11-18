import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_SOURCE_IMAGE_BYTES } from "@commune/shared";

const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));

/** Some Android browsers leave File.type empty, so fall back to the file extension. */
function typeOf(file: File): string {
  if (file.type) return file.type;
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  return ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext ? `image/${ext}` : "";
}

/** Quick check so people get instant feedback. The server validates again. */
export function validateImage(file: File): string | null {
  const type = typeOf(file);
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(type)) {
    return "Выберите изображение PNG, JPEG, GIF или WebP.";
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    return `Размер фотографии не должен превышать ${mb(MAX_SOURCE_IMAGE_BYTES)} МБ.`;
  }
  if (type === "image/gif" && file.size > MAX_IMAGE_BYTES) {
    return `Размер GIF не должен превышать ${mb(MAX_IMAGE_BYTES)} МБ. Попробуйте более короткий файл.`;
  }
  return null;
}

export interface PrepareOptions {
  /** Longest side in pixels after shrinking. */
  maxSide: number;
  /** Crop to a centred square (profile photos). */
  square?: boolean;
  /** Preferred transfer budget; resize further only when encoding cannot meet it. */
  targetBytes?: number;
}

export const POST_PHOTO: PrepareOptions = { maxSide: 1600, targetBytes: 450 * 1024 };
export const WALLPAPER_PHOTO: PrepareOptions = { maxSide: 2560, targetBytes: 700 * 1024 };
export const AVATAR_PHOTO: PrepareOptions = { maxSide: 512, square: true, targetBytes: 96 * 1024 };

const KEEP_BELOW_BYTES = 96 * 1024;
const TARGET_BYTES = 2.5 * 1024 * 1024;

async function decode(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* fall back to an <img> element below */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("Не удалось прочитать изображение. Попробуйте другую фотографию.");
  }
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Shrinks a photo before upload: phone photos are often 5 to 12 MB, which is slow on mobile data
 * and larger than the server accepts. Output is WebP (JPEG where the browser cannot write WebP),
 * at most `maxSide` pixels, and normally a few hundred KB. GIFs are sent as they are, so they
 * keep their animation.
 */
export async function prepareImage(file: File, options: PrepareOptions): Promise<File> {
  const problem = validateImage(file);
  if (problem) throw new Error(problem);
  if (typeOf(file) === "image/gif") return file;

  const decoded = await decode(file);
  try {
    const { width, height } = decoded;
    const side = options.square ? Math.min(width, height) : Math.max(width, height);
    const scale = Math.min(1, options.maxSide / side);
    const target = Math.min(options.targetBytes ?? TARGET_BYTES, TARGET_BYTES);

    // Already small and the right shape: nothing to gain, keep the original bytes.
    if (scale === 1 && !options.square && file.size <= Math.min(KEEP_BELOW_BYTES, target)) return file;

    // Crop region in the source image.
    const sw = options.square ? Math.min(width, height) : width;
    const sh = options.square ? Math.min(width, height) : height;
    const sx = options.square ? (width - sw) / 2 : 0;
    const sy = options.square ? (height - sh) / 2 : 0;

    let outW = Math.max(1, Math.round(sw * scale));
    let outH = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement("canvas");

    for (let attempt = 0; attempt < 4; attempt++) {
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("This browser can't prepare images. Try a smaller photo.");
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, outW, outH);
      ctx.drawImage(decoded.source, sx, sy, sw, sh, 0, 0, outW, outH);

      const quality = attempt === 0 ? 0.82 : 0.72;
      let blob = await toBlob(canvas, "image/webp", quality);
      let ext = "webp";
      if (!blob || blob.type !== "image/webp") {
        // No WebP encoder (older Safari): use JPEG on a white background.
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, outW, outH);
        blob = await toBlob(canvas, "image/jpeg", quality);
        ext = "jpg";
      }
      if (blob && (blob.size <= target || (attempt === 3 && blob.size <= TARGET_BYTES))) {
        // Re-encoding a small efficient original can increase its transfer size.
        if (scale === 1 && !options.square && file.size <= target && file.size <= blob.size) return file;
        return new File([blob], `photo.${ext}`, { type: blob.type });
      }
      // Try a modest quality change at full resolution before shrinking again.
      if (attempt > 0) {
        outW = Math.max(1, Math.round(outW * 0.8));
        outH = Math.max(1, Math.round(outH * 0.8));
      }
    }
    throw new Error("That photo is too large to upload. Try a smaller one.");
  } finally {
    decoded.close();
  }
}
