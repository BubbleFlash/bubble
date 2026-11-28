import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { MusicUpload } from "../models/MusicUpload.js";
import { logger } from "../config/logger.js";
import { checkMusicTools, InvalidMusicFile, MusicToolsUnavailable, prepareMusicMp3 } from "./musicEncoding.js";
import { musicUploadQueue, publishMusicTrack } from "./musicUploadService.js";
import { deleteObject, getObject, getObjectMetadata, uploadObject } from "./storageService.js";
import type { MusicUploadStage } from "@commune/shared";

async function convert(upload: InstanceType<typeof MusicUpload>, claim: { _id: string; nextAttemptAt: Date }) {
  await checkMusicTools();
  const dir = await mkdtemp(join(tmpdir(), "bubble-music-"));
  let currentUpdate: Promise<unknown> | undefined;
  let lastSeconds = 0;
  let lastPercent = 0;
  let stageDuration: number | undefined;
  let nextUpdate = 0;
  async function phase(stage: MusicUploadStage, duration?: number) {
    await currentUpdate;
    await MusicUpload.updateOne(claim, {
      $set: { stage, ...(duration !== undefined && { progressPercent: 0 }) },
      $unset: { processedSeconds: 1, retryReason: 1, ...(duration === undefined && { progressPercent: 1 }) },
    });
    stageDuration = duration;
    lastSeconds = 0;
    lastPercent = 0;
    nextUpdate = 0;
  }
  try {
    await phase("downloading");
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
    const mp3 = await prepareMusicMp3(input, join(dir, "track.mp3"), {
      stage: phase,
      processed(seconds) {
        if (currentUpdate || Date.now() < nextUpdate) return;
        const wholeSeconds = Math.floor(seconds);
        // Finishing a decoding pass still leaves publishing and storage verification.
        const percent = stageDuration === undefined ? undefined : Math.min(99, Math.floor(seconds / stageDuration * 100));
        if (wholeSeconds <= lastSeconds && (percent ?? 0) <= lastPercent) return;
        lastSeconds = wholeSeconds;
        lastPercent = percent ?? 0;
        nextUpdate = Date.now() + 1000;
        currentUpdate = MusicUpload.updateOne(claim, {
          $set: { processedSeconds: wholeSeconds, ...(percent !== undefined && { progressPercent: percent }) },
        }).exec()
          .catch(err => logger.debug({ err }, "Could not record music upload progress"))
          .finally(() => { currentUpdate = undefined; });
      },
    });
    await phase("saving");
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
    await currentUpdate;
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
      await convert(upload, claim);
    }
  } catch (error) {
    const attempts = upload.attempts ?? 1;
    const failed = error instanceof InvalidMusicFile || (error instanceof Error && error.name === "PreconditionFailed");
    const toolsUnavailable = error instanceof MusicToolsUnavailable;
    const underlying = toolsUnavailable ? error.cause : error;
    const code = underlying instanceof Error && "code" in underlying ? underlying.code : undefined;
    const reason = toolsUnavailable ? "tools_unavailable" : "processing_error";
    logger.warn({ uploadId: upload.id, attempts, failed, reason, code }, "Music upload processing failed");
    await MusicUpload.updateOne(claim, failed
      ? { $set: { failed: true }, $unset: { nextAttemptAt: 1, processedSeconds: 1, progressPercent: 1, retryReason: 1 } }
      : {
        $set: {
          nextAttemptAt: new Date(Date.now() + Math.min(attempts, toolsUnavailable ? 3 : 60) * 10_000),
          stage: "retrying",
          retryReason: reason,
        },
        $unset: { processedSeconds: 1, progressPercent: 1 },
      });
  }
  return true;
}

export function startMusicUploadWorker() {
  let stopped = false;
  let timer: NodeJS.Timeout;
  let running = false;
  let wakePending = false;
  async function poll() {
    running = true;
    wakePending = false;
    let processed = false;
    try {
      processed = await processNextMusicUpload();
    } catch (err) {
      logger.error({ err }, "Could not claim music upload");
    }
    running = false;
    if (!stopped) timer = setTimeout(poll, processed || wakePending ? 0 : 3000).unref();
  }
  const wake = () => {
    if (running) { wakePending = true; return; }
    clearTimeout(timer);
    timer = setTimeout(poll, 0).unref();
  };
  timer = setTimeout(poll, 0).unref();
  musicUploadQueue.on("queued", wake);
  return () => { stopped = true; clearTimeout(timer); musicUploadQueue.off("queued", wake); };
}
