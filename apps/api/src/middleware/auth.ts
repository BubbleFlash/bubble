import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { accountRestriction, publishingRestriction, restrictionError } from "../services/restrictions.js";
import { forbidden, unauthorized } from "../utils/errors.js";
import { isPlusActive } from "../utils/plan.js";
import { verifyAccessToken } from "../utils/tokens.js";

export async function checkSession(token: string) {
  let principal;
  try {
    principal = verifyAccessToken(token);
  } catch {
    throw unauthorized("Invalid or expired access token");
  }
  const user = await User.findById(principal.userId)
    .select("role banned emailVerified sessionVersion accountRestriction publishingRestriction deletionExpiresAt anonymizedAt").lean();
  if (!user || user.deletionExpiresAt || user.anonymizedAt) throw unauthorized("Account not found");
  const restriction = accountRestriction(user);
  if (restriction) throw restrictionError("account", restriction);
  if ((user.sessionVersion ?? 0) !== principal.version) throw unauthorized("Session expired");
  return { principal, user };
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(unauthorized("Missing access token"));
  try {
    const { principal, user } = await checkSession(header.slice(7));
    req.userId = principal.userId;
    req.emailVerified = user.emailVerified;
    const publishing = publishingRestriction(user);
    req.publishingRestriction = publishing ? { reason: publishing.reason ?? "", until: publishing.until } : undefined;
    req.userRole = user.role === "admin" || user.role === "moderator" ? user.role : "user";
    next();
  } catch (error) {
    next(error);
  }
};

export const requireActive: RequestHandler = (req, _res, next) => {
  if (env.REQUIRE_VERIFIED_EMAIL && !req.emailVerified) {
    return next(forbidden("Verify your email address to do this"));
  }
  next();
};

export const requirePublishing: RequestHandler = (req, _res, next) => {
  next(req.publishingRestriction ? restrictionError("publishing", req.publishingRestriction) : undefined);
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.userRole !== "admin") return next(forbidden("Admins only"));
  next();
};

export const requireModerator: RequestHandler = (req, _res, next) => {
  if (req.userRole !== "admin" && req.userRole !== "moderator") return next(forbidden("Moderators only"));
  next();
};

export const requirePlus: RequestHandler = async (req, _res, next) => {
  try {
    const user = await User.findById(req.userId).select("plusUntil").lean();
    if (!isPlusActive(user?.plusUntil)) return next(forbidden("Commune Plus is required"));
    next();
  } catch (err) {
    next(err);
  }
};
