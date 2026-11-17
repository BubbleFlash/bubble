import { Comment } from "../models/Comment.js";
import { CommentLike } from "../models/CommentLike.js";
import { CommentReport, commentReportsForPost, commentReportTarget } from "../models/CommentReport.js";
import { Like } from "../models/Like.js";
import { Notification } from "../models/Notification.js";
import { Post } from "../models/Post.js";
import { moderationEvent } from "../models/moderationFields.js";
import { conflict } from "../utils/errors.js";
import { Report } from "../models/Report.js";
import { Wallpaper, WallpaperReaction, WallpaperReport } from "../models/Wallpaper.js";
import { User } from "../models/User.js";
import { disconnectUser } from "./realtime.js";
import { deleteUploadIfUnused } from "./uploadService.js";

/**
 * Deletes a post and everything attached to it (comments, likes, notifications, image).
 * Open reports about the post are marked resolved so they leave the admin queue.
 * Preserve audit records if an author later withdraws a post or its discussion.
 */
export async function removePost(postId: string, resolvedBy?: string): Promise<void> {
  const post = await Post.findById(postId).select("imageUrl imageUrls");
  if (!post) return;
  const comments = await Comment.find({ post: postId }).select("_id").lean();

  const deleted = await Post.deleteOne({ _id: postId, "moderationEvents.0": { $exists: false } });
  if (!deleted.deletedCount) {
    await Post.updateOne(
      { _id: postId },
      {
        $set: {
          moderationState: "withdrawn",
          content: "",
          imageUrl: null,
          imageUrls: [],
          musicTrackIds: [],
        },
        $unset: { repost: 1, premiumContent: 1 },
      },
    );
  }
  await Promise.all([
    Comment.deleteMany({ post: postId, "moderationEvents.0": { $exists: false } }),
    Comment.updateMany(
      { post: postId, "moderationEvents.0": { $exists: true } },
      { $set: { moderationState: "withdrawn", content: "" } },
    ),
    CommentLike.deleteMany({ post: postId }),
    CommentReport.updateMany({ ...commentReportsForPost(postId, comments.map(({ _id }) => _id)), status: "open" }, { $set: { status: "resolved", resolvedAt: new Date(), resolvedBy: resolvedBy ?? null } }),
    Like.deleteMany({ post: postId }),
    Notification.deleteMany({ post: postId }),
    Report.updateMany(
      { post: postId, status: "open" },
      { $set: { status: "resolved", resolvedAt: new Date(), resolvedBy: resolvedBy ?? null } },
    ),
  ]);
  await Promise.all(
    [...new Set([post.imageUrl, ...(post.imageUrls ?? [])])].map((url) => deleteUploadIfUnused(url)),
  );
}

export async function changeContent(
  kind: "post" | "comment" | "wallpaper",
  target: string,
  next: "published" | "hidden" | "removed",
  who: { id: string; role: string },
  why: string,
  reportId?: string,
) {
  if (next === "removed") {
    await permanentlyRemoveContent(kind, target, who, why, reportId);
    return;
  }
  const event = moderationEvent(who.id, who.role, next, why, { reportId });
  const previous =
    next === "published"
      ? { $in: ["hidden"] }
      : next === "hidden"
        ? { $nin: ["hidden", "removed", "withdrawn"] }
        : { $nin: ["removed", "withdrawn"] };
  const query = { _id: target, moderationState: previous };
  const update = { $set: { moderationState: next }, $push: { moderationEvents: event } };
  const changed = await (kind === "post"
    ? Post.updateOne(query, update)
    : kind === "comment" ? Comment.updateOne(query, update) : Wallpaper.updateOne(query, update));
  if (!changed.matchedCount) {
    const retryQuery = {
        _id: target,
        moderationState: next,
        "moderationEvents.reportId": reportId,
    };
    const retry = reportId && await (kind === "post" ? Post.exists(retryQuery) : kind === "comment" ? Comment.exists(retryQuery) : Wallpaper.exists(retryQuery));
    if (!retry) throw conflict("Content is missing or its state changed");
  }
  if (next !== "published") {
    const reports: typeof Report = kind === "post" ? Report : kind === "comment" ? CommentReport as unknown as typeof Report : WallpaperReport as unknown as typeof Report;
    const reportTarget = kind === "wallpaper" ? { wallpaper: target } : kind === "comment" ? commentReportTarget(target) : { post: target };
    const reportFilter = { ...reportTarget, status: kind === "wallpaper" ? { $in: ["open", null] } : "open" };
    const open = await reports.find(reportFilter).select("_id").lean();
    for (const report of open) {
      await reports.updateOne(
        { _id: report._id, status: kind === "wallpaper" ? { $in: ["open", null] } : "open" },
        {
          $set: { status: "resolved", resolvedBy: who.id, resolvedAt: new Date(), decision: why },
          $push: {
            moderationEvents: moderationEvent(who.id, who.role, "resolved", why, {
              reportId: String(report._id),
            }),
          },
        },
      );
    }
  }
}

async function permanentlyRemoveContent(
  kind: "post" | "comment" | "wallpaper",
  target: string,
  who: { id: string; role: string },
  why: string,
  reportId?: string,
) {
  const existing = kind === "post" ? await Post.findById(target).lean()
    : kind === "comment" ? await Comment.findById(target).lean() : await Wallpaper.findById(target).lean();
  if (!existing || existing.moderationState === "withdrawn") throw conflict("Content is missing or already deleted");
  const images = existing.purgedAt ? existing.deletionPendingImages ?? []
    : "imageUrl" in existing ? [existing.imageUrl, ...("imageUrls" in existing ? existing.imageUrls ?? [] : [])].filter((value): value is string => Boolean(value))
    : [];
  const event = moderationEvent(who.id, who.role, "removed", why, { reportId });
  const filter = { _id: target, moderationState: { $ne: "withdrawn" }, purgedAt: { $exists: false } };
  const update = {
    $set: {
      moderationState: "removed", purgedAt: new Date(), deletionPending: true, deletionPendingImages: images,
      ...(kind === "wallpaper" && { imageUrl: "deleted:" + target }),
    },
    $unset: kind === "post"
      ? { content: 1, imageUrl: 1, imageUrls: 1, musicTrackIds: 1, repost: 1, premiumContent: 1 }
      : kind === "comment" ? { content: 1 } : { name: 1 },
    $push: { moderationEvents: event },
  };
  const previous = kind === "post"
    ? await Post.findOneAndUpdate(filter, update).lean()
    : kind === "comment" ? await Comment.findOneAndUpdate(filter, update).lean()
    : await Wallpaper.findOneAndUpdate(filter, update).lean();
  if (!previous && !existing.purgedAt) throw conflict("Content is missing or already deleted");
  const removed = previous ?? existing;

  const reports: typeof Report = kind === "post" ? Report : kind === "comment" ? CommentReport as unknown as typeof Report : WallpaperReport as unknown as typeof Report;
  const reportFilter = kind === "wallpaper" ? { wallpaper: target } : kind === "comment" ? commentReportTarget(target) : { post: target };
  const openStatus = kind === "wallpaper" ? { $in: ["open", null] } : "open";
  const open = await reports.find({ ...reportFilter, status: openStatus }).select("_id").lean();
  for (const report of open) {
    await reports.updateOne({ _id: report._id, status: openStatus }, {
      $set: { status: "resolved", resolvedBy: who.id, resolvedAt: new Date(), decision: why },
      $push: { moderationEvents: moderationEvent(who.id, who.role, "resolved", why, { reportId: String(report._id) }) },
    });
  }
  if (kind !== "wallpaper") await reports.updateMany(reportFilter, { $unset: { "snapshot.content": 1 } });
  if (kind === "post") {
    const comments = await Comment.find({ post: target }).select("_id").lean();
    const commentReports = commentReportsForPost(target, comments.map(({ _id }) => _id));
    await CommentReport.updateMany(commentReports, { $unset: { "snapshot.content": 1 } });
    await CommentReport.updateMany({ ...commentReports, status: "open" }, {
      $set: { status: "resolved", resolvedBy: who.id, resolvedAt: new Date(), decision: why },
    });
    await Comment.deleteMany({ post: target, "moderationEvents.0": { $exists: false } });
    await Comment.updateMany({ post: target }, { $set: { moderationState: "withdrawn" }, $unset: { content: 1 } });
    await Promise.all([Like.deleteMany({ post: target }), CommentLike.deleteMany({ post: target }), Notification.deleteMany({ post: target })]);
  }
  if (kind === "comment" && previous && "post" in previous) {
    await Post.updateOne({ _id: previous.post, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1 } });
  }
  if (kind === "wallpaper") {
    await WallpaperReaction.deleteMany({ wallpaper: target });
  }
  if (kind === "wallpaper" && images.length) {
    await User.updateMany({ "appearance.backgroundUrl": { $in: images } }, { $unset: { "appearance.backgroundUrl": 1 } });
  }
  await Promise.all([...new Set(images)].map((url) => deleteUploadIfUnused(url, true)));
  const finished = { $unset: { deletionPending: 1, deletionPendingImages: 1 } };
  if (kind === "post") await Post.updateOne({ _id: target, purgedAt: removed.purgedAt ?? { $exists: true } }, finished);
  else if (kind === "comment") await Comment.updateOne({ _id: target }, finished);
  else await Wallpaper.updateOne({ _id: target }, finished);
}

export async function banUser(userId: string, options: { removePosts: boolean; adminId: string }) {
  const who = { id: options.adminId, role: "admin" };
  const reason = "Блокировка через профиль или жалобу";
  const updated = await User.updateOne(
    { _id: userId, role: { $ne: "admin" } },
    {
      $set: { banned: false, accountRestriction: { reason, until: null } },
      $inc: { sessionVersion: 1, moderationRevision: 1 },
      $push: { moderationEvents: moderationEvent(who.id, who.role, "permanent", reason) },
    },
  );
  if (!updated.matchedCount) throw conflict("Account changed. Refresh and try again.");
  await disconnectUser(userId);
  if (!options.removePosts) return;
  const posts = await Post.find({
    author: userId,
    moderationState: { $nin: ["removed", "withdrawn"] },
  })
    .select("_id")
    .lean();
  for (const post of posts) {
    await changeContent("post", String(post._id), "removed", who, reason);
  }
}

export async function unbanUser(userId: string, adminId: string) {
  await User.updateOne(
    { _id: userId, role: { $ne: "admin" } },
    {
      $set: { banned: false },
      $unset: { accountRestriction: 1 },
      $inc: { moderationRevision: 1 },
      $push: {
        moderationEvents: moderationEvent(
          adminId,
          "admin",
          "liftAccount",
          "Разблокировка через профиль",
        ),
      },
    },
  );
}
