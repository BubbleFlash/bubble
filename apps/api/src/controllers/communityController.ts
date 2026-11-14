import type { Request, Response } from "express";
import { isObjectIdOrHexString, Types, type FilterQuery, type UpdateQuery } from "mongoose";
import { communitySlugSchema } from "@commune/shared";
import type { CommunityMemberDTO, CommunityPermissions, CommunityRole, Page } from "@commune/shared";
import { Community } from "../models/Community.js";
import { User } from "../models/User.js";
import { isPlusActive } from "../utils/plan.js";
import { Membership } from "../models/Membership.js";
import { env } from "../config/env.js";
import { badRequest, conflict, forbidden, notFound } from "../utils/errors.js";
import { escapeRegex } from "../utils/regex.js";
import { toCommunityDTO } from "../utils/serializers.js";
import { sendPostPage } from "./postController.js";
import { deleteUploadIfUnused } from "../services/uploadService.js";
import { communityMembership, communityPermissions, communityRole, meetsCommunityRole } from "../services/communityAccess.js";

const MAX_COMMUNITIES_FREE = 5;
const MAX_COMMUNITIES_PLUS = 20;
const LIST_LIMIT = 30;

async function findBySlug(raw: string | undefined) {
  const parsed = communitySlugSchema.safeParse(raw);
  if (!parsed.success) throw notFound("Community not found");
  const community = await Community.findOne({ slug: parsed.data }).lean();
  if (!community) throw notFound("Community not found");
  return community;
}

type CommunityRow = Awaited<ReturnType<typeof findBySlug>>;

function accessFilter(community: CommunityRow): FilterQuery<CommunityRow> {
  return {
    _id: community._id,
    creator: community.creator,
    accessVersion: community.accessVersion ?? { $exists: false },
  };
}

async function changeAccess(community: CommunityRow, update: UpdateQuery<CommunityRow>) {
  const result = await Community.updateOne(accessFilter(community), {
    ...update,
    $inc: { ...update.$inc, accessVersion: 1 },
  });
  if (!result.matchedCount) throw conflict("Community settings changed. Try again.");
}

async function requireCommunityRole(req: Request, minimum: CommunityRole) {
  const community = await findBySlug(req.params.slug);
  const { role } = await communityMembership(community, req.userId!);
  if (!meetsCommunityRole(role, minimum)) throw forbidden("Insufficient community permissions");
  return community;
}

const isDuplicate = (err: unknown) => (err as { code?: number }).code === 11000;

export async function create(req: Request, res: Response) {
  const { slug, name, description } = req.body as {
    slug: string;
    name: string;
    description: string;
  };

  // A cap keeps one account from claiming every good name.
  const [owned, owner] = await Promise.all([
    Community.countDocuments({ creator: req.userId }),
    User.findById(req.userId).select("plusUntil").lean(),
  ]);
  const cap = isPlusActive(owner?.plusUntil) ? MAX_COMMUNITIES_PLUS : MAX_COMMUNITIES_FREE;
  if (owned >= cap) {
    throw forbidden(
      cap === MAX_COMMUNITIES_FREE
        ? `You can create up to ${cap} communities. Commune Plus raises this to ${MAX_COMMUNITIES_PLUS}.`
        : `You can create up to ${cap} communities`,
    );
  }

  let community;
  try {
    // Ownership itself is the membership. Separate rows represent non-owners.
    community = await Community.create({
      slug,
      name,
      description,
      creator: req.userId,
      memberCount: 1,
    });
  } catch (err) {
    if (isDuplicate(err)) throw conflict("That community address is already taken");
    throw err;
  }
  res.status(201).json(toCommunityDTO(community, "owner"));
}

/** Most popular communities, optionally filtered by text, membership or posting access. */
export async function list(req: Request, res: Response) {
  const { q, mine, owned, publishable } = res.locals.query as {
    q?: string; mine?: "1"; owned?: "1"; publishable?: "1";
  };

  const memberships = await Membership.find({ user: req.userId }).select("community").lean();
  const membershipIds = new Map(memberships.map((m) => [String(m.community), m._id]));
  const filter: Record<string, unknown> = {};
  const conditions: Record<string, unknown>[] = [];
  if (owned) filter.creator = req.userId;
  if (mine || publishable) conditions.push({
    $or: [{ creator: req.userId }, { _id: { $in: memberships.map((m) => m.community) } }],
  });
  if (q) {
    const pattern = { $regex: escapeRegex(q), $options: "i" };
    conditions.push({ $or: [{ slug: pattern }, { name: pattern }] });
  }
  if (conditions.length === 1) Object.assign(filter, conditions[0]);
  if (conditions.length > 1) filter.$and = conditions;

  const rows = Community.find(filter).sort({ memberCount: -1, _id: -1 });
  const present = (row: CommunityRow) => toCommunityDTO(
    row, communityRole(row, req.userId!, membershipIds.get(String(row._id))),
  );
  if (!publishable) {
    res.json((await rows.limit(LIST_LIMIT).lean()).map(present));
    return;
  }

  // Filter by effective role before limiting the destinations offered for a repost.
  const items = [];
  for await (const row of rows.lean().cursor()) {
    const item = present(row);
    if (item.actions.publish) items.push(item);
    if (items.length === LIST_LIMIT) break;
  }
  res.json(items);
}

export async function get(req: Request, res: Response) {
  const community = await findBySlug(req.params.slug);
  const { role } = await communityMembership(community, req.userId!);
  res.json(toCommunityDTO(community, role));
}

export async function update(req: Request, res: Response) {
  const community = await findBySlug(req.params.slug);
  const { role } = await communityMembership(community, req.userId!);
  if (!meetsCommunityRole(role, communityPermissions(community).editAppearance)) {
    throw forbidden("You cannot edit this community's appearance");
  }
  const previous = await Community.findOneAndUpdate(
    accessFilter(community),
    { $set: req.body },
    { runValidators: true },
  ).lean();
  if (!previous) throw conflict("Community settings changed. Try again.");
  const updated = { ...previous, ...req.body };
  if (previous.avatarUrl !== updated.avatarUrl) await deleteUploadIfUnused(previous.avatarUrl);
  res.json(toCommunityDTO(updated, role));
}

export async function updatePermissions(req: Request, res: Response) {
  const community = await requireCommunityRole(req, "owner");
  const permissions = req.body as CommunityPermissions;
  await changeAccess(community, { $set: { permissions } });
  res.json(toCommunityDTO({ ...community, permissions }, "owner"));
}

export async function join(req: Request, res: Response) {
  const community = await findBySlug(req.params.slug);
  if (!community.creator.equals(req.userId)) {
    try {
      await Membership.create({ user: req.userId, community: community._id, role: "member" });
      await Community.updateOne({ _id: community._id }, { $inc: { memberCount: 1 } });
    } catch (err) {
      if (!isDuplicate(err)) throw err;
    }
  }
  res.status(204).end();
}

async function removeMembership(community: CommunityRow, userId: string, actorId: string) {
  if (community.creator.equals(userId)) throw badRequest("The community owner cannot be removed");
  const membership = await Membership.findOne({ user: userId, community: community._id }).select("_id").lean();
  if (!membership) return;

  const role = communityRole(community, userId, membership._id);
  if (actorId !== userId && !community.creator.equals(actorId) && role !== "member" && role !== null) {
    throw forbidden("Only the owner can remove a community manager");
  }

  // Claim the removal in the same document used for transferring ownership and assigning roles.
  // A retry can finish a claimed removal after a failure. The count is adjusted only on the claim.
  const managerPath = `managers.${membership._id}`;
  if (role !== null) {
    await changeAccess(community, {
      $addToSet: { departingMemberships: membership._id },
      $unset: { [managerPath]: "", [`managerNotes.${userId}`]: "" },
      $pull: { hiddenTeam: new Types.ObjectId(userId) },
      $inc: { memberCount: -1 },
    });
  }
  await Membership.deleteOne({ _id: membership._id });
  await Community.updateOne({ _id: community._id }, { $pull: { departingMemberships: membership._id } });
}

export async function leave(req: Request, res: Response) {
  const community = await findBySlug(req.params.slug);
  await removeMembership(community, req.userId!, req.userId!);
  res.status(204).end();
}

function memberId(req: Request) {
  const id = req.params.userId;
  if (!id || !isObjectIdOrHexString(id)) throw badRequest("Invalid user id");
  return id.toLowerCase();
}

export async function removeMember(req: Request, res: Response) {
  const community = await requireCommunityRole(req, "admin");
  await removeMembership(community, memberId(req), req.userId!);
  res.status(204).end();
}

interface ListedMember {
  _id: Types.ObjectId;
  user: { _id: Types.ObjectId; username: string; displayName?: string | null; avatarUrl?: string | null };
}

function presentMember(user: ListedMember["user"], role: CommunityRole): CommunityMemberDTO {
  return { id: String(user._id), username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl, role };
}

async function listMembers(req: Request, res: Response, managers: boolean, publicTeam = false) {
  const community = publicTeam ? await findBySlug(req.params.slug) : await requireCommunityRole(req, "admin");
  const { q, cursor } = res.locals.query as { q?: string; cursor?: string };
  const ids = Object.keys(community.managers ?? {});
  const idFilter: { $gt?: Types.ObjectId; $in?: Types.ObjectId[]; $nin?: Types.ObjectId[] } = {};
  if (cursor) idFilter.$gt = new Types.ObjectId(cursor);
  const managerIds = ids.map((id) => new Types.ObjectId(id));
  if (managers) idFilter.$in = managerIds;
  else idFilter.$nin = [...managerIds, ...(community.departingMemberships ?? [])];
  const pattern = q ? new RegExp(escapeRegex(q), "i") : null;
  const hidden = new Set((community.hiddenTeam ?? []).map(String));
  const items: CommunityMemberDTO[] = [];
  if (managers && !cursor) {
    const owner = await User.findById(community.creator).select("username displayName avatarUrl").lean();
    if (owner && (!publicTeam || !hidden.has(String(owner._id))) && (!pattern || pattern.test(owner.username) || pattern.test(owner.displayName ?? ""))) {
      items.push({ ...presentMember(owner, "owner"), note: community.managerNotes?.[String(owner._id)] ?? "", visibleInTeam: !hidden.has(String(owner._id)) });
    }
  }
  const limit = LIST_LIMIT - items.length;
  const rows = await Membership.aggregate<ListedMember>([
    { $match: { community: community._id, user: publicTeam ? { $nin: [community.creator, ...(community.hiddenTeam ?? [])] } : { $ne: community.creator }, _id: idFilter } },
    { $sort: { _id: 1 } },
    { $lookup: { from: User.collection.name, localField: "user", foreignField: "_id", as: "user",
      pipeline: [{ $project: { username: 1, displayName: 1, avatarUrl: 1 } }] } },
    { $unwind: "$user" },
    ...(pattern ? [{ $match: { $or: [{ "user.username": pattern }, { "user.displayName": pattern }] } }] : []),
    { $limit: limit + 1 },
  ]);
  for (const row of rows.slice(0, limit)) {
    const role = communityRole(community, String(row.user._id), row._id);
    if (role) items.push({ ...presentMember(row.user, role), note: community.managerNotes?.[String(row.user._id)] ?? "", visibleInTeam: !hidden.has(String(row.user._id)) });
  }
  const nextCursor = rows.length > limit ? String(rows[limit - 1]!._id) : null;
  res.json({ items, nextCursor } satisfies Page<CommunityMemberDTO>);
}

export const members = (req: Request, res: Response) => listMembers(req, res, false);
export const managers = (req: Request, res: Response) => listMembers(req, res, true);
export const team = (req: Request, res: Response) => listMembers(req, res, true, true);

export async function updateTeamVisibility(req: Request, res: Response) {
  const community = await requireCommunityRole(req, "owner");
  const userId = memberId(req);
  if (!community.creator.equals(userId)) {
    const membership = await targetMembership(community, userId);
    if (!meetsCommunityRole(communityRole(community, userId, membership._id), "editor")) throw forbidden("Choose a community manager");
  }
  const id = new Types.ObjectId(userId);
  await changeAccess(community, req.body.visible
    ? { $pull: { hiddenTeam: id } }
    : { $addToSet: { hiddenTeam: id } });
  res.status(204).end();
}

export async function updateMemberNote(req: Request, res: Response) {
  const community = await requireCommunityRole(req, "owner");
  const userId = memberId(req);
  if (!community.creator.equals(userId)) {
    const membership = await targetMembership(community, userId);
    if (!meetsCommunityRole(communityRole(community, userId, membership._id), "editor")) throw forbidden("Choose a community manager");
  }
  const { note } = req.body as { note: string };
  const path = `managerNotes.${userId}`;
  await changeAccess(community, note ? { $set: { [path]: note } } : { $unset: { [path]: "" } });
  res.status(204).end();
}

async function targetMembership(community: CommunityRow, userId: string) {
  if (community.creator.equals(userId)) throw badRequest("Choose another member of the community");
  const row = await Membership.findOne({ user: userId, community: community._id }).select("_id").lean();
  if (!row || !communityRole(community, userId, row._id)) throw notFound("Community member not found");
  return row;
}

export async function updateMemberRole(req: Request, res: Response) {
  const community = await requireCommunityRole(req, "owner");
  const userId = memberId(req);
  const membership = await targetMembership(community, userId);
  const { role } = req.body as { role: Exclude<CommunityRole, "owner"> };
  const path = `managers.${membership._id}`;
  await changeAccess(community, role === "member"
    ? { $unset: { [path]: "", [`managerNotes.${userId}`]: "" }, $pull: { hiddenTeam: new Types.ObjectId(userId) } }
    : { $set: { [path]: role } });
  res.status(204).end();
}

export async function transfer(req: Request, res: Response) {
  const community = await requireCommunityRole(req, "owner");
  const { userId, confirmation } = req.body as { userId: string; confirmation: string };
  if (confirmation !== community.slug) throw badRequest("Enter the community address to confirm");
  const target = await targetMembership(community, userId);
  const user = await User.findById(userId).select("banned emailVerified").lean();
  if (!user || user.banned || (env.REQUIRE_VERIFIED_EMAIL && !user.emailVerified)) {
    throw badRequest("Choose an active community member");
  }

  // Ensure the outgoing owner has a regular membership before the atomic handover.
  // Legacy owner rows are valid memberships; only Community.creator grants ownership.
  try {
    await Membership.updateOne(
      { community: community._id, user: community.creator },
      { $setOnInsert: { role: "member" } },
      { upsert: true },
    );
  } catch (err) {
    if (!isDuplicate(err)) throw err;
  }
  await changeAccess(community, {
    $set: { creator: userId },
    $unset: { [`managers.${target._id}`]: "", [`managerNotes.${community.creator}`]: "" },
  });
  res.json(toCommunityDTO(community, "member"));
}

export async function posts(req: Request, res: Response) {
  const community = await findBySlug(req.params.slug);
  await sendPostPage(req, res, { community: community._id });
}
