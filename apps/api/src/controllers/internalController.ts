import crypto from "node:crypto";
import type { Request, Response } from "express";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { Conversation } from "../models/Conversation.js";
import { checkSession } from "../middleware/auth.js";
import { notFound } from "../utils/errors.js";

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * For the realtime service only: who is in a conversation. Protected by the shared secret and
 * answers 404 to everyone else (and when realtime is not configured), so it is invisible.
 */
export function hasRealtimeSecret(req: Request) {
  const secret = env.REALTIME_SECRET;
  const header = req.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  return Boolean(secret && safeEqual(given, secret));
}

export async function verifySession(req: Request, res: Response) {
  if (!hasRealtimeSecret(req)) throw notFound("Not found");
  const token = req.get("x-session-token");
  if (!token) throw notFound("Not found");
  await checkSession(token);
  res.status(204).end();
}

export async function conversationParticipants(req: Request, res: Response) {
  if (!hasRealtimeSecret(req)) throw notFound("Not found");
  const id = String(req.params.id);
  if (!mongoose.isValidObjectId(id)) throw notFound("Not found");
  const convo = await Conversation.findById(id).select("participants").lean();
  if (!convo) throw notFound("Not found");
  res.json({ participants: convo.participants.map((p) => String(p)) });
}
