import type { Request, Response } from "express";
import mongoose from "mongoose";
import { fontUploadUrlSchema, usernameSchema, type UpdateAppearanceInput } from "@commune/shared";
import { Follow } from "../models/Follow.js";
import { User } from "../models/User.js";
import { Post } from "../models/Post.js";
import { accountRestriction } from "../services/restrictions.js";
import { onlineUsers } from "../services/realtime.js";
import { notify } from "../services/notificationService.js";
import { deleteFontIfUnused, deleteUploadIfUnused } from "../services/uploadService.js";
import { badRequest, forbidden, notFound } from "../utils/errors.js";
import { toProfileDTO, toAccountUser } from "../utils/serializers.js";
import { sendPostPage } from "./postController.js";
import { listProfileMusic } from "../services/musicService.js";

/** Usernames are case-insensitive, so lookups use the same collation as the unique index. */
export async function findByUsername(raw: string | undefined) {
  const parsed = usernameSchema.safeParse(raw);
  if (!parsed.success) throw notFound("User not found");
  const user = await User.findOne({ username: parsed.data })
    .collation({ locale: "en", strength: 2 })
    .lean();
  if (!user || user.deletionExpiresAt || user.anonymizedAt) throw notFound("User not found");
  return user;
}

export async function onlineProfiles(req: Request, res: Response) {
  const usernames = typeof req.query.usernames === "string" ? req.query.usernames.split(",") : [];
  if (!usernames.length || usernames.length > 50 || usernames.some((name) => !usernameSchema.safeParse(name).success)) {
    throw badRequest("Invalid profile IDs");
  }
  const people = await User.find({ username: { $in: usernames }, deletionExpiresAt: null, anonymizedAt: null })
    .collation({ locale: "en", strength: 2 }).select("username banned accountRestriction").lean();
  const available = people.filter((person) => !accountRestriction(person));
  const online = await onlineUsers(available.map((person) => String(person._id)));
  res.json({ online: available.filter((person) => online.has(String(person._id))).map((person) => person.username.toLowerCase()) });
}

async function buildProfile(user: Awaited<ReturnType<typeof findByUsername>>, viewerId: string) {
  const [followerCount, followingCount, follows, followedBy, online] = await Promise.all([
    Follow.countDocuments({ following: user._id }),
    Follow.countDocuments({ follower: user._id }),
    Follow.exists({ follower: viewerId, following: user._id }),
    Follow.exists({ follower: user._id, following: viewerId }),
    onlineUsers([user._id.toString()]),
  ]);
  return { ...toProfileDTO(
    user,
    { followerCount, followingCount },
    Boolean(follows),
    Boolean(followedBy),
  ), online: !accountRestriction(user) && online.has(user._id.toString()) };
}

export async function me(req: Request, res: Response) {
  const user = await User.findById(req.userId).lean();
  if (!user) throw notFound("User not found");
  res.json(toAccountUser(user));
}

export async function getMusicSettings(req: Request, res: Response) {
  res.set("Cache-Control", "private, no-store");
  const user = await User.findById(req.userId).select("musicLibraryVisibility").lean();
  if (!user) throw notFound("User not found");
  res.json({ visibility: user.musicLibraryVisibility ?? "everyone" });
}

export async function updateMusicSettings(req: Request, res: Response) {
  res.set("Cache-Control", "private, no-store");
  const user = await User.findByIdAndUpdate(req.userId, { musicLibraryVisibility: req.body.visibility }, { new: true, runValidators: true }).lean();
  if (!user) throw notFound("User not found");
  res.json({ visibility: user.musicLibraryVisibility });
}

export async function userMusic(req: Request, res: Response) {
  res.set("Cache-Control", "private, no-store");
  const owner = await findByUsername(req.params.username);
  const viewerId = req.userId!;
  const visibility = owner.musicLibraryVisibility ?? "everyone";
  let canView = owner._id.toString() === viewerId || visibility === "everyone";
  if (!canView && visibility === "friends") {
    const [outgoing, incoming] = await Promise.all([
      Follow.exists({ follower: viewerId, following: owner._id }),
      Follow.exists({ follower: owner._id, following: viewerId }),
    ]);
    canView = Boolean(outgoing && incoming);
  }
  if (!canView) {
    res.json({ status: "hidden" });
    return;
  }
  res.json(await listProfileMusic(owner._id.toString(), viewerId, res.locals.query.cursor));
}

/** Updates the supplied profile fields. A null avatarUrl removes the avatar. */
export async function updateMe(req: Request, res: Response) {
  const existing = await User.findById(req.userId).select("avatarUrl").lean();
  if (!existing) throw notFound("User not found");

  const update: Record<string, unknown> = {};
  if (req.body.displayName !== undefined) update.displayName = req.body.displayName;
  if (req.body.bio !== undefined) update.bio = req.body.bio;
  if (req.body.avatarUrl !== undefined) update.avatarUrl = req.body.avatarUrl;

  const user = await User.findByIdAndUpdate(req.userId, update, {
    new: true,
    runValidators: true,
  }).lean();
  if (!user) throw notFound("User not found");

  // Remove the old photo from disk once nothing references it.
  if (existing.avatarUrl && existing.avatarUrl !== user.avatarUrl) {
    await deleteUploadIfUnused(existing.avatarUrl);
  }
  res.json(toAccountUser(user));
}

export async function updateAppearance(req: Request, res: Response) {
  const { appearance, avatarFrame, profileAppearanceVisibility } = req.body as UpdateAppearanceInput;
  const update: Record<string, unknown> = {};
  if (appearance?.backgroundUrl !== undefined) update["appearance.backgroundUrl"] = appearance.backgroundUrl;
  if (appearance?.primaryColor !== undefined) update["appearance.primaryColor"] = appearance.primaryColor;
  if (appearance?.accentColor !== undefined) update["appearance.accentColor"] = appearance.accentColor;
  if (appearance?.windowOpacity !== undefined) update["appearance.windowOpacity"] = appearance.windowOpacity;
  if (appearance?.font !== undefined) {
    if (fontUploadUrlSchema.safeParse(appearance.font).success &&
        !appearance.font?.startsWith(`/uploads/${req.userId}-`)) {
      throw badRequest("Invalid font file");
    }
    update["appearance.font"] = appearance.font;
  }
  if (avatarFrame !== undefined) update.avatarFrame = avatarFrame;
  if (profileAppearanceVisibility !== undefined) update.profileAppearanceVisibility = profileAppearanceVisibility;

  const previous = await User.findByIdAndUpdate(req.userId, { $set: update }, {
    returnDocument: "before",
    runValidators: true,
  }).select(appearance?.font === undefined ? "appearance.backgroundUrl" : "appearance.backgroundUrl appearance.font").lean();
  if (!previous) throw notFound("User not found");

  if (appearance?.backgroundUrl !== undefined && previous.appearance?.backgroundUrl !== appearance.backgroundUrl) {
    await deleteUploadIfUnused(previous.appearance?.backgroundUrl);
  }
  if (appearance?.font !== undefined && previous.appearance?.font !== appearance.font) {
    await deleteFontIfUnused(previous.appearance?.font);
  }
  res.json({ appearance, avatarFrame, profileAppearanceVisibility });
}

export async function getProfile(req: Request, res: Response) {
  const user = await findByUsername(req.params.username);
  res.json(await buildProfile(user, req.userId!));
}

export async function userPosts(req: Request, res: Response) {
  const user = await findByUsername(req.params.username);
  const showHidden = String(user._id) === req.userId || req.userRole === "admin" || req.userRole === "moderator";
  await sendPostPage(req, res, { author: user._id, ...(!showHidden && { hideAuthor: { $ne: true } }) }, { id: user.pinnedPost, canPin: String(user._id) === req.userId });
}

export async function pinPost(req: Request, res: Response) {
  const user = await findByUsername(req.params.username);
  if (String(user._id) !== req.userId) throw forbidden("You cannot pin posts on this profile");
  if (!mongoose.isValidObjectId(req.params.id)) throw badRequest("Invalid post ID");
  const post = await Post.findOne({ _id: req.params.id, author: user._id, moderationState: { $nin: ["hidden", "removed", "withdrawn"] } }).select("_id").lean();
  if (!post) throw notFound("Post not found");
  if (req.method === "DELETE") await User.updateOne({ _id: user._id, pinnedPost: post._id }, { $unset: { pinnedPost: 1 } });
  else await User.updateOne({ _id: user._id }, { $set: { pinnedPost: post._id } });
  res.status(204).end();
}

/** Toggles following. Returns the updated profile so the UI can refresh counts in one step. */
export async function toggleFollow(req: Request, res: Response) {
  const user = await findByUsername(req.params.username);
  if (user._id.toString() === req.userId) throw badRequest("You can't follow yourself");

  const removed = await Follow.findOneAndDelete({ follower: req.userId, following: user._id });
  if (!removed) {
    try {
      await Follow.create({ follower: req.userId, following: user._id });
      await notify({ user: user._id, actor: req.userId!, type: "follow" });
    } catch (err) {
      // A concurrent request already created the follow; treat as success.
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }
  res.json(await buildProfile(user, req.userId!));
}

/** Idempotent creation; the unique pair index arbitrates concurrent inserts. */
export async function follow(req: Request, res: Response) {
  const user = await findByUsername(req.params.username);
  if (user._id.toString() === req.userId) throw badRequest("You can't follow yourself");
  try {
    await Follow.create({ follower: req.userId, following: user._id });
    if (!(await Follow.exists({ follower: user._id, following: req.userId }))) {
      await notify({ user: user._id, actor: req.userId!, type: "follow" });
    }
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
  }
  res.json(await buildProfile(user, req.userId!));
}

export async function unfollow(req: Request, res: Response) {
  const user = await findByUsername(req.params.username);
  await Follow.findOneAndDelete({ follower: req.userId, following: user._id });
  res.json(await buildProfile(user, req.userId!));
}
