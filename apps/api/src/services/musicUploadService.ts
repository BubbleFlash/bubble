import { randomUUID } from "node:crypto";
import type { MusicUploadSignInput } from "@commune/shared";
import { MAX_MUSIC_BYTES } from "@commune/shared";
import { MusicTrack } from "../models/MusicTrack.js";
import { MusicUpload } from "../models/MusicUpload.js";
import { UserMusic } from "../models/UserMusic.js";
import { badRequest, conflict, notFound } from "../utils/errors.js";
import {
  createUploadUrl,
  getObjectMetadata,
} from "./storageService.js";

const UPLOAD_RECORD_TTL_MINUTES = 15;

export async function createMusicUpload(
  userId: string,
  input: MusicUploadSignInput,
) {
  if (input.size > MAX_MUSIC_BYTES) {
    throw badRequest("Music file is too large");
  }

  const storageKey = `music/${userId}/${randomUUID()}`;

  const upload = await MusicUpload.create({
    normalizeToMp3: true,
    userId,
    storageKey,
    title: input.title,
    artist: input.artist,
    mimeType: input.mimeType,
    size: input.size,
    expiresAt: new Date(
      Date.now() + UPLOAD_RECORD_TTL_MINUTES * 60 * 1000,
    ),
  });

  try {
    const url  = await createUploadUrl(
      storageKey,
      input.mimeType
    );

    return {
      uploadId: upload.id,
      url: url
    };
  } catch (error) {
    await MusicUpload.deleteOne({ _id: upload._id });
    throw error;
  }
}

export async function completeMusicUpload(
  userId: string,
  uploadId: string,
  duration?: number,
) {
  const upload = await MusicUpload.findOne({
    _id: uploadId,
    userId,
  });

  if (!upload) {
    throw notFound("Upload not found");
  }

  // Повторное подтверждение уже завершённой загрузки.
  if (upload.completedTrackId) {
    return {
      trackId: upload.completedTrackId.toString(),
    };
  }

  if (upload.failed) throw badRequest("Не удалось подготовить MP3. Проверьте аудиофайл и повторите загрузку.");
  if (upload.nextAttemptAt) return { processing: true as const };
  if (upload.expiresAt.getTime() <= Date.now()) {
    throw badRequest("Upload has expired");
  }

  let metadata;

  try {
    metadata = await getObjectMetadata(upload.storageKey);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "$metadata" in error &&
      (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode === 404
    ) {
      throw badRequest("Uploaded file not found");
    }

    throw error;
  }

  if (metadata.ContentLength !== upload.size) {
    throw badRequest("Uploaded file size does not match");
  }

  if (metadata.ContentType !== upload.mimeType) {
    throw badRequest("Uploaded file type does not match");
  }

  if (upload.normalizeToMp3) {
    if (!metadata.ETag) throw new Error("Missing uploaded object ETag");
    await MusicUpload.updateOne({ _id: upload.id, nextAttemptAt: null, completedTrackId: null, failed: { $ne: true } },
      { $set: { sourceETag: metadata.ETag, nextAttemptAt: new Date(), attempts: 0 } });
    return { processing: true as const };
  }
  // Tickets issued before the MP3 worker was deployed retain the original completion path.
  return publishMusicTrack(upload, upload.storageKey, upload.mimeType, upload.size, duration);
}

export async function musicUploadStatus(userId: string, uploadId: string) {
  const upload = await MusicUpload.findOne({ _id: uploadId, userId }).select("completedTrackId failed").lean();
  if (!upload) throw notFound("Upload not found");
  if (upload.completedTrackId) return { trackId: upload.completedTrackId.toString() };
  if (upload.failed) throw badRequest("Не удалось подготовить MP3. Проверьте аудиофайл и повторите загрузку.");
  return { processing: true as const };
}

export async function publishMusicTrack(upload: InstanceType<typeof MusicUpload>, storageKey: string,
  mimeType: string, size: number, duration?: number) {
  const userId = upload.userId.toString();
  let track;

  try {
    track = await MusicTrack.findOneAndUpdate(
      { storageKey },
      {
        $setOnInsert: {
          title: upload.title,
          artist: upload.artist,
          storageKey,
          mimeType,
          size,
          duration: duration ?? null,
          uploadedBy: userId,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      error.code !== 11000
    ) {
      throw error;
    }

    track = await MusicTrack.findOne({
      storageKey,
    });
  }

  if (!track) {
    throw notFound("Music track not found");
  }

  if (track.uploadedBy.toString() !== userId) {
    throw conflict("This upload belongs to another user");
  }

  // Добавляем трек в библиотеку загрузившего пользователя.
  try {
    await UserMusic.updateOne(
      {
        userId,
        trackId: track._id,
      },
      {
        $setOnInsert: {
          userId,
          trackId: track._id,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    // При параллельных запросах связь могла быть создана другим запросом.
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      error.code !== 11000
    ) {
      throw error;
    }
  }

  // Сохраняем результат, чтобы повторный запрос вернул тот же trackId.
  await MusicUpload.updateOne(
    {
      _id: upload._id,
      userId,
      completedTrackId: null,
    },
    {
      $set: {
        completedTrackId: track._id,
        ...(upload.normalizeToMp3 && { nextAttemptAt: new Date(), attempts: 0 }),
      },
    },
  );

  return {
    trackId: track.id,
  };
}
