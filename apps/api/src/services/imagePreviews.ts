import sharp from "sharp";
import { imagePreviewWidths, type ImagePreviewKind } from "@commune/shared";
import { logger } from "../config/logger.js";

export const imagePreviewKey = (canonicalFile: string, width: number) => `uploads/previews/${canonicalFile}-${width}.webp`;

let active = 0;

/** Optional work on upload. Keep decoder memory bounded and prefer the original under load. */
export async function prepareImagePreviews(buffer: Buffer, kind: ImagePreviewKind) {
  if (active >= 2) return undefined;
  active++;
  try {
    const image = sharp(buffer, { limitInputPixels: 12_000_000, autoOrient: true });
    const metadata = await image.metadata();
    const { width } = metadata.autoOrient;
    // libvips may expose only the first APNG frame.
    if ((metadata.pages ?? 1) > 1 || (metadata.format === "png" && buffer.includes("acTL"))) return undefined;
    let mask = 0;
    const variants: { target: number; bytes: Buffer }[] = [];
    const widths = imagePreviewWidths[kind];
    for (const [index, target] of widths.entries()) {
      if (width <= target) continue;
      try {
        const preview = await image.clone().resize({ width: target, withoutEnlargement: true })
          .webp({ quality: 82 }).toBuffer();
        if (preview.length >= buffer.length) continue;
        variants.push({ target, bytes: preview });
        mask |= 1 << index;
      } catch (error) {
        logger.warn({ err: error, width: target }, "Image preview could not be prepared");
      }
    }
    return mask ? { mask, width, variants } : undefined;
  } catch (error) {
    logger.warn({ err: error }, "Image previews skipped");
    return undefined;
  } finally {
    active--;
  }
}
