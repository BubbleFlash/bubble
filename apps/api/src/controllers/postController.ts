import mongoose from "mongoose";
import type { Request, Response } from "express";
import { FREE_POST_LENGTH } from "@commune/shared";
import type { CreateRepostInput, Page, PostDTO, UpdateCommunityPostInput } from "@commune/shared";
import { changeContent } from "../services/moderationService.js";
import { visibleContent } from "../models/moderationFields.js";
import { Comment } from "../models/Comment.js";
import { Follow } from "../models/Follow.js";
import { Community } from "../models/Community.js";
import { Like } from "../models/Like.js";
import { Membership } from "../models/Membership.js";
import { Post } from "../models/Post.js";
import { onlineUsers } from "../services/realtime.js";
import { notify, notifyRepost } from "../services/notificationService.js";
import { removePost } from "../services/moderationService.js";
import { canManageCommunityPost, communityMembership, communityPermissions, communityRole, meetsCommunityRole } from "../services/communityAccess.js";
import { deleteUploadIfUnused } from "../services/uploadService.js";
import { PostView } from "../models/PostView.js";
import { User } from "../models/User.js";
import { loadPostMusic, validateMusicTrackIds } from "../services/postMusic.js";
import { AUTHOR_FIELDS, COMMUNITY_FIELDS, loadPost, loadReadablePostAuthor, readablePostFilter } from "../services/postAccess.js";
import { combinedLikeCounts, presentReposts, repostCounts, validateRepostSource } from "../services/repostService.js";
import { isPlusActive } from "../utils/plan.js";
import { badRequest, conflict, forbidden, notFound } from "../utils/errors.js";
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
  const communityIds = new Map(posts.flatMap((post) => post.community?._id && !post.community.creator?.equals(userId)
    ? [[String(post.community._id), post.community._id] as const] : []));
  const [liked, online, counts, previews, music, memberships] = await Promise.all([
    userId ? likedSet(userId, ids) : new Set<string>(),
    onlineUsers(posts.map((post) => post.author._id.toString())),
    repostCounts(ids),
    presentReposts(posts.map((post) => post.repost), userId),
    loadPostMusic(posts),
    userId && communityIds.size
      ? Membership.find({ user: userId, community: { $in: [...communityIds.values()] } }).select("community").lean()
      : [],
  ]);
  const membershipIds = new Map(memberships.map((row) => [String(row.community), row._id]));
  const combined = await combinedLikeCounts(posts.filter((post) => !post.repost && counts.has(String(post._id))).map((post) => post._id));
  return posts.map((p, index) => {
    const key = p._id.toString();
    const role = p.community && userId ? communityRole(p.community, userId, membershipIds.get(String(p.community._id))) : null;
    const canManage = p.community && canManageCommunityPost(p.community, role, p.author._id.equals(userId));
    return {
      ...toPostDTO(p, liked.has(key), music.get(key), online.has(p.author._id.toString())),
      likeCount: combined.get(key) ?? p.likeCount,
      repostCount: counts.get(key) ?? 0,
      repost: previews[index],
      ...(userId && p.community ? { communityActions: { edit: Boolean(canManage), delete: Boolean(canManage) } } : {}),
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
  const community = await Community.findOne({ slug }).select(COMMUNITY_FIELDS).lean();
  if (!community) throw notFound("Community not found");
  const { role } = await communityMembership(community, userId);
  if (!meetsCommunityRole(role, communityPermissions(community).publish)) {
    throw forbidden("You cannot publish in this community");
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
  const role = post.community ? (await communityMembership(post.community, req.userId!)).role : null;
  const canManage = post.community && canManageCommunityPost(post.community, role, true);
  res.status(201).json({
    ...toPostDTO(post, false, music.get(post._id.toString()), online.has(post.author._id.toString())),
    repostCount: 0,
    ...(post.community ? { communityActions: { edit: Boolean(canManage), delete: Boolean(canManage) } } : {}),
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
  const post = await Post.findOne({ _id: id, ...visibleContent }).select("author community").lean();
  if (!post) throw notFound("Post not found");
  const mine = post.author.equals(req.userId);
  if (req.userRole !== "admin") {
    if (post.community) {
      const community = await Community.findById(post.community).select(COMMUNITY_FIELDS).lean();
      const role = community ? (await communityMembership(community, req.userId!)).role : null;
      if (!community || !canManageCommunityPost(community, role, mine)) {
        throw forbidden("You cannot delete this community post");
      }
    } else if (!mine) {
      throw forbidden("You can only delete your own posts");
    }
  }

  if (req.userRole === "admin" && !mine) {
    await changeContent("post", id, "removed", { id: req.userId!, role: "admin" }, "Удаление из карточки записи");
  } else {
    await removePost(id, req.userId);
  }
  res.status(204).end();
}

export async function updatePost(req: Request, res: Response) {
  const id = param(req, "id");
  const userId = req.userId!;
  const post = await loadPost(id, userId);
  const role = post.community ? (await communityMembership(post.community, userId)).role : null;
  if (!post.community || !canManageCommunityPost(post.community, role, post.author._id.equals(userId))) {
    throw forbidden("You cannot edit this community post");
  }

  const { content, imageUrls, musicTrackIds } = req.body as UpdateCommunityPostInput;
  const images = imageUrls ?? (post.imageUrls?.length ? post.imageUrls : post.imageUrl ? [post.imageUrl] : []);
  const music = musicTrackIds ?? post.musicTrackIds ?? [];
  if (!content && !images.length && !music.length && !post.repost) {
    throw badRequest("Write something or attach a file");
  }
  if (content !== post.content) await requirePostLength(userId, content);
  if (musicTrackIds) {
    const existing = new Set(post.musicTrackIds?.map(String));
    await validateMusicTrackIds(musicTrackIds.filter((trackId) => !existing.has(trackId)));
  }
  const previous = await Post.findOneAndUpdate(
    { _id: id, community: post.community._id, updatedAt: post.updatedAt ?? { $exists: false } },
    { $set: {
      content,
      ...(imageUrls ? { imageUrls, imageUrl: imageUrls[0] ?? null } : {}),
      ...(musicTrackIds ? { musicTrackIds } : {}),
    } },
    { runValidators: true },
  ).lean();
  if (!previous) throw conflict("This post changed. Refresh and try again.");
  if (imageUrls) {
    const removed = new Set([previous.imageUrl, ...(previous.imageUrls ?? [])]);
    await Promise.all([...removed].filter((url): url is string => Boolean(url && !imageUrls.includes(url))).map((url) => deleteUploadIfUnused(url)));
  }
  const updated = await loadPost(id, userId);
  const [dto] = await presentPosts(userId, [updated]);
  res.json(dto);
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
  const comments = (await Comment.find({ post: id, ...visibleContent })
    .sort({ _id: 1 })
    .limit(200)
    .populate("author", AUTHOR_FIELDS)
    .lean()) as unknown as PopulatedComment[];
  const focus = req.query.comment;
  if (typeof focus === "string" && mongoose.isObjectIdOrHexString(focus) &&
      !comments.some((comment) => String(comment._id) === focus)) {
    const linkedComment = (await Comment.findOne({ _id: focus, post: id, ...visibleContent })
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
