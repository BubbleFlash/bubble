import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { MusicUpload } from "../models/MusicUpload.js";
import { logger } from "../config/logger.js";
import { InvalidMusicFile, prepareMusicMp3 } from "./musicEncoding.js";
import { publishMusicTrack } from "./musicUploadService.js";
import { deleteObject, getObject, getObjectMetadata, uploadObject } from "./storageService.js";

async function convert(upload: InstanceType<typeof MusicUpload>) {
  const dir = await mkdtemp(join(tmpdir(), "bubble-music-"));
  try {
    const input = join(dir, "source");
    if (!upload.sourceETag) throw new InvalidMusicFile("Missing source version");
    const source = await getObject(upload.storageKey, undefined, upload.sourceETag);
    if (!(source.Body instanceof Readable)) throw new Error("Missing audio body");
    if (source.ContentLength !== upload.size) {
      source.Body.destroy();
      throw new Error("Source changed");
    }
    await pipeline(source.Body, createWriteStream(input), { signal: AbortSignal.timeout(180_000) });
    if ((await stat(input)).size !== upload.size) throw new Error("Incomplete download");
    const mp3 = await prepareMusicMp3(input, join(dir, "track.mp3"));
    const key = upload.storageKey + ".mp3";
    const stream = createReadStream(mp3.path);
    try {
      await uploadObject(key, stream, "audio/mpeg", mp3.size);
    } finally {
      stream.destroy();
    }
    const stored = await getObjectMetadata(key);
    if (stored.ContentLength !== mp3.size || stored.ContentType !== "audio/mpeg") throw new Error("Incomplete MP3 upload");
    await publishMusicTrack(upload, key, "audio/mpeg", mp3.size, mp3.duration);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** A lease survives restarts. Completed tickets only need the temporary S3 source removed. */
export async function processNextMusicUpload() {
  const lease = new Date(Date.now() + 40 * 60_000);
  const upload = await MusicUpload.findOneAndUpdate({ nextAttemptAt: { $lte: new Date() } },
    { $set: { nextAttemptAt: lease }, $inc: { attempts: 1 } }, { sort: { nextAttemptAt: 1 }, new: true });
  if (!upload) return false;
  const claim = { _id: upload.id, nextAttemptAt: lease };
  try {
    if (upload.completedTrackId) {
      await deleteObject(upload.storageKey);
      // The signed PUT may still be replayed until the original ticket expires.
      await MusicUpload.updateOne(claim, upload.expiresAt.getTime() > Date.now()
        ? { $set: { nextAttemptAt: upload.expiresAt } }
        : { $unset: { nextAttemptAt: 1 } });
    } else {
      await convert(upload);
    }
  } catch (error) {
    const attempts = upload.attempts ?? 1;
    const failed = error instanceof InvalidMusicFile || (error instanceof Error && error.name === "PreconditionFailed");
    logger.warn({ uploadId: upload.id, attempts, failed, reason: error instanceof Error ? error.name : "unknown" }, "Music upload processing failed");
    await MusicUpload.updateOne(claim, failed
      ? { $set: { failed: true }, $unset: { nextAttemptAt: 1 } }
      : { $set: { nextAttemptAt: new Date(Date.now() + Math.min(attempts, 60) * 10_000) } });
  }
  return true;
}

export function startMusicUploadWorker() {
  let stopped = false;
  let timer: NodeJS.Timeout;
  async function poll() {
    let processed = false;
    try {
      processed = await processNextMusicUpload();
    } catch (err) {
      logger.error({ err }, "Could not claim music upload");
    }
    if (!stopped) timer = setTimeout(poll, processed ? 0 : 3000).unref();
  }
  timer = setTimeout(poll, 0).unref();
  return () => { stopped = true; clearTimeout(timer); };
}
