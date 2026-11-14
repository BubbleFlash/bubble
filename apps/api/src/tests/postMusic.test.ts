import { describe, expect, it, vi, afterEach } from "vitest";
import { Types } from "mongoose";
import { createPostSchema } from "@commune/shared";
import { MusicTrack } from "../models/MusicTrack.js";
import { Post } from "../models/Post.js";
import { createPost, presentPosts } from "../controllers/postController.js";
import { Like } from "../models/Like.js";
import { loadPostMusic } from "../services/postMusic.js";
import { toPostDTO, type PopulatedPost } from "../utils/serializers.js";
import type { Request, Response } from "express";

const ids = Array.from({ length: 11 }, (_, index) => (index + 10).toString(16).padStart(24, "0"));
const post = (musicTrackIds: string[]): PopulatedPost => ({
  _id: new Types.ObjectId(),
  content: "",
  author: { _id: new Types.ObjectId(), username: "owner" },
  musicTrackIds: musicTrackIds.map((id) => new Types.ObjectId(id)),
  likeCount: 0,
  commentCount: 0,
  createdAt: new Date(),
});
afterEach(() => vi.restoreAllMocks());

describe("post music", () => {
  it("validates empty, music-only, mixed, maximum and duplicate inputs", () => {
    expect(createPostSchema.safeParse({ content: "" }).success).toBe(false);
    expect(createPostSchema.safeParse({ content: "text", musicTrackIds: [] }).success).toBe(true);
    expect(
      createPostSchema.safeParse({ content: "", musicTrackIds: ids.slice(0, 10) }).success,
    ).toBe(true);
    expect(createPostSchema.safeParse({ content: "text", musicTrackIds: ids }).success).toBe(false);
    expect(
      createPostSchema.safeParse({ content: "", musicTrackIds: [ids[0], ids[0]!.toUpperCase()] })
        .success,
    ).toBe(false);
    expect(createPostSchema.safeParse({ content: "", musicTrackIds: ["bad"] }).success).toBe(false);
  });

  it("rejects nonexistent tracks before creating the post", async () => {
    vi.spyOn(MusicTrack, "countDocuments").mockResolvedValue(0 as never);
    const create = vi.spyOn(Post, "create");
    await expect(
      createPost(
        {
          userId: "507f1f77bcf86cd799439011",
          body: { content: "", musicTrackIds: [ids[0]] },
        } as Request,
        {} as Response,
      ),
    ).rejects.toThrow("Music track not found");
    expect(create).not.toHaveBeenCalled();
  });

  it("loads a page once, preserves order, and marks missing tracks", async () => {
    const find = vi
      .spyOn(MusicTrack, "find")
      .mockImplementation((() => ({
        select: () => ({
          lean: async () => [
            { _id: new Types.ObjectId(ids[0]), title: "First", artist: "Artist", duration: null },
          ],
        }),
      })) as never);
    const first = post([ids[1]!, ids[0]!]);
    const second = post([ids[0]!]);
    const music = await loadPostMusic([first, second]);
    expect(find).toHaveBeenCalledTimes(1);
    expect(music.get(first._id.toString())).toEqual([
      { id: ids[1], unavailable: true },
      { id: ids[0], title: "First", artist: "Artist", duration: null, unavailable: false },
    ]);
    expect(music.get(second._id.toString())).toHaveLength(1);
    expect(toPostDTO(post([]), false).musicAttachments).toEqual([]);
  });

  it("fetches track metadata in one batch when presenting a page", async () => {
    vi.spyOn(Post, "aggregate").mockResolvedValue([] as never);
    vi.spyOn(Like, "find").mockImplementation((() => ({
      select: () => ({ lean: async () => [] }),
    })) as never);
    const filters: unknown[] = [];
    const find = vi.spyOn(MusicTrack, "find").mockImplementation(((filter: unknown) => {
      filters.push(filter);
      return { select: () => ({ lean: async () => [] }) };
    }) as never);
    const result = await presentPosts("507f1f77bcf86cd799439011", [post([ids[0]!]), post([ids[1]!])]);
    expect(find).toHaveBeenCalledTimes(1);
    expect(filters[0]).toEqual({ _id: { $in: ids.slice(0, 2) } });
    expect(result[1]?.musicAttachments).toEqual([{ id: ids[1], unavailable: true }]);
  });
});
