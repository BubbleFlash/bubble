import type { Types } from "mongoose";
import { Post } from "../models/Post.js";
import { Follow } from "../models/Follow.js";
import { notFound } from "../utils/errors.js";
import type { PopulatedPost } from "../utils/serializers.js";

export const AUTHOR_FIELDS = "username displayName avatarUrl avatarFrame plusUntil";
export const COMMUNITY_FIELDS = "slug name avatarUrl creator";

export const publicPostFilter = { priceCents: null, visibility: { $nin: ["private", "friends"] } };

export async function readablePostFilter(userId?: string) {
  if (!userId) return publicPostFilter;
  const outgoing = await Follow.find({ follower: userId }).select("following").lean();
  const incoming = await Follow.find({ follower: { $in: outgoing.map((f) => f.following) }, following: userId }).select("follower").lean();
  return { priceCents: null, $or: [
    { visibility: { $nin: ["private", "friends"] } },
    { author: userId },
    { visibility: "friends", author: { $in: incoming.map((f) => f.follower) } },
  ] };
}

async function canRead(post: { author: Types.ObjectId; visibility?: string; priceCents?: number | null }, userId: string) {
  if (post.priceCents != null) return false;
  if (String(post.author) === userId) return true;
  if (post.visibility === "private") return false;
  if (post.visibility !== "friends") return true;
  const [forward, back] = await Promise.all([
    Follow.exists({ follower: userId, following: post.author }),
    Follow.exists({ follower: post.author, following: userId }),
  ]);
  return Boolean(forward && back);
}

export async function loadPost(id: string, userId: string): Promise<PopulatedPost> {
  const post = (await Post.findById(id)
    .populate("author", AUTHOR_FIELDS)
    .populate("community", COMMUNITY_FIELDS)
    .lean()) as unknown as PopulatedPost | null;
  if (!post?.author || !(await canRead({ ...post, author: post.author._id }, userId))) throw notFound("Post not found");
  return post;
}

export async function loadReadablePostAuthor(id: string, userId: string): Promise<Types.ObjectId> {
  const post = await Post.findById(id).select("author visibility priceCents").lean();
  if (!post || !(await canRead(post, userId)))
    throw notFound("Post not found");
  return post.author;
}
