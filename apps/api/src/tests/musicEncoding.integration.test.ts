import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import { promisify } from "node:util";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MusicUpload } from "../models/MusicUpload.js";
import { env } from "../config/env.js";
import { MusicTrack } from "../models/MusicTrack.js";
import { UserMusic } from "../models/UserMusic.js";
import { completeMusicUpload, createMusicUpload, listMusicUploads, musicUploadStatus } from "../services/musicUploadService.js";
import { processNextMusicUpload } from "../services/musicUploadWorker.js";
import { getMusicDownloadUrl, getMusicPlaybackUrl } from "../services/musicService.js";
import * as storage from "../services/storageService.js";

const port = process.env.BUBBLE_MUSIC_TEST_MONGO_PORT;
describe.skipIf(!port || process.env.BUBBLE_TEST_MUSIC_ENCODING !== "1")("background music uploads", () => {
  const name = "music_encoding_" + randomUUID().replaceAll("-", "");
  const owner = new mongoose.Types.ObjectId().toString();
  const objects = new Map<string, { bytes: Buffer; type: string }>();
  let directory: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "music-test-"));
    await mongoose.connect(`mongodb://127.0.0.1:${port}/${name}`, { serverSelectionTimeoutMS: 3000 });
    await Promise.all([MusicUpload.init(), MusicTrack.init(), UserMusic.init()]);
    vi.spyOn(storage, "createUploadUrl").mockImplementation(async key => key);
    vi.spyOn(storage, "createDownloadUrl").mockImplementation(async (key, _expires, filename) => key + (filename ? "/" + filename : ""));
    vi.spyOn(storage, "getObjectMetadata").mockImplementation(async key => {
      const o = objects.get(key)!;
      return { ContentLength: o.bytes.length, ContentType: o.type, ETag: '"fixture"', $metadata: {} };
    });
    vi.spyOn(storage, "getObject").mockImplementation(async (key, _, ifMatch) => {
      expect(ifMatch).toBe('"fixture"');
      const bytes = objects.get(key)!.bytes;
      return { Body: Readable.from([bytes]), ContentLength: bytes.length, $metadata: {} } as Awaited<ReturnType<typeof storage.getObject>>;
    });
    vi.spyOn(storage, "uploadObject").mockImplementation(async (key, body, type) => {
      objects.set(key, { bytes: Buffer.isBuffer(body) ? body : await buffer(body), type });
    });
    vi.spyOn(storage, "deleteObject").mockImplementation(async key => { objects.delete(key); });
  }, 30_000);
  afterAll(async () => {
    vi.restoreAllMocks();
    if (mongoose.connection.name === name) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it.each([
    ["wav", "audio/wav", []], ["flac", "audio/flac", []], ["m4a", "audio/mp4", []],
    ["ogg", "audio/ogg", ["-c:a", "libvorbis"]], ["mp3", "audio/mpeg", ["-b:a", "320k"]],
    ["mp3", "audio/mpeg", ["-b:a", "192k"]], ["mp3", "audio/mpeg", ["-b:a", "128k"]],
  ] as const)("publishes %s (%s %j) as one playable and downloadable MP3", async (ext, type, args) => {
    const input = join(directory, randomUUID() + "." + ext);
    await promisify(execFile)("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", ...args, input]);
    const bytes = await readFile(input);
    const ticket = await createMusicUpload(owner, { title: "Test", artist: "Artist", size: bytes.length, mimeType: type });
    expect((await listMusicUploads(owner)).some(job => job.id === ticket.uploadId)).toBe(false);
    objects.set(ticket.url, { bytes, type });
    await Promise.all([completeMusicUpload(owner, ticket.uploadId), completeMusicUpload(owner, ticket.uploadId)]);
    expect(await listMusicUploads(owner)).toContainEqual({ id: ticket.uploadId, title: "Test", artist: "Artist", stage: "queued" });
    const other = new mongoose.Types.ObjectId().toString();
    expect(await listMusicUploads(other)).toEqual([]);
    await expect(musicUploadStatus(other, ticket.uploadId)).rejects.toThrow("Upload not found");
    await Promise.all([processNextMusicUpload(), processNextMusicUpload()]);
    const result = await completeMusicUpload(owner, ticket.uploadId);
    if (!("trackId" in result)) throw new Error("Track was not published");
    expect((await listMusicUploads(owner)).some(job => job.id === ticket.uploadId)).toBe(false);
    const track = await MusicTrack.findById(result.trackId).orFail();
    expect(track.duration).toBeCloseTo(2, 1);
    expect(track.mimeType).toBe("audio/mpeg");
    expect(await getMusicPlaybackUrl(track.id)).toBe(track.storageKey);
    expect(await getMusicDownloadUrl(track.id)).toBe(track.storageKey + "/Artist - Test.mp3");
    expect(await UserMusic.countDocuments({ userId: owner, trackId: track.id })).toBe(1);
    const mp3 = objects.get(track.storageKey)!.bytes;
    const output = input + ".mp3";
    await writeFile(output, mp3);
    const { stdout } = await promisify(execFile)("ffprobe", ["-v", "error", "-show_entries", "format=format_name", "-of", "csv=p=0", output]);
    expect(stdout.trim()).toBe("mp3");
    expect(objects.get(track.storageKey)!.type).toBe("audio/mpeg");
    expect(track.size).toBe(mp3.length);
    expect(mp3.equals(bytes)).toBe(args[1] === "128k" || args[1] === "192k");
    if (ext === "wav" || args[1] === "320k") expect(mp3.length).toBeLessThan(bytes.length);
    if (ext === "wav") {
      vi.mocked(storage.deleteObject).mockRejectedValueOnce(new Error("storage unavailable"));
      await processNextMusicUpload();
      expect(objects.has(ticket.url)).toBe(true);
      expect(await musicUploadStatus(owner, ticket.uploadId)).toEqual(result);
      await MusicUpload.updateOne({ _id: ticket.uploadId }, { $set: { nextAttemptAt: new Date() } });
    }
    await processNextMusicUpload();
    expect(objects.has(ticket.url)).toBe(false);
  });

  it("keeps the only source when the file is invalid", async () => {
    const bytes = Buffer.from("invalid audio");
    const ticket = await createMusicUpload(owner, { title: "Broken", artist: "Artist", size: bytes.length, mimeType: "audio/mpeg" });
    objects.set(ticket.url, { bytes, type: "audio/mpeg" });
    await completeMusicUpload(owner, ticket.uploadId);
    await processNextMusicUpload();
    await expect(musicUploadStatus(owner, ticket.uploadId)).rejects.toThrow("MP3");
    expect(await listMusicUploads(owner)).toContainEqual({ id: ticket.uploadId, title: "Broken", artist: "Artist", stage: "failed" });
    expect(objects.has(ticket.url)).toBe(true);
    expect(await MusicTrack.countDocuments({ title: "Broken" })).toBe(0);
  });

  it("keeps the file type and object key of tracks published before normalization", async () => {
    const legacy = await MusicTrack.create({
      title: "Legacy", artist: "Artist", storageKey: "legacy.wav", mimeType: "audio/wav", size: 44, uploadedBy: owner,
    });
    expect(await getMusicPlaybackUrl(legacy.id)).toBe("legacy.wav");
    expect(await getMusicDownloadUrl(legacy.id)).toBe("legacy.wav/Artist - Legacy.wav");
  });

  it("reports a stopped worker and recovers the same upload when the audio tools become available", async () => {
    const input = join(directory, "recovery.mp3");
    await promisify(execFile)("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-b:a", "128k", input]);
    const bytes = await readFile(input);
    const ticket = await createMusicUpload(owner, { title: "Recovery", artist: "Artist", size: bytes.length, mimeType: "audio/mpeg" });
    objects.set(ticket.url, { bytes, type: "audio/mpeg" });
    await completeMusicUpload(owner, ticket.uploadId);
    await MusicUpload.updateOne({ _id: ticket.uploadId }, {
      $set: { updatedAt: new Date(Date.now() - 61_000) },
    }, { timestamps: false });
    expect(await listMusicUploads(owner)).toContainEqual({ id: ticket.uploadId, title: "Recovery", artist: "Artist", stage: "delayed" });

    const before = vi.mocked(storage.getObject).mock.calls.length;
    const tools = env.MUSIC_FFMPEG_DIR;
    env.MUSIC_FFMPEG_DIR = join(directory, "missing-tools");
    try {
      // Also reap the legacy fixture's predecessor if it still has a scheduled cleanup.
      while (await processNextMusicUpload()) { /* drain due jobs */ }
      expect(await listMusicUploads(owner)).toContainEqual({
        id: ticket.uploadId, title: "Recovery", artist: "Artist", stage: "retrying", retryReason: "tools_unavailable",
      });
      expect(vi.mocked(storage.getObject)).toHaveBeenCalledTimes(before);
      expect(objects.get(ticket.url)?.bytes).toEqual(bytes);
    } finally {
      env.MUSIC_FFMPEG_DIR = tools;
    }
    await MusicUpload.updateOne({ _id: ticket.uploadId }, { $set: { nextAttemptAt: new Date() } });
    await Promise.all([processNextMusicUpload(), processNextMusicUpload()]);
    const result = await completeMusicUpload(owner, ticket.uploadId);
    expect(result).toHaveProperty("trackId");
    expect(await MusicTrack.countDocuments({ storageKey: ticket.url + ".mp3" })).toBe(1);
  });
});
