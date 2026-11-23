import type { Request, Response } from "express";
import { z } from "zod";
import { Comment } from "../models/Comment.js";
import { Community } from "../models/Community.js";
import { FeedbackExport } from "../models/FeedbackExport.js";
import { Post } from "../models/Post.js";
import { visibleContent } from "../models/moderationFields.js";
import { publicPostFilter } from "../services/postAccess.js";
import { badRequest, notFound } from "../utils/errors.js";

const legacyCommunityName = "Жалобы и предложения Bubble";
const postLimit = 500;
const commentLimit = 5000;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const period = z.object({ from: date, to: date }).strict();
const communityId = z.string().regex(/^[a-f0-9]{24}$/i);
type ExportAuthor = { username: string; displayName?: string | null };

function authorOf(user?: ExportAuthor | null) {
  return user ? { username: user.username, displayName: user.displayName ?? user.username } : null;
}

async function loadCommunity(req: Request) {
  const parsed = communityId.safeParse(req.params.communityId);
  if (!parsed.success) throw badRequest("Invalid feedback community ID");
  const group = await Community.findById(parsed.data).select("name slug").lean();
  if (!group) throw notFound("Feedback community not found");
  return group;
}

export async function listFeedbackCommunities(_req: Request, res: Response) {
  const groups = await Community.find().select("name slug").sort({ name: 1, slug: 1 }).lean();
  res.json(groups.map((group) => ({ id: String(group._id), name: group.name, slug: group.slug })));
}

export async function lastFeedbackExport(req: Request, res: Response) {
  const group = await loadCommunity(req);
  let last = await FeedbackExport.findById(String(group._id)).select("from to exportedAt -_id").lean();
  // The original export stored one period for the fixed feedback group.
  if (!last && group.name === legacyCommunityName &&
      !await Community.exists({ name: legacyCommunityName, _id: { $ne: group._id } })) {
    last = await FeedbackExport.findById("feedback").select("from to exportedAt -_id").lean();
  }
  res.json(last);
}

export async function exportFeedback(req: Request, res: Response) {
  const parsed = period.safeParse(req.body);
  if (!parsed.success || parsed.data.from > parsed.data.to) throw badRequest("Invalid feedback export period");
  const { from, to } = parsed.data;
  const end = new Date(to);
  end.setUTCDate(end.getUTCDate() + 1);

  const group = await loadCommunity(req);

  const posts = await Post.find({
    ...publicPostFilter,
    community: group._id,
    createdAt: { $gte: new Date(from), $lt: end },
  }).select("author hideAuthor content imageUrl imageUrls createdAt")
    .sort({ createdAt: 1, _id: 1 }).limit(postLimit + 1)
    .populate<{ author: ExportAuthor | null }>("author", "username displayName").lean();
  if (posts.length > postLimit) throw badRequest("Feedback export is too large");

  const comments = await Comment.find({ ...visibleContent, post: { $in: posts.map((post) => post._id) } })
    .select("post parent author content createdAt")
    .sort({ createdAt: 1, _id: 1 }).limit(commentLimit + 1)
    .populate<{ author: ExportAuthor | null }>("author", "username displayName").lean();
  if (comments.length > commentLimit) throw badRequest("Feedback export is too large");

  const replies = new Map<string, typeof comments>();
  for (const comment of comments) {
    const id = String(comment.post);
    if (!replies.has(id)) replies.set(id, []);
    replies.get(id)!.push(comment);
  }

  const exportedAt = new Date();
  const payload = {
    community: { name: group.name, slug: group.slug },
    from, to, exportedAt,
    posts: posts.map((post) => ({
      id: String(post._id),
      author: post.hideAuthor ? null : authorOf(post.author),
      content: post.content,
      images: post.imageUrls?.length ? post.imageUrls : post.imageUrl ? [post.imageUrl] : [],
      createdAt: post.createdAt,
      comments: (replies.get(String(post._id)) ?? []).map((comment) => ({
        id: String(comment._id),
        parentId: comment.parent ? String(comment.parent) : null,
        author: authorOf(comment.author),
        content: comment.content,
        createdAt: comment.createdAt,
      })),
    })),
  };
  const json = JSON.stringify(payload);
  if (Buffer.byteLength(json) > 4 * 1024 * 1024) throw badRequest("Feedback export is too large");
  await FeedbackExport.updateOne({ _id: String(group._id) }, { $set: { from, to, exportedAt } }, { upsert: true });
  res.type("json").send(json);
}
