import mongoose from "mongoose";
import type { Request, Response } from "express";
import type { Page, ReportDTO, ReportStatus } from "@commune/shared";
import { Post } from "../models/Post.js";
import { Report } from "../models/Report.js";
import { CommentReport } from "../models/CommentReport.js";
import { User } from "../models/User.js";
import { moderationEvent } from "../models/moderationFields.js";
import { banUser, changeContent, unbanUser } from "../services/moderationService.js";
import { badRequest, forbidden, notFound } from "../utils/errors.js";
import { idParam } from "../utils/params.js";
import { toReportDTO, type PopulatedReport } from "../utils/serializers.js";
import { findByUsername } from "./userController.js";

/** Admins cannot suspend themselves or other admins. */
async function assertCanBan(targetId: string, adminId: string) {
  if (targetId === adminId) throw badRequest("You can't suspend yourself");
  const target = await User.findById(targetId).select("role").lean();
  if (!target) throw notFound("User not found");
  if (target.role === "admin") throw forbidden("Admins can't be suspended");
}

export async function listReports(_req: Request, res: Response) {
  const { cursor, limit, status } = (
    res.locals as { query: { cursor?: string; limit: number; status: ReportStatus } }
  ).query;
  if (cursor && !mongoose.isValidObjectId(cursor)) throw badRequest("Invalid cursor");

  const filter = cursor ? { status, _id: { $lt: cursor } } : { status };
  const rows = (await Report.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate("reporter", "username displayName")
    .populate({
      path: "post",
      select: "content imageUrl author",
      populate: { path: "author", select: "username displayName avatarUrl avatarFrame" },
    })
    .lean()) as unknown as PopulatedReport[];

  const hasMore = rows.length > limit;
  const reports = hasMore ? rows.slice(0, limit) : rows;
  const body: Page<ReportDTO> = {
    items: reports.map(toReportDTO),
    nextCursor: hasMore ? (reports[reports.length - 1]?._id.toString() ?? null) : null,
  };
  res.json(body);
}

export async function dismissReport(req: Request, res: Response) {
  const updated = await Report.findOneAndUpdate(
    { _id: idParam(req, "id"), status: "open" },
    { $set: { status: "dismissed", resolvedBy: req.userId, resolvedAt: new Date() },
      $push: { moderationEvents: moderationEvent(req.userId!, "admin", "dismissed", "Отклонено через админку") } },
  );
  if (!updated) throw notFound("Open report not found");
  res.status(204).end();
}

export async function listCommentReports(_req: Request, res: Response) {
  const { cursor, limit, status } = res.locals.query as { cursor?: string; limit: number; status: ReportStatus };
  const rows = await CommentReport.find(cursor ? { status, _id: { $lt: cursor } } : { status })
    .sort({ _id: -1 }).limit(limit + 1)
    .populate("reporter", "username displayName")
    .populate({ path: "comment", select: "content author", populate: { path: "author", select: "username displayName" } })
    .lean();
  const page = rows.slice(0, limit);
  res.json({
    items: page.map((row) => {
      const reporter = row.reporter as unknown as { username: string; displayName?: string };
      const comment = row.comment as unknown as { _id: mongoose.Types.ObjectId; content: string; author: { username: string; displayName?: string } | null } | null;
      return { id: String(row._id), postId: String(row.post), reason: row.reason, details: row.details,
        reporter: { username: reporter.username, displayName: reporter.displayName },
        comment: comment && { id: String(comment._id), content: comment.content, author: comment.author },
        createdAt: row.createdAt.toISOString() };
    }),
    nextCursor: rows.length > limit ? String(page.at(-1)!._id) : null,
  });
}

export async function dismissCommentReport(req: Request, res: Response) {
  const updated = await CommentReport.findOneAndUpdate(
    { _id: idParam(req, "id"), status: "open" },
    { $set: { status: "dismissed", resolvedBy: req.userId, resolvedAt: new Date() } },
  );
  if (!updated) throw notFound("Open report not found");
  res.status(204).end();
}

/** Removes the reported post, and optionally suspends its author. */
export async function resolveReport(req: Request, res: Response) {
  const id = idParam(req, "id");
  const report = await Report.findOne({ _id: id, status: "open" }).select("post").lean();
  if (!report) throw notFound("Open report not found");

  const post = await Post.findById(report.post).select("author moderationState").lean();
  const alsoBan = req.body.action === "remove_post_and_ban";
  if (post && alsoBan) await assertCanBan(post.author.toString(), req.userId!);

  if (post && post.moderationState !== "removed" && post.moderationState !== "withdrawn") {
    await changeContent("post", String(report.post), "removed", { id: req.userId!, role: "admin" }, "Решение по жалобе", id);
  }
  if (post && alsoBan) await banUser(String(post.author), { removePosts: false, adminId: req.userId! });
  const open = Report.find({ post: report.post, status: "open" }).select("_id").lean().cursor();
  for await (const { _id } of open) {
    await Report.updateOne({ _id, status: "open" }, {
      $set: { status: "resolved", resolvedBy: req.userId, resolvedAt: new Date() },
      $push: { moderationEvents: moderationEvent(req.userId!, "admin", "resolved", "Решение по жалобе") },
    });
  }
  res.status(204).end();
}

export async function banUserByUsername(req: Request, res: Response) {
  const user = await findByUsername(req.params.username);
  await assertCanBan(user._id.toString(), req.userId!);
  await banUser(user._id.toString(), {
    removePosts: req.body.removePosts,
    adminId: req.userId!,
  });
  res.status(204).end();
}

export async function unbanUserByUsername(req: Request, res: Response) {
  const user = await findByUsername(req.params.username);
  await assertCanBan(user._id.toString(), req.userId!);
  await unbanUser(user._id.toString(), req.userId!);
  res.status(204).end();
}
