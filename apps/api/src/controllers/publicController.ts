import mongoose from "mongoose";
import type { Request, Response } from "express";
import type { Page, PostDTO } from "@commune/shared";
import { Post } from "../models/Post.js";
import { AUTHOR_FIELDS, COMMUNITY_FIELDS, publicPostFilter } from "../services/postAccess.js";
import { badRequest, notFound } from "../utils/errors.js";
import type { PopulatedPost } from "../utils/serializers.js";
import { presentPosts } from "./postController.js";

/**
 * Latest posts for logged-out visitors. Paid posts are excluded entirely (not even teasers),
 * and nothing viewer-specific (likes) is included, so the response is the same for everyone.
 */
export async function listPosts(_req: Request, res: Response) {
  const { cursor, limit } = (res.locals as { query: { cursor?: string; limit: number } }).query;
  if (cursor && !mongoose.isValidObjectId(cursor)) throw badRequest("Invalid cursor");

  const filter = { ...publicPostFilter, ...(cursor ? { _id: { $lt: cursor } } : {}) };
  const rows = (await Post.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate("author", AUTHOR_FIELDS)
    .populate("community", COMMUNITY_FIELDS)
    .lean()) as unknown as PopulatedPost[];

  const hasMore = rows.length > limit;
  const posts = hasMore ? rows.slice(0, limit) : rows;
  const body: Page<PostDTO> = {
    items: await presentPosts(undefined, posts),
    nextCursor: hasMore ? (posts[posts.length - 1]?._id.toString() ?? null) : null,
  };
  res.set("Cache-Control", "no-store");
  res.json(body);
}

export async function getPost(req: Request, res: Response) {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound("Post not found");
  const post = await Post.findOne({ ...publicPostFilter, _id: req.params.id }).populate("author", AUTHOR_FIELDS).populate("community", COMMUNITY_FIELDS).lean() as unknown as PopulatedPost | null;
  if (!post?.author) throw notFound("Post not found");
  const [result] = await presentPosts(undefined, [post]);
  res.set("Cache-Control", "no-store").json(result);
}
