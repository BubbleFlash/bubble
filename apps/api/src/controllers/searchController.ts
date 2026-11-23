import { usableAccountFilter } from "../services/restrictions.js";
import mongoose from "mongoose";
import type { Request, Response } from "express";
import type { Page, PostDTO, UserSummaryDTO } from "@commune/shared";
import { SEARCH_PAGE_SIZE } from "@commune/shared";
import { Post } from "../models/Post.js";
import { Follow } from "../models/Follow.js";
import { User } from "../models/User.js";
import { isPlusActive } from "../utils/plan.js";
import { escapeRegex } from "../utils/regex.js";
import type { PopulatedPost } from "../utils/serializers.js";
import { AUTHOR_FIELDS, COMMUNITY_FIELDS, readablePostFilter } from "../services/postAccess.js";
import { presentPosts } from "./postController.js";
import { badRequest } from "../utils/errors.js";
import { onlineUsers, onlineUserSnapshot } from "../services/realtime.js";
import { PeopleSearchSnapshot } from "../models/PeopleSearchSnapshot.js";

interface SearchQuery {
  q: string;
  page: number;
}

const readQuery = (res: Response) => (res.locals as { query: SearchQuery }).query;

/** Fetches one extra row to learn whether another page exists. */
function paginate<T>(rows: T[], page: number) {
  const hasMore = rows.length > SEARCH_PAGE_SIZE;
  return {
    items: hasMore ? rows.slice(0, SEARCH_PAGE_SIZE) : rows,
    nextCursor: hasMore ? String(page + 1) : null,
  };
}

/** People whose display name or username starts with the text (case-insensitive). Suspended accounts are hidden. */
export async function users(_req: Request, res: Response) {
  const { q, page } = readQuery(res);
  const prefix = { $regex: `^${escapeRegex(q)}`, $options: "i" };
  const rows = await User.find({
    $or: [{ displayName: prefix }, { username: prefix }],
    ...usableAccountFilter(),
  })
    .sort({ username: 1 })
    .skip((page - 1) * SEARCH_PAGE_SIZE)
    .limit(SEARCH_PAGE_SIZE + 1)
    .select("username displayName bio avatarUrl avatarFrame plusUntil")
    .lean();

  const { items, nextCursor } = paginate(rows, page);
  const online = await onlineUsers(items.map((user) => String(user._id)));
  const body: Page<UserSummaryDTO> = {
    items: items.map((u) => ({
      id: u._id.toString(),
      online: online.has(String(u._id)),
      username: u.username,
      displayName: u.displayName ?? undefined,
      bio: u.bio ?? "",
      avatarUrl: u.avatarUrl ?? null,
      avatarFrame: u.avatarFrame ?? undefined,
      plus: isPlusActive(u.plusUntil),
    })),
    nextCursor,
  };
  res.json(body);
}

/** Browse all available profiles, with an optional name prefix and stable cursor. */
export async function people(req: Request, res: Response) {
  const { q, cursor, limit } = res.locals.query as { q: string; cursor?: string; limit: number };
  const match = cursor && /^([a-f0-9]{24})\|([01])\|([a-f0-9]{24})$/i.exec(cursor);
  if (cursor && !match) throw badRequest("Invalid cursor");
  const snapshot = match
    ? await PeopleSearchSnapshot.findOne({ _id: match[1], user: req.userId, query: q, expiresAt: { $gt: new Date() } }).lean()
    : await PeopleSearchSnapshot.create({ user: req.userId, query: q, online: await onlineUserSnapshot(), expiresAt: new Date(Date.now() + 30 * 60_000) });
  if (!snapshot) throw badRequest("Search expired. Refresh the page.");
  const phase = match?.[2] === "1" ? 1 : 0;
  const boundary = match?.[3];
  const prefix = { $regex: `^${escapeRegex(q)}`, $options: "i" };
  const filter = {
    ...usableAccountFilter(),
    ...(q ? { $or: [{ displayName: prefix }, { username: prefix }] } : {}),
  };
  const select = "username displayName bio avatarUrl avatarFrame plusUntil";
  const fetchPhase = (current: number, before: string | undefined, count: number) => User.find({ ...filter,
    _id: { [current === 0 ? "$in" : "$nin"]: snapshot.online, ...(before ? { $lt: new mongoose.Types.ObjectId(before) } : {}) },
  }).sort({ _id: -1 }).limit(count).select(select).lean();
  const first = await fetchPhase(phase, boundary, limit + 1);
  const rest = phase === 0 && first.length <= limit ? await fetchPhase(1, undefined, limit + 1 - first.length) : [];
  const rows = [...first, ...rest];
  const items = rows.slice(0, limit);
  const ids = items.map((user) => user._id);
  const [online, outgoing, incoming] = await Promise.all([
    onlineUsers(ids.map(String)),
    Follow.find({ follower: req.userId, following: { $in: ids } }).select("following").lean(),
    Follow.find({ following: req.userId, follower: { $in: ids }, requestDeclined: { $ne: true } }).select("follower").lean(),
  ]);
  const followed = new Set(outgoing.map((follow) => String(follow.following)));
  const followers = new Set(incoming.map((follow) => String(follow.follower)));
  const body: Page<UserSummaryDTO> = {
    items: items.map((u) => ({ id: u._id.toString(), online: online.has(String(u._id)), username: u.username,
      displayName: u.displayName ?? undefined, bio: u.bio ?? "", avatarUrl: u.avatarUrl ?? null,
      avatarFrame: u.avatarFrame ?? undefined, plus: isPlusActive(u.plusUntil),
      followedByMe: followed.has(String(u._id)), followsMe: followers.has(String(u._id)) })),
    nextCursor: rows.length > limit ? `${snapshot._id}|${phase === 1 || items.length > first.length ? 1 : 0}|${items[items.length - 1]!._id}` : null,
  };
  res.json(body);
}

/** Posts matching the words, best match first. Only free text is searched, never paid content. */
export async function posts(req: Request, res: Response) {
  const { q, page } = readQuery(res);
  const rows = (await Post.find({ $text: { $search: q }, ...await readablePostFilter(req.userId) }, { score: { $meta: "textScore" } })
    .sort({ score: { $meta: "textScore" } })
    .skip((page - 1) * SEARCH_PAGE_SIZE)
    .limit(SEARCH_PAGE_SIZE + 1)
    .populate("author", AUTHOR_FIELDS)
    .populate("community", COMMUNITY_FIELDS)
    .lean()) as unknown as PopulatedPost[];

  const { items, nextCursor } = paginate(rows, page);
  const body: Page<PostDTO> = { items: await presentPosts(req.userId!, items), nextCursor };
  res.json(body);
}
