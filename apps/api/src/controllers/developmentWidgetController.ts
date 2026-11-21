import type { Request, Response } from "express";
import { communitySlugSchema } from "@commune/shared";
import { z } from "zod";
import { Community } from "../models/Community.js";
import { DevelopmentWidgetSettings } from "../models/DevelopmentWidgetSettings.js";
import { Post } from "../models/Post.js";
import { publicPostFilter } from "../services/postAccess.js";
import { badRequest, notFound } from "../utils/errors.js";

export async function settings(_req: Request, res: Response) {
  const row = await DevelopmentWidgetSettings.findById("development-widget").lean();
  res.json({ communitySlug: row?.communitySlug ?? "" });
}

export async function update(req: Request, res: Response) {
  const input = z.object({ communitySlug: z.union([z.literal(""), communitySlugSchema]) }).strict().safeParse(req.body);
  if (!input.success) throw badRequest("Invalid community address");
  const { communitySlug } = input.data;
  if (communitySlug && !await Community.exists({ slug: communitySlug })) throw notFound("Community not found");
  await DevelopmentWidgetSettings.findByIdAndUpdate("development-widget", { $set: { communitySlug } }, { upsert: true });
  res.json({ communitySlug });
}

export async function latest(_req: Request, res: Response) {
  const settings = await DevelopmentWidgetSettings.findById("development-widget").lean();
  const community = settings?.communitySlug ? await Community.findOne({ slug: settings.communitySlug }).select("_id").lean() : null;
  const post = community ? await Post.findOne({ community: community._id, ...publicPostFilter }).select("content createdAt").sort({ createdAt: -1, _id: -1 }).lean() : null;
  res.json({ post: post ? { id: String(post._id), content: post.content.slice(0, 200), truncated: post.content.length > 200, createdAt: post.createdAt.toISOString() } : null });
}

export async function updates(_req: Request, res: Response) {
  const settings = await DevelopmentWidgetSettings.findById("development-widget").lean();
  const community = settings?.communitySlug ? await Community.findOne({ slug: settings.communitySlug }).select("_id").lean() : null;
  const posts = community ? await Post.find({ community: community._id, ...publicPostFilter }).select("content createdAt").sort({ createdAt: -1, _id: -1 }).limit(5).lean() : [];
  res.json({ posts: posts.map((post) => ({ id: String(post._id), content: post.content.slice(0, 200), createdAt: post.createdAt.toISOString() })) });
}
