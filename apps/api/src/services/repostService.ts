import type { Types } from "mongoose";
import type { RepostPreviewDTO, RepostSource } from "@commune/shared";
import { Comment } from "../models/Comment.js";
import { Like } from "../models/Like.js";
import { Post } from "../models/Post.js";
import { Message } from "../models/Message.js";
import { notFound } from "../utils/errors.js";
import { toAuthor, type PopulatedComment, type PopulatedPost } from "../utils/serializers.js";
import { AUTHOR_FIELDS, COMMUNITY_FIELDS, loadPost, readablePostFilter } from "./postAccess.js";
import { loadPostMusic } from "./postMusic.js";

type Source = NonNullable<PopulatedPost["repost"]>;
const PREVIEW_DEPTH = 3;

export async function validateRepostSource(source: RepostSource, userId: string) {
  const post = await loadPost(source.post, userId);
  if (source.comment && !(await Comment.exists({ _id: source.comment, post: post._id })))
    throw notFound("Comment not found");
  return post;
}

/** Resolve references afresh for each viewer, querying one level of the page's previews at a time. */
export async function presentReposts(
  sources: (Source | undefined)[],
  userId?: string,
  depth = PREVIEW_DEPTH,
): Promise<(RepostPreviewDTO | undefined)[]> {
  const refs = sources.filter((source): source is Source => Boolean(source));
  if (!refs.length) return sources.map(() => undefined);
  const filter = { _id: { $in: refs.map((source) => source.post) }, ...await readablePostFilter(userId) };
  if (depth === 0) {
    const visible = await Post.distinct("_id", filter);
    const allowed = new Set(visible.map(String));
    return sources.map((source) => source && (
      allowed.has(String(source.post)) ? { kind: "link", postId: String(source.post) } : { kind: "unavailable" }
    ));
  }

  const [posts, comments] = await Promise.all([
    Post.find(filter).populate("author", AUTHOR_FIELDS).populate("community", COMMUNITY_FIELDS).lean() as unknown as Promise<PopulatedPost[]>,
    refs.some((source) => source.comment)
      ? Comment.find({ _id: { $in: refs.flatMap((source) => source.comment ? [source.comment] : []) } })
          .populate("author", AUTHOR_FIELDS).lean() as unknown as Promise<PopulatedComment[]>
      : [],
  ]);
  const postsById = new Map(posts.filter((post) => post.author).map((post) => [String(post._id), post]));
  const commentsById = new Map(comments.filter((comment) => comment.author).map((comment) => [String(comment._id), comment]));
  const selected = [...new Set(refs.flatMap((source) => {
    const post = postsById.get(String(source.post));
    return post && !source.comment ? [post] : [];
  }))];
  const nestedPosts = selected.filter((post) => post.repost);
  const [music, nested] = await Promise.all([
    loadPostMusic(selected),
    presentReposts(nestedPosts.map((post) => post.repost), userId, depth - 1),
  ]);
  const nestedById = new Map(nestedPosts.map((post, index) => [String(post._id), nested[index]]));

  return sources.map((source): RepostPreviewDTO | undefined => {
    if (!source) return;
    const postId = String(source.post);
    const post = postsById.get(postId);
    if (!post) return { kind: "unavailable" };
    if (source.comment) {
      const comment = commentsById.get(String(source.comment));
      if (!comment || String(comment.post) !== postId) return { kind: "unavailable" };
      return {
        kind: "comment",
        postId,
        commentId: String(comment._id),
        author: toAuthor(comment.author),
        content: comment.content,
        createdAt: comment.createdAt.toISOString(),
      };
    }
    return {
      kind: "post",
      postId,
      author: toAuthor(post.author),
      content: post.content,
      createdAt: post.createdAt.toISOString(),
      imageUrls: post.imageUrls?.length ? post.imageUrls : post.imageUrl ? [post.imageUrl] : [],
      musicAttachments: music.get(postId) ?? [],
      community: post.community ? { slug: post.community.slug, name: post.community.name, avatarUrl: post.community.avatarUrl } : undefined,
      repost: nestedById.get(postId),
    };
  });
}

export async function repostCounts(ids: Types.ObjectId[]) {
  if (!ids.length) return new Map<string, number>();
  const rows = await Post.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { repostAncestors: { $in: ids } } },
    { $unwind: "$repostAncestors" },
    { $match: { repostAncestors: { $in: ids } } },
    { $project: { _id: "$repostAncestors" } },
    { $unionWith: {
      coll: Message.collection.name,
      pipeline: [
        { $match: {
          "repost.post": { $exists: true },
          $or: [{ repostAncestors: { $in: ids } }, { repostAncestors: { $exists: false } }],
        } },
        { $lookup: {
          from: Post.collection.name,
          localField: "repost.post",
          foreignField: "_id",
          pipeline: [{ $project: { repostAncestors: 1 } }],
          as: "source",
        } },
        { $project: {
          ancestors: { $ifNull: [
            "$repostAncestors",
            { $concatArrays: [
              { $ifNull: [{ $arrayElemAt: ["$source.repostAncestors", 0] }, []] },
              ["$repost.post"],
            ] },
          ] },
        } },
        { $unwind: "$ancestors" },
        { $match: { ancestors: { $in: ids } } },
        { $project: { _id: "$ancestors" } },
      ],
    } },
    { $group: { _id: "$_id", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

/** The root includes direct likes and each distinct account that liked any surviving descendant. */
export async function combinedLikeCounts(rootIds: Types.ObjectId[]) {
  if (!rootIds.length) return new Map<string, number>();
  const rows = await Post.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { $or: [{ _id: { $in: rootIds } }, { repostAncestors: { $in: rootIds } }] } },
    { $project: { root: { $ifNull: [{ $arrayElemAt: ["$repostAncestors", 0] }, "$_id"] } } },
    { $match: { root: { $in: rootIds } } },
    {
      $lookup: {
        from: Like.collection.name,
        localField: "_id",
        foreignField: "post",
        pipeline: [{ $project: { _id: 0, user: 1 } }],
        as: "likes",
      },
    },
    { $unwind: "$likes" },
    { $group: { _id: { root: "$root", user: "$likes.user" } } },
    { $group: { _id: "$_id.root", count: { $sum: 1 } } },
  ]).allowDiskUse(true);
  const counts = new Map(rootIds.map((id) => [String(id), 0]));
  for (const row of rows) counts.set(String(row._id), row.count);
  return counts;
}
