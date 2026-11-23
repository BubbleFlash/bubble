import type { Request, Response } from "express";
import { Community } from "../models/Community.js";
import { User } from "../models/User.js";
import { badRequest, notFound } from "../utils/errors.js";

export async function list(req: Request, res: Response) {
  const owner = await User.findById(req.userId).select("mutedUsers").lean();
  const users = await User.find({ _id: { $in: owner?.mutedUsers ?? [] } }).select("username displayName avatarUrl").sort({ username: 1 }).lean();
  res.json(users.map((user) => ({ id: String(user._id), username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl ?? null })));
}

async function target(req: Request) {
  if (req.params.kind === "users") {
    const user = await User.findOne({ username: req.params.name }).collation({ locale: "en", strength: 2 }).select("_id").lean();
    if (!user) throw notFound("User not found");
    if (String(user._id) === req.userId) throw badRequest("Cannot hide your own posts");
    return { field: "mutedUsers", id: user._id };
  }
  if (req.params.kind === "communities") {
    const community = await Community.findOne({ slug: req.params.name }).select("_id").lean();
    if (!community) throw notFound("Community not found");
    return { field: "mutedCommunities", id: community._id };
  }
  throw notFound("Not found");
}

export async function get(req: Request, res: Response) {
  const { field, id } = await target(req);
  res.json({ muted: Boolean(await User.exists({ _id: req.userId, [field]: id })) });
}

export async function update(req: Request, res: Response) {
  const { field, id } = await target(req);
  await User.updateOne({ _id: req.userId }, req.method === "PUT" ? { $addToSet: { [field]: id } } : { $pull: { [field]: id } });
  res.json({ muted: req.method === "PUT" });
}
