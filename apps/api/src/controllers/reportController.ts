import type { Request, Response } from "express";
import { Post } from "../models/Post.js";
import { Report } from "../models/Report.js";
import { Comment } from "../models/Comment.js";
import { CommentReport } from "../models/CommentReport.js";
import { visibleContent } from "../models/moderationFields.js";
import { loadReadablePostAuthor } from "../services/postAccess.js";
import { badRequest, conflict, notFound } from "../utils/errors.js";
import { idParam } from "../utils/params.js";

export async function createReport(req: Request, res: Response) {
  const id = idParam(req, "id");
  const author = await loadReadablePostAuthor(id, req.userId!);
  if (String(author) === req.userId) throw badRequest("You can't report your own post");

  try {
    await Report.create({
      snapshot: { content: (await Post.findById(id).select("content").lean())?.content, author },
      reporter: req.userId,
      post: id,
      reason: req.body.reason,
      details: req.body.details ?? "",
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw conflict("You already reported this post");
    }
    throw err;
  }
  res.status(201).json({ ok: true });
}

export async function createCommentReport(req: Request, res: Response) {
  const post = idParam(req, "id");
  const commentId = idParam(req, "commentId");
  await loadReadablePostAuthor(post, req.userId!);
  const comment = await Comment.findOne({ _id: commentId, post, ...visibleContent }).select("author content post").lean();
  if (!comment) throw notFound("Comment not found");
  if (String(comment.author) === req.userId) throw badRequest("You can't report your own comment");
  try {
    await CommentReport.create({ reporter: req.userId, post, comment: commentId, reason: req.body.reason, details: req.body.details ?? "", snapshot: { content: comment.content, author: comment.author, parent: comment.post } });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw conflict("You already reported this comment");
    throw err;
  }
  res.status(201).json({ ok: true });
}
