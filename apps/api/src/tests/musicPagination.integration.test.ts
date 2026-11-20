import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MusicTrack } from "../models/MusicTrack.js";
import { UserMusic } from "../models/UserMusic.js";
import { listPickerMusic } from "../services/musicService.js";

const port = process.env.BUBBLE_MUSIC_TEST_MONGO_PORT;
const integration = port && /^\d{1,5}$/.test(port) ? describe : describe.skip;

integration("music pagination on isolated MongoDB", () => {
  const dbName = `bubble_music_test_${randomUUID().replaceAll("-", "")}`;
  const user = new mongoose.Types.ObjectId();
  let ownsDatabase = false;
  beforeAll(async () => {
    await mongoose.connect(`mongodb://127.0.0.1:${port}/${dbName}`, { serverSelectionTimeoutMS: 3000 });
    ownsDatabase = true;
    const tracks = await MusicTrack.insertMany(Array.from({ length: 120 }, (_, i) => ({ title: `Track ${String(i).padStart(3, "0")}`, artist: "Artist", storageKey: `track-${i}`, mimeType: "audio/mpeg", size: 1, uploadedBy: user })));
    await UserMusic.insertMany(tracks.map((track) => ({ userId: user, trackId: track._id })));
    await UserMusic.create({ userId: user, trackId: new mongoose.Types.ObjectId() });
  });
  afterAll(async () => {
    if (ownsDatabase && mongoose.connection.name === dbName) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  it("returns every library track once and preserves search and library status", async () => {
    const pages = [];
    let cursor: string | undefined;
    do {
      const page = await listPickerMusic(String(user), { scope: "mine", cursor });
      pages.push(page);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    const tracks = pages.flatMap((page) => page.tracks);
    expect(pages.map((page) => page.tracks.length)).toEqual([50, 50, 20]);
    expect(new Set(tracks.map((track) => track.id)).size).toBe(120);
    expect(tracks.every((track) => track.addedByMe && track.addedAt)).toBe(true);
    const search = await listPickerMusic(String(user), { scope: "mine", q: "Track 00" });
    expect(search.tracks).toHaveLength(10);
    expect(search.nextCursor).toBeNull();
    const catalog = await listPickerMusic(String(user), { scope: "all" });
    expect(catalog.tracks.every((track) => track.addedByMe && track.addedAt)).toBe(true);
  });
});
