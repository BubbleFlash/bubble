import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { TestGateSettings } from "../models/TestGateSettings.js";
import { badRequest, notFound } from "../utils/errors.js";

const inputSchema = z.object({
  enabled: z.boolean(),
  username: z.string().trim().min(1).max(100).optional(),
  password: z.string().min(8).max(128).optional(),
}).strict().refine((input) => Boolean(input.username) === Boolean(input.password), { message: "Enter both login and password" });
const safeEqual = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
const passwordDigest = (password: string) => createHash("sha256").update(password).digest("hex");
function requireGate(req: Request) {
  const token = req.get("x-test-gate-secret") ?? "";
  if (!env.TEST_GATE_SECRET || !safeEqual(token, env.TEST_GATE_SECRET)) throw notFound("Not found");
}

export async function getSettings(_req: Request, res: Response) {
  if (!env.TEST_GATE_SECRET) return res.json({ available: false, enabled: false, username: "", configured: false });
  const settings = await TestGateSettings.findById("test-gate").select("+passwordHash").lean();
  res.set("Cache-Control", "no-store").json({ available: true, enabled: settings?.enabled ?? false, username: settings?.username ?? "", configured: Boolean(settings?.passwordHash) });
}

export async function updateSettings(req: Request, res: Response) {
  if (!env.TEST_GATE_SECRET) throw notFound("Not found");
  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid input");
  const { enabled, username, password } = parsed.data;
  const current = await TestGateSettings.findById("test-gate").select("+passwordHash").lean();
  if (enabled && !password && !current?.passwordHash) throw badRequest("Set test access credentials first");
  const passwordHash = password ? await bcrypt.hash(passwordDigest(password), 12) : undefined;
  const saved = await TestGateSettings.findByIdAndUpdate("test-gate", {
    $set: { enabled, version: randomUUID(), ...(username && passwordHash ? { username, passwordHash } : {}) },
  }, { upsert: true, new: true, runValidators: true }).select("+passwordHash").lean();
  res.set("Cache-Control", "no-store").json({ available: true, enabled: saved.enabled, username: saved.username, configured: Boolean(saved.passwordHash) });
}

export async function status(req: Request, res: Response) {
  requireGate(req);
  const settings = await TestGateSettings.findById("test-gate").lean();
  res.set("Cache-Control", "no-store").json({ enabled: settings?.enabled ?? false, version: settings?.version ?? "" });
}

export async function verify(req: Request, res: Response) {
  requireGate(req);
  const input = z.object({ username: z.string().max(100), password: z.string().max(128) }).strict().safeParse(req.body);
  if (!input.success) return res.status(401).end();
  const settings = await TestGateSettings.findById("test-gate").select("+passwordHash").lean();
  if (!settings?.enabled || !settings.passwordHash || !safeEqual(input.data.username, settings.username) || !await bcrypt.compare(passwordDigest(input.data.password), settings.passwordHash)) return res.status(401).end();
  res.set("Cache-Control", "no-store").json({ version: settings.version });
}
