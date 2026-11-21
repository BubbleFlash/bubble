import type { Request, Response } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { Comment } from "../models/Comment.js";
import { Post } from "../models/Post.js";
import { Report } from "../models/Report.js";
import { CommentReport as CommentReportModel, commentReportTarget } from "../models/CommentReport.js";
import { Wallpaper, WallpaperReport } from "../models/Wallpaper.js";
import { User } from "../models/User.js";
import { moderationEvent } from "../models/moderationFields.js";
import { badRequest, conflict, forbidden, notFound } from "../utils/errors.js";
import { accountRestriction, publishingRestriction } from "../services/restrictions.js";
import { changeContent } from "../services/moderationService.js";
import { disconnectUser } from "../services/realtime.js";
import { loadPostMusic } from "../services/postMusic.js";
import { getObject } from "../services/storageService.js";
import { Readable } from "node:stream";
import { uploadUrlSchema } from "@commune/shared";

const CommentReport = CommentReportModel as unknown as typeof Report;
const reason = z.string().trim().min(1).max(500);
const kind = z.enum(["post", "comment", "wallpaper"]);
const state = z.enum(["published", "hidden", "removed"]);
const measure = z.enum([
  "warning",
  "publishing",
  "temporary",
  "permanent",
  "liftPublishing",
  "liftAccount",
]);
const cursor = z
  .string()
  .regex(/^[a-f0-9]{24}$/i)
  .optional();

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw badRequest("Invalid input");
  return result.data;
}

function id(value: unknown) {
  return new Types.ObjectId(parse(cursor.unwrap(), value));
}

function actor(req: Request) {
  return { id: req.userId!, role: req.userRole! };
}

export async function listContent(req: Request, res: Response) {
  const query = parse(
    z.object({ kind: z.enum(["all", "post", "comment", "wallpaper"]).default("all"), cursor: z.string().regex(/^\d{1,16}_[a-f0-9]{24}_(post|comment|wallpaper)$/i).optional(), target: cursor }),
    req.query,
  );
  const filter = {
    ...(!query.target && { moderationState: { $in: ["hidden", "removed", "withdrawn"] } }),
    ...(query.target && { _id: id(query.target) }),
  };
  const marker = query.cursor?.split("_");
  const markerTime = marker ? new Date(Number(marker[0])) : undefined;
  if (markerTime && Number.isNaN(markerTime.getTime())) throw badRequest("Invalid cursor");
  async function sortedContent(model: typeof Post | typeof Comment | typeof Wallpaper, type: "post" | "comment" | "wallpaper") {
    const rows = await model.aggregate([
      { $match: filter },
      { $addFields: { moderationOrder: { $ifNull: [
        { $max: { $map: { input: { $filter: { input: { $ifNull: ["$moderationEvents", []] }, as: "event", cond: { $in: ["$$event.action", ["hidden", "removed", "withdrawn"]] } } }, as: "event", in: "$$event.time" } } },
        { $ifNull: ["$purgedAt", "$createdAt"] },
      ] } } },
      ...(markerTime ? [{ $match: { $or: [
        { moderationOrder: { $lt: markerTime } },
        { moderationOrder: markerTime, _id: { $lt: id(marker![1]) } },
        ...(type < marker![2]! ? [{ moderationOrder: markerTime, _id: id(marker![1]) }] : []),
      ] } }] : []),
      { $sort: { moderationOrder: -1, _id: -1 } },
      { $limit: 31 },
      { $project: { content: 1, moderationState: 1, purgedAt: 1, deletionPending: 1, author: 1, createdAt: 1, imageUrl: 1, imageUrls: 1, musicTrackIds: 1, post: 1, name: 1, moderationOrder: 1 } },
    ]);
    await model.populate(rows, { path: "author", select: "username displayName avatarUrl avatarFrame" });
    return rows.map((row) => ({ ...row, ...(type === "wallpaper" && row.purgedAt ? { imageUrl: undefined } : {}), kind: type }));
  }
  const groups = await Promise.all([
    (query.kind === "all" || query.kind === "post")
      ? sortedContent(Post, "post")
      : [],
    (query.kind === "all" || query.kind === "comment")
      ? sortedContent(Comment, "comment")
      : [],
    (query.kind === "all" || query.kind === "wallpaper")
      ? sortedContent(Wallpaper, "wallpaper")
      : [],
  ]);
  const rows = groups.flat().sort((a, b) => b.moderationOrder.getTime() - a.moderationOrder.getTime() || String(b._id).localeCompare(String(a._id)) || b.kind.localeCompare(a.kind));
  const items = rows.slice(0, 30);
  const music = await loadPostMusic(items.filter((row) => row.kind === "post"));
  res.json({
    items: items.map((row) => ({ ...row, musicAttachments: music.get(String(row._id)) ?? [] })),
    nextCursor: rows.length > 30 ? `${rows[29]!.moderationOrder.getTime()}_${rows[29]!._id}_${rows[29]!.kind}` : null,
  });
}

export async function contentImage(req: Request, res: Response) {
  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0 || index > 9) throw notFound("Image not found");
  const targetKind = parse(z.enum(["post", "wallpaper"]), req.params.kind);
  const post = targetKind === "post"
    ? await Post.findById(id(req.params.id)).select("imageUrl imageUrls").lean()
    : await Wallpaper.findById(id(req.params.id)).select("imageUrl").lean();
  if (!post) throw notFound("Post not found");
  const images = "imageUrls" in post && post.imageUrls?.length ? post.imageUrls : post.imageUrl ? [post.imageUrl] : [];
  const image = images[index];
  if (!image || !uploadUrlSchema.safeParse(image).success) throw notFound("Image not found");
  let object;
  try {
    object = await getObject("uploads/" + image.split("/").pop());
  } catch (error) {
    if (error instanceof Error && ["NoSuchKey", "NotFound"].includes(error.name)) throw notFound("Image not found");
    throw error;
  }
  if (!object.Body) throw notFound("Image not found");
  res.set("Cache-Control", "private, no-store");
  if (object.ContentType) res.type(object.ContentType);
  Readable.fromWeb(object.Body.transformToWebStream() as unknown as import("node:stream/web").ReadableStream).pipe(res);
}

export async function moderateContent(req: Request, res: Response) {
  const input = parse(z.object({ state, reason, reportId: cursor }), req.body);
  const targetKind = parse(kind, req.params.kind);
  const targetId = id(req.params.id);
  if (input.reportId) {
    const model: typeof Report = targetKind === "post" ? Report : targetKind === "comment" ? CommentReport : WallpaperReport as unknown as typeof Report;
    if (!(await model.exists({ _id: id(input.reportId), ...(targetKind === "wallpaper" ? { wallpaper: targetId } : targetKind === "comment" ? commentReportTarget(targetId) : { post: targetId }) })))
      throw notFound("Report not found");
  }
  await changeContent(
    targetKind,
    String(targetId),
    input.state,
    actor(req),
    input.reason,
    input.reportId,
  );
  res.status(204).end();
}

export async function listReports(req: Request, res: Response) {
  const query = parse(
    z.object({
      kind: z.enum(["all", "post", "comment", "wallpaper"]).default("all"),
      status: z.enum(["all", "open", "resolved", "dismissed"]).default("open"),
      report: cursor,
      cursor,
    }),
    req.query,
  );
  const kinds = query.kind === "all" ? (["post", "comment", "wallpaper"] as const) : [query.kind];
  await Promise.all(
    kinds
      .map(async (reportKind) => {
        const reports: typeof Report = reportKind === "post" ? Report : reportKind === "comment" ? CommentReport : WallpaperReport as unknown as typeof Report;
        const targets = reportKind === "post" ? Post : reportKind === "comment" ? Comment : Wallpaper;
        const pending = await reports.aggregate([
          { $match: { status: reportKind === "wallpaper" ? { $in: ["open", null] } : "open" } },
          ...(reportKind === "comment" ? [{ $set: { comment: { $ifNull: ["$comment", "$post"] } } }] : []),
          {
            $lookup: {
              from: targets.collection.name,
              localField: reportKind === "wallpaper" ? "wallpaper" : reportKind === "comment" ? "comment" : "post",
              foreignField: "_id",
              as: "target",
            },
          },
          { $unwind: "$target" },
          { $match: { "target.moderationState": { $in: ["hidden", "removed", "withdrawn"] } } },
          { $project: { event: { $arrayElemAt: ["$target.moderationEvents", -1] } } },
        ]);
        for (const entry of pending) {
          const event = entry.event;
          await reports.updateOne(
            { _id: entry._id, status: reportKind === "wallpaper" ? { $in: ["open", null] } : "open" },
            {
              $set: {
                status: "resolved",
                resolvedAt: event?.time ?? new Date(),
                ...(Types.ObjectId.isValid(event?.actor) && { resolvedBy: event.actor }),
                decision: event?.reason ?? "Материал был скрыт или удалён",
              },
            },
          );
        }
      }),
  );
  const groups = await Promise.all(
    kinds.map(async (reportKind) => {
      const model: typeof Report =
        reportKind === "post"
          ? Report
          : reportKind === "comment"
            ? CommentReport
            : (WallpaperReport as unknown as typeof Report);
      const statusFilter =
        reportKind === "wallpaper" && query.status === "open"
          ? { $in: ["open", null] }
          : query.status;
      const rows = await model
        .find({
          ...(query.status !== "all" && { status: statusFilter }),
          ...(query.report ? { _id: id(query.report) } : query.cursor && { _id: { $lt: id(query.cursor) } }),
        })
        .select("-moderationEvents")
        .sort({ _id: -1 })
        .limit(31)
        .populate("reporter", "username displayName avatarUrl avatarFrame")
        .lean();
      const items = await Promise.all(
        rows.map(async (row) => {
          const wallpaperId = (row as typeof row & { wallpaper?: Types.ObjectId }).wallpaper;
          const commentId = (row as typeof row & { comment?: Types.ObjectId }).comment ?? row.post;
          const target =
            reportKind === "post"
              ? await Post.findById(row.post)
                  .select("author content imageUrl imageUrls createdAt moderationState purgedAt deletionPending")
                  .lean()
              : reportKind === "comment"
                ? await Comment.findById(commentId)
                    .select("author content post createdAt moderationState purgedAt deletionPending")
                    .lean()
                : await Wallpaper.findById(wallpaperId)
                    .select("author name imageUrl createdAt moderationState purgedAt deletionPending")
                    .lean();
          const authorId = target?.author ?? row.snapshot?.author;
          const author =
            authorId &&
            (await User.findById(authorId)
              .select("username displayName role avatarUrl avatarFrame")
              .lean());
          return {
            ...row,
            post: reportKind === "wallpaper" ? wallpaperId : reportKind === "comment" ? commentId : row.post,
            kind: reportKind,
            target: reportKind === "wallpaper" && target && "purgedAt" in target && target.purgedAt ? { ...target, imageUrl: undefined } : target,
            author,
          };
        }),
      );
      return items;
    }),
  );
  const merged = groups.flat().sort((a, b) => String(b._id).localeCompare(String(a._id)));
  res.json({
    items: merged.slice(0, 30),
    nextCursor: merged.length > 30 ? String(merged[29]!._id) : null,
  });
}

export async function decideReport(req: Request, res: Response) {
  const reportKind = parse(z.enum(["post", "comment", "wallpaper"]), req.params.kind);
  const model: typeof Report =
    reportKind === "post"
      ? Report
      : reportKind === "comment"
        ? CommentReport
        : (WallpaperReport as unknown as typeof Report);
  const input = parse(z.object({ status: z.enum(["resolved", "dismissed"]), reason }), req.body);
  const who = actor(req);
  const report = await model.updateOne(
    {
      _id: id(req.params.id),
      status: reportKind === "wallpaper" ? { $in: ["open", null] } : "open",
    },
    {
      $set: {
        status: input.status,
        resolvedBy: who.id,
        resolvedAt: new Date(),
        decision: input.reason,
      },
      $push: { moderationEvents: moderationEvent(who.id, who.role, input.status, input.reason) },
    },
  );
  if (!report.matchedCount) throw conflict("Report has already been decided");
  res.status(204).end();
}

export async function listUsers(req: Request, res: Response) {
  const query = parse(z.object({ q: z.string().trim().max(75).default(""), cursor }), req.query);
  const search = query.q.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");
  const users = await User.find({
    ...(search && {
      $or: [
        { username: { $regex: search, $options: "i" } },
        { displayName: { $regex: search, $options: "i" } },
      ],
    }),
    ...(query.cursor && { _id: { $lt: id(query.cursor) } }),
  })
    .select(
      "username displayName role avatarUrl avatarFrame banned accountRestriction publishingRestriction",
    )
    .sort({ _id: -1 })
    .limit(31)
    .lean();
  res.json({
    items: users.slice(0, 30).map((user) => ({
      _id: user._id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      avatarFrame: user.avatarFrame,
      role: user.role,
      accountRestriction: accountRestriction(user),
      publishingRestriction: publishingRestriction(user),
    })),
    nextCursor: users.length > 30 ? String(users[29]!._id) : null,
  });
}

export async function getUser(req: Request, res: Response) {
  const user = await User.findById(id(req.params.id))
    .select(
      "username displayName role avatarUrl avatarFrame banned accountRestriction publishingRestriction moderationEvents",
    )
    .lean();
  if (!user) throw notFound("User not found");
  res.json({
    _id: user._id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    avatarFrame: user.avatarFrame,
    role: user.role,
    accountRestriction: accountRestriction(user),
    publishingRestriction: publishingRestriction(user),
    warnings: activeWarnings(user.moderationEvents ?? []).map(({ _id, reason, time }) => ({ _id, reason, time })),
  });
}

function activeWarnings(events: Array<{ _id: Types.ObjectId; action: string; warningId?: string | null; reason: string; time: Date }>) {
  const removed = new Set(events.filter((event) => event.action === "liftWarning").map((event) => event.warningId));
  return events.filter((event) => event.action === "warning" && !removed.has(String(event._id)));
}

export async function liftWarning(req: Request, res: Response) {
  const input = parse(z.object({ reason }), req.body);
  const who = actor(req);
  const targetId = id(req.params.id);
  const warningId = id(req.params.warningId);
  const target = await User.findById(targetId).select("role").lean();
  if (!target) throw notFound("User not found");
  if (String(targetId) === who.id || target.role === "admin" ||
      (who.role === "moderator" && target.role === "moderator")) {
    throw forbidden("Cannot moderate this account");
  }
  const result = await User.updateOne({
    _id: targetId, role: target.role,
    moderationEvents: { $elemMatch: { _id: warningId, action: "warning" } },
    $nor: [{ moderationEvents: { $elemMatch: { action: "liftWarning", warningId: String(warningId) } } }],
  }, {
    $inc: { moderationRevision: 1 },
    $push: { moderationEvents: moderationEvent(who.id, who.role, "liftWarning", input.reason, { warningId: String(warningId) }) },
  });
  if (!result.matchedCount) throw conflict("Warning was already removed or account changed");
  res.status(204).end();
}

export async function applyMeasure(req: Request, res: Response) {
  const input = parse(
    z.object({ action: measure, reason, minutes: z.number().int().min(1).max(525600).optional() }),
    req.body,
  );
  const who = actor(req);
  const targetId = id(req.params.id);
  const target = await User.findById(targetId)
    .select("role banned accountRestriction publishingRestriction moderationRevision")
    .lean();
  if (!target) throw notFound("User not found");
  if (
    String(targetId) === who.id ||
    target.role === "admin" ||
    (who.role === "moderator" && target.role === "moderator")
  ) {
    throw forbidden("Cannot moderate this account");
  }
  const existing = accountRestriction(target);
  const permanent = Boolean(existing && !existing.until);
  if (
    who.role !== "admin" &&
    (input.action === "permanent" ||
      (permanent && ["liftAccount", "temporary"].includes(input.action)))
  ) {
    throw forbidden("Admins only");
  }
  const timed = input.action === "temporary" || input.action === "publishing";
  if (timed && !input.minutes) throw badRequest("Duration is required");
  const until = timed ? new Date(Date.now() + input.minutes! * 60000) : undefined;
  const restriction = { reason: input.reason, until: until ?? null };
  const sets: Record<string, unknown> = {};
  const clears: Record<string, 1> = {};
  const accountBan = input.action === "temporary" || input.action === "permanent";
  if (accountBan) {
    sets.accountRestriction = restriction;
    sets.banned = false;
  } else if (input.action === "publishing") sets.publishingRestriction = restriction;
  else if (input.action === "liftAccount") {
    if (!existing) throw conflict("No active account restriction");
    sets.banned = false;
    clears.accountRestriction = 1;
  } else if (input.action === "liftPublishing") {
    if (!publishingRestriction(target)) throw conflict("No active publishing restriction");
    clears.publishingRestriction = 1;
  }
  const updated = await User.updateOne(
    {
      _id: targetId,
      role: target.role,
      moderationRevision: target.moderationRevision ?? { $in: [null, 0] },
    },
    {
      $set: sets,
      $unset: clears,
      $inc: { moderationRevision: 1, ...(accountBan && { sessionVersion: 1 }) },
      $push: {
        moderationEvents: moderationEvent(who.id, who.role, input.action, input.reason, { until }),
      },
    },
  );
  if (!updated.matchedCount) throw conflict("Account changed. Refresh and try again.");
  if (accountBan) await disconnectUser(String(targetId));
  res.status(204).end();
}

export async function changeRole(req: Request, res: Response) {
  const input = parse(z.object({ role: z.enum(["user", "moderator"]), reason }), req.body);
  const opposite = input.role === "user" ? "moderator" : "user";
  const who = actor(req);
  const result = await User.updateOne(
    { _id: id(req.params.id), role: opposite },
    {
      $set: { role: input.role },
      $inc: { moderationRevision: 1 },
      $push: {
        moderationEvents: moderationEvent(who.id, who.role, "role:" + input.role, input.reason),
      },
    },
  );
  if (!result.matchedCount) throw conflict("Account role changed or cannot be edited");
  res.status(204).end();
}

export async function history(req: Request, res: Response) {
  const query = parse(
    z.object({
      user: cursor,
      target: cursor,
      cursor,
      actor: z.string().trim().max(32).optional(),
      action: z.string().max(32).optional(),
      from: z.iso.datetime().optional(),
      to: z.iso.datetime().optional(),
    }),
    req.query,
  );
  const actor =
    query.actor &&
    (await User.findOne({ username: query.actor.replace(/^@/, "") })
      .collation({ locale: "en", strength: 2 })
      .select("_id")
      .lean());
  if (query.actor && !actor) return res.json({ items: [], nextCursor: null });
  const target = query.user ?? query.target;
  const sources = query.user
    ? ([["user", User]] as const)
    : ([
        ["user", User],
        ["post", Post],
        ["comment", Comment],
        ["wallpaper", Wallpaper],
        ["postReport", Report],
        ["commentReport", CommentReport],
        ["wallpaperReport", WallpaperReport],
      ] as const);
  const groups = await Promise.all(
    sources.map(async ([kind, model]) => {
      const rows = await model.aggregate([
        {
          $match: target ? { _id: id(target) } : { "moderationEvents.0": { $exists: true } },
        },
        { $unwind: "$moderationEvents" },
        {
          $match: {
            ...(query.cursor && { "moderationEvents._id": { $lt: id(query.cursor) } }),
            ...(actor && { "moderationEvents.actor": String(actor._id) }),
            ...((query.action || req.userRole !== "admin") && {
              "moderationEvents.action": {
                ...(query.action && { $eq: query.action }),
                ...(req.userRole !== "admin" && { $not: /^role:/ }),
              },
            }),
            ...((query.from || query.to) && {
              "moderationEvents.time": {
                ...(query.from && { $gte: new Date(query.from) }),
                ...(query.to && { $lte: new Date(query.to) }),
              },
            }),
          },
        },
        { $sort: { "moderationEvents._id": -1 } },
        { $limit: 31 },
        { $project: { _id: 0, target: "$_id", event: "$moderationEvents" } },
      ]);
      return rows.map((row) => ({ ...row, kind }));
    }),
  );
  const rows = groups.flat().sort((a, b) => String(b.event._id).localeCompare(String(a.event._id)));
  const actors = await User.find({ _id: { $in: rows.slice(0, 30).map((row) => row.event.actor) } })
    .select("username")
    .lean();
  const usernames = new Map(actors.map((user) => [String(user._id), user.username]));
  res.json({
    items: rows.slice(0, 30).map((row) => ({ ...row, actorName: usernames.get(row.event.actor) })),
    nextCursor: rows.length > 30 ? String(rows[29].event._id) : null,
  });
}

export async function ownNotices(req: Request, res: Response) {
  const user = await User.findById(req.userId)
    .select("moderationEvents publishingRestriction")
    .lean();
  const warnings = activeWarnings(user?.moderationEvents ?? [])
    .slice(-10)
    .reverse()
    .map(({ _id, reason, time }) => ({ _id, reason, time }));
  res.json({ warnings, publishing: user ? publishingRestriction(user) : null });
}
