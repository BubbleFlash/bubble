import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import { promisify } from "node:util";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MusicUpload } from "../models/MusicUpload.js";
import { MusicTrack } from "../models/MusicTrack.js";
import { UserMusic } from "../models/UserMusic.js";
import { completeMusicUpload, createMusicUpload, musicUploadStatus } from "../services/musicUploadService.js";
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
    objects.set(ticket.url, { bytes, type });
    await Promise.all([completeMusicUpload(owner, ticket.uploadId), completeMusicUpload(owner, ticket.uploadId)]);
    await expect(musicUploadStatus(new mongoose.Types.ObjectId().toString(), ticket.uploadId)).rejects.toThrow("Upload not found");
    await Promise.all([processNextMusicUpload(), processNextMusicUpload()]);
    const result = await completeMusicUpload(owner, ticket.uploadId);
    if (!("trackId" in result)) throw new Error("Track was not published");
    const track = await MusicTrack.findById(result.trackId).orFail();
    expect(track.duration).toBeCloseTo(2, 1);
    expect(track.mimeType).toBe("audio/mpeg");
    expect(await getMusicPlaybackUrl(track.id)).toBe(track.storageKey);
    expect(await getMusicDownloadUrl(track.id)).toBe(track.storageKey + "/Artist - Test.mp3");
    expect(await UserMusic.countDocuments({ userId: owner, trackId: track.id })).toBe(1);
    const mp3 = objects.get(track.storageKey)!.bytes;
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
    expect(objects.has(ticket.url)).toBe(true);
    expect(await MusicTrack.countDocuments({ title: "Broken" })).toBe(0);
  });
});
