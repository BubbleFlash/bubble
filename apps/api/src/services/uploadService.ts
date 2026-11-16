import crypto from "node:crypto";
import path from "node:path";
import { fontUploadUrlSchema, uploadUrlSchema, type UploadTicket } from "@commune/shared";
import { logger } from "../config/logger.js";
import { Post } from "../models/Post.js";
import { User } from "../models/User.js";
import { Wallpaper } from "../models/Wallpaper.js";
import { Community } from "../models/Community.js";
import { badRequest } from "../utils/errors.js";
import { detectFontType } from "../utils/fonts.js";
import type { ImageExt } from "../utils/images.js";
import { deleteObject, uploadObject } from "./storageService.js";

const STORAGE_PREFIX = "uploads";

const contentTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export async function saveImage(
  buffer: Buffer,
  ext: ImageExt,
): Promise<string> {
  const name = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
  const key = `${STORAGE_PREFIX}/${name}`;

  await uploadObject(
    key,
    buffer,
    contentTypes[ext] ?? "application/octet-stream",
  );

  return `/uploads/${name}`;
}

export async function saveFont(owner: string, buffer: Buffer): Promise<string> {
  const format = detectFontType(buffer);
  if (!format) throw badRequest("Invalid font file");
  const name = `${owner}-${crypto.randomBytes(16).toString("hex")}.${format.extension}`;
  await uploadObject(`${STORAGE_PREFIX}/${name}`, buffer, format.mime);
  return `/uploads/${name}`;
}

export async function deleteFontIfUnused(url: string | null | undefined): Promise<void> {
  if (!url || !fontUploadUrlSchema.safeParse(url).success) return;
  try {
    if (!(await User.exists({ "appearance.font": url }))) {
      await deleteObject(`${STORAGE_PREFIX}/${path.basename(url)}`);
    }
  } catch (err) {
    logger.warn({ err, url }, "Failed to delete font");
  }
}

/**
 * Direct uploads are disabled.
 * All files are uploaded through the API.
 */
export function createUploadTicket(): UploadTicket {
  return { mode: "server" };
}

export async function confirmDirectUpload(
  _id: string,
  _format: string,
): Promise<string> {
  throw badRequest("Direct uploads are not enabled");
}

/**
 * Delete an uploaded file only when no post, avatar, account background or workshop item references it.
 */
export async function deleteUploadIfUnused(
  url: string | null | undefined,
  throwOnError = false,
): Promise<void> {
  if (!url || !uploadUrlSchema.safeParse(url).success) return;

  try {
    const [usedByPost, usedByUser, usedByWorkshop, usedByCommunity] = await Promise.all([
      Post.exists({ $or: [{ imageUrl: url }, { imageUrls: url }] }),
      User.exists({ $or: [{ avatarUrl: url }, { "appearance.backgroundUrl": url }] }),
      Wallpaper.exists({ imageUrl: url }),
      Community.exists({ avatarUrl: url }),
    ]);

    if (usedByPost || usedByUser || usedByWorkshop || usedByCommunity) return;

    await deleteObject(`${STORAGE_PREFIX}/${path.basename(url)}`);
  } catch (err) {
    logger.warn({ err, url }, "Failed to delete upload");
    if (throwOnError) throw err;
  }
}

/** Unlisted files stay readable for uploads in progress. A moderated-only attachment is withheld. */
export async function uploadIsModerated(url: string): Promise<boolean> {
  const reference = { $or: [{ imageUrl: url }, { imageUrls: url }] };
  const [moderatedPost, moderatedWallpaper] = await Promise.all([
    Post.exists({ $or: [{ ...reference, moderationState: { $in: ["hidden", "removed"] } }, { deletionPendingImages: url }] }),
    Wallpaper.exists({ $or: [{ imageUrl: url, moderationState: { $in: ["hidden", "removed"] } }, { deletionPendingImages: url }] }),
  ]);
  if (!moderatedPost && !moderatedWallpaper) return false;
  const shared = await Promise.all([
    Post.exists({ ...reference, moderationState: { $nin: ["hidden", "removed"] }, priceCents: null, visibility: { $nin: ["private", "friends"] } }),
    User.exists(moderatedWallpaper ? { avatarUrl: url } : { $or: [{ avatarUrl: url }, { "appearance.backgroundUrl": url }] }),
    Wallpaper.exists({ imageUrl: url, moderationState: { $nin: ["hidden", "removed", "withdrawn"] } }),
    Community.exists({ avatarUrl: url }),
  ]);
  return !shared.some(Boolean);
}
