import mongoose from "mongoose";
import type { Request, Response } from "express";
import { FREE_POST_LENGTH } from "@commune/shared";
import type { CreateRepostInput, Page, PostDTO } from "@commune/shared";
import { Comment } from "../models/Comment.js";
import { Follow } from "../models/Follow.js";
import { Community } from "../models/Community.js";
import { Like } from "../models/Like.js";
import { Membership } from "../models/Membership.js";
import { Post } from "../models/Post.js";
import { onlineUsers } from "../services/realtime.js";
import { notify, notifyRepost } from "../services/notificationService.js";
import { removePost } from "../services/moderationService.js";
import { PostView } from "../models/PostView.js";
import { User } from "../models/User.js";
import { loadPostMusic, validateMusicTrackIds } from "../services/postMusic.js";
import { AUTHOR_FIELDS, COMMUNITY_FIELDS, loadPost, loadReadablePostAuthor, readablePostFilter } from "../services/postAccess.js";
import { combinedLikeCounts, presentReposts, repostCounts, validateRepostSource } from "../services/repostService.js";
import { isPlusActive } from "../utils/plan.js";
import { badRequest, forbidden, notFound } from "../utils/errors.js";
import {
  toCommentDTO,
  toPostDTO,
  type PopulatedComment,
  type PopulatedPost,
} from "../utils/serializers.js";

const param = (req: Request, name: string): string => {
  const value = req.params[name];
  if (!value || !mongoose.isValidObjectId(value)) throw badRequest("Invalid id");
  return value;
};

async function likedSet(userId: string, postIds: mongoose.Types.ObjectId[]) {
  const likes = await Like.find({ user: userId, post: { $in: postIds } })
    .select("post")
    .lean();
  return new Set(likes.map((l) => l.post.toString()));
}

/** Turns readable posts into DTOs with reactions and quotes for this viewer. */
export async function presentPosts(userId: string | undefined, posts: PopulatedPost[]): Promise<PostDTO[]> {
  if (!posts.length) return [];
  const ids = posts.map((post) => post._id);
  const [liked, online, counts, previews, music] = await Promise.all([
    userId ? likedSet(userId, ids) : new Set<string>(),
    onlineUsers(posts.map((post) => post.author._id.toString())),
    repostCounts(ids),
    presentReposts(posts.map((post) => post.repost), userId),
    loadPostMusic(posts),
  ]);
  const combined = await combinedLikeCounts(posts.filter((post) => !post.repost && counts.has(String(post._id))).map((post) => post._id));
  return posts.map((p, index) => {
    const key = p._id.toString();
    return {
      ...toPostDTO(p, liked.has(key), music.get(key), online.has(p.author._id.toString())),
      likeCount: combined.get(key) ?? p.likeCount,
      repostCount: counts.get(key) ?? 0,
      repost: previews[index],
    };
  });
}

/**
 * Sends one cursor-paginated page of posts matching `baseFilter`.
 * Expects validated pagination params in res.locals.query (see the validate middleware).
 */
export async function sendPostPage(
  req: Request,
  res: Response,
  baseFilter: Record<string, unknown>,
) {
  const { cursor, limit } = (res.locals as { query: { cursor?: string; limit: number } }).query;
  if (cursor && !mongoose.isValidObjectId(cursor)) throw badRequest("Invalid cursor");

  const filter = { ...baseFilter, ...await readablePostFilter(req.userId), ...(cursor ? { _id: { $lt: cursor } } : {}) };
  const rows = (await Post.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate("author", AUTHOR_FIELDS)
    .populate("community", COMMUNITY_FIELDS)
    .lean()) as unknown as PopulatedPost[];

  const hasMore = rows.length > limit;
  const posts = hasMore ? rows.slice(0, limit) : rows;
  const body: Page<PostDTO> = {
    items: await presentPosts(req.userId!, posts),
    nextCursor: hasMore ? (posts[posts.length - 1]?._id.toString() ?? null) : null,
  };
  res.json(body);
}

export async function listPosts(req: Request, res: Response) {
  const { feed } = (res.locals as { query: { feed: "all" | "following" } }).query;

  const baseFilter: Record<string, unknown> = {};
  if (feed === "following") {
    // Posts from people I follow, plus my own.
    const follows = await Follow.find({ follower: req.userId }).select("following").lean();
    baseFilter.author = { $in: [...follows.map((f) => f.following), req.userId] };
  }
  await sendPostPage(req, res, baseFilter);
}

export async function getPost(req: Request, res: Response) {
  const post = await loadPost(param(req, "id"), req.userId!);
  const [dto] = await presentPosts(req.userId, [post]);
  res.json(dto);
}

async function requirePostLength(userId: string, content: string) {
  // Long posts are a Commune Plus feature.
  if (content.length > FREE_POST_LENGTH) {
    const author = await User.findById(userId).select("plusUntil").lean();
    if (!isPlusActive(author?.plusUntil)) {
      throw forbidden(`Posts over ${FREE_POST_LENGTH} characters need Commune Plus`);
    }
  }
}

async function postingCommunity(userId: string, slug?: string | null) {
  if (!slug) return null;
  const community = await Community.findOne({ slug }).select("_id").lean();
  if (!community) throw notFound("Community not found");
  if (!(await Membership.exists({ user: userId, community: community._id }))) {
    throw forbidden("Join this community to post in it");
  }
  return community._id.toString();
}

export async function createPost(req: Request, res: Response) {
  await requirePostLength(req.userId!, req.body.content);
  const communityId = await postingCommunity(req.userId!, req.body.community);
  const musicTrackIds: string[] = req.body.musicTrackIds ?? [];
  await validateMusicTrackIds(musicTrackIds);
  const created = await Post.create({
    author: req.userId,
    community: communityId,
    content: req.body.content,
    visibility: req.body.visibility,
    imageUrl: req.body.imageUrls?.[0] ?? req.body.imageUrl ?? null,
    imageUrls: req.body.imageUrls ?? (req.body.imageUrl ? [req.body.imageUrl] : []),
    musicTrackIds,
  });
  const post = await loadPost(created._id.toString(), req.userId!);
  const [music, online] = await Promise.all([
    loadPostMusic([post]),
    onlineUsers([post.author._id.toString()]),
  ]);
  res.status(201).json({
    ...toPostDTO(post, false, music.get(post._id.toString()), online.has(post.author._id.toString())),
    repostCount: 0,
  });
}

export async function createRepost(req: Request, res: Response) {
  const userId = req.userId!;
  const { source, content, community } = req.body as CreateRepostInput;
  await requirePostLength(userId, content);
  const [original, communityId] = await Promise.all([
    validateRepostSource(source, userId),
    postingCommunity(userId, community),
  ]);
  const ancestors = [...(original.repostAncestors ?? []), original._id];
  const created = await Post.create({
    author: userId,
    community: communityId,
    content,
    repost: source,
    repostAncestors: ancestors,
  });
  await notifyRepost(original, userId, created._id);
  const post = await loadPost(String(created._id), userId);
  const [dto] = await presentPosts(userId, [post]);
  res.status(201).json(dto);
}

export async function deletePost(req: Request, res: Response) {
  const id = param(req, "id");
  const post = await Post.findById(id).select("author community").lean();
  if (!post) throw notFound("Post not found");
  // Authors can delete their own posts; admins can remove anyone's; so can the owner of the
  // community the post was made in.
  const allowed =
    post.author.toString() === req.userId ||
    req.userRole === "admin" ||
    (post.community != null &&
      Boolean(
        await Membership.exists({ user: req.userId, community: post.community, role: "owner" }),
      ));
  if (!allowed) throw forbidden("You can only delete your own posts");

  await removePost(id, req.userId);
  res.status(204).end();
}

/** Toggles the current user's like. The unique index makes this safe under concurrent clicks. */
export async function toggleLike(req: Request, res: Response) {
  const id = param(req, "id");
  const author = await loadReadablePostAuthor(id, req.userId!);

  const removed = await Like.findOneAndDelete({ post: id, user: req.userId });
  if (removed) {
    await Post.updateOne({ _id: id }, { $inc: { likeCount: -1 } });
  } else {
    try {
      await Like.create({ post: id, user: req.userId });
      await Post.updateOne({ _id: id }, { $inc: { likeCount: 1 } });
      await notify({ user: author, actor: req.userId!, type: "like", post: id });
    } catch (err) {
      // A concurrent request already created the like; treat as success.
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }

  const post = await loadPost(id, req.userId!);
  const [dto] = await presentPosts(req.userId, [post]);
  res.json(dto);
}

export async function listComments(req: Request, res: Response) {
  const id = param(req, "id");
  await loadReadablePostAuthor(id, req.userId!);
  const comments = (await Comment.find({ post: id })
    .sort({ _id: 1 })
    .limit(200)
    .populate("author", AUTHOR_FIELDS)
    .lean()) as unknown as PopulatedComment[];
  const focus = req.query.comment;
  if (typeof focus === "string" && mongoose.isObjectIdOrHexString(focus) &&
      !comments.some((comment) => String(comment._id) === focus)) {
    const linkedComment = (await Comment.findOne({ _id: focus, post: id })
      .populate("author", AUTHOR_FIELDS)
      .lean()) as unknown as PopulatedComment | null;
    if (linkedComment) comments.push(linkedComment);
  }
  res.json(comments.map(toCommentDTO));
}

export async function addComment(req: Request, res: Response) {
  const id = param(req, "id");
  const author = await loadReadablePostAuthor(id, req.userId!);

  const created = await Comment.create({ post: id, author: req.userId, content: req.body.content });
  await Post.updateOne({ _id: id }, { $inc: { commentCount: 1 } });
  await notify({ user: author, actor: req.userId!, type: "comment", post: id });

  const comment = (await Comment.findById(created._id)
    .populate("author", AUTHOR_FIELDS)
    .lean()) as unknown as PopulatedComment;
  res.status(201).json(toCommentDTO(comment));
}

/**
 * Counts a view of a post: once per viewer per day, never the author's own. Called by the web
 * app when a post page is opened; powers the Insights dashboard.
 */
export async function trackView(req: Request, res: Response) {
  const id = param(req, "id");
  const author = await loadReadablePostAuthor(id, req.userId!);
  if (author.toString() !== req.userId) {
    const day = new Date().toISOString().slice(0, 10);
    const result = await PostView.updateOne(
      { post: id, viewer: req.userId, day },
      { $setOnInsert: { author, createdAt: new Date() } },
      { upsert: true },
    );
    if (result.upsertedCount > 0) await Post.updateOne({ _id: id }, { $inc: { viewCount: 1 } });
  }
  res.status(204).end();
}
