import type { Request, Response } from "express";
import { z } from "zod";
import { siteDefaults } from "../content/siteDefaults.js";
import { SiteContent } from "../models/SiteContent.js";
import { SiteTeamSettings } from "../models/SiteTeamSettings.js";
import { User } from "../models/User.js";
import { accountRestriction } from "../services/restrictions.js";
import { badRequest } from "../utils/errors.js";
import { usernameSchema } from "@commune/shared";

const fields = { rules: z.string().trim().min(1).max(30000), benefits: z.string().trim().min(1).max(30000), principles: z.string().trim().min(1).max(30000), about: z.string().trim().min(1).max(30000) };
const schema = z.object(fields).strict();
// Older descriptions embedded a second, static team list. Team membership now comes from accounts.
const withoutLegacyTeam = (text: string) => text.replace(/(^|\n)Наша команда\r?\n[\s\S]*?(?=\nПрисоединяйся к разработке(?:\r?\n|$))/, "$1");

export async function getContent(_req: Request, res: Response) {
  const content = await SiteContent.findById("site-content").lean();
  res.set("Cache-Control", "no-store").json({
    rules: content?.rules ?? siteDefaults.rules,
    benefits: content?.benefits ?? siteDefaults.benefits,
    principles: content?.principles ?? siteDefaults.principles,
    about: withoutLegacyTeam(content?.about ?? siteDefaults.about),
  });
}

export async function updateContent(req: Request, res: Response) {
  const input = schema.safeParse(req.body);
  if (!input.success) throw badRequest("Invalid input");
  const updated = { ...input.data, about: withoutLegacyTeam(input.data.about) };
  await SiteContent.findByIdAndUpdate("site-content", { $set: updated }, { upsert: true, runValidators: true });
  res.set("Cache-Control", "no-store").json(updated);
}

export async function team(_req: Request, res: Response) {
  const config = await SiteTeamSettings.findById("site-team").lean();
  const ids = [...(config?.developers ?? []), ...(config?.artists ?? []), ...(config?.testers ?? [])];
  const users = await User.find({ $or: [{ role: { $in: ["admin", "moderator"] } }, { _id: { $in: ids } }], deletionExpiresAt: null, anonymizedAt: null })
    .select("username displayName role banned accountRestriction").sort({ username: 1 }).lean();
  const visible = users.filter((user) => !accountRestriction(user));
  const byId = new Map(visible.map((user) => [String(user._id), user]));
  const present = (user: typeof visible[number]) => ({ username: user.username, displayName: user.displayName || user.username, role: user.role });
  const group = (list: typeof ids) => list.flatMap((id) => { const user = byId.get(String(id)); return user ? [present(user)] : []; });
  res.json({
    members: visible.filter((user) => user.role === "admin" || user.role === "moderator").map(present),
    groups: {
      developers: group(config?.developers ?? []), artists: group(config?.artists ?? []), testers: group(config?.testers ?? []),
      moderators: visible.filter((user) => user.role === "moderator").map(present),
      administrators: visible.filter((user) => user.role === "admin").map(present),
    },
  });
}

const teamSchema = z.object({
  developers: z.array(usernameSchema).max(50), artists: z.array(usernameSchema).max(50), testers: z.array(usernameSchema).max(50),
}).strict();

export async function getTeamSettings(_req: Request, res: Response) {
  const config = await SiteTeamSettings.findById("site-team").lean();
  const ids = [...(config?.developers ?? []), ...(config?.artists ?? []), ...(config?.testers ?? [])];
  const users = await User.find({ _id: { $in: ids } }).select("username").lean();
  const names = new Map(users.map((user) => [String(user._id), user.username]));
  const group = (list: typeof ids) => list.flatMap((id) => { const name = names.get(String(id)); return name ? [name] : []; });
  res.set("Cache-Control", "no-store").json({ developers: group(config?.developers ?? []), artists: group(config?.artists ?? []), testers: group(config?.testers ?? []) });
}

export async function updateTeamSettings(req: Request, res: Response) {
  const input = teamSchema.safeParse(req.body);
  if (!input.success) throw badRequest("Invalid input");
  const names = [...new Set(Object.values(input.data).flat().map((name) => name.toLowerCase()))];
  const users = await User.find({ username: { $in: names }, deletionExpiresAt: null, anonymizedAt: null }).collation({ locale: "en", strength: 2 }).select("username").lean();
  const found = new Map(users.map((user) => [user.username.toLowerCase(), user._id]));
  const missing = names.filter((name) => !found.has(name));
  if (missing.length) throw badRequest(`Не найдены аккаунты: ${missing.join(", ")}`);
  const group = (list: string[]) => [...new Set(list.map((name) => name.toLowerCase()))].map((name) => found.get(name)!);
  await SiteTeamSettings.findByIdAndUpdate("site-team", { $set: { developers: group(input.data.developers), artists: group(input.data.artists), testers: group(input.data.testers) } }, { upsert: true, runValidators: true });
  await getTeamSettings(req, res);
}
