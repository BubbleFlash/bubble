import type { Request, Response } from "express";
import { createHmac } from "node:crypto";
import { maxChatCreateLimit, rateLimitDefaults, registrationRateLimits, type AccountActionRule, type RateLimitName, type RegistrationRateLimit } from "@commune/shared";
import rateLimit, { MemoryStore, type Options, type RateLimitRequestHandler } from "express-rate-limit";
import { env } from "../config/env.js";
import { rateLimitPolicy } from "../services/rateLimitSettings.js";
import { asyncHandler } from "../utils/errors.js";
import { requestPrincipal } from "./auth.js";
import { takeQuota } from "../services/quotaCounter.js";

export const LIMITER_HEADER = "X-RateLimit-Limiter";

function limiter(
  name: RateLimitName | ((req: Request, res: Response) => RateLimitName),
  error: string,
  options: Partial<Pick<Options, "keyGenerator" | "skip">> = {},
) {
  const active = new Map<RateLimitName, { revision: string; store: MemoryStore; handler: RateLimitRequestHandler }>();

  return asyncHandler(async (req, res, next) => {
    if (env.NODE_ENV === "test" || await options.skip?.(req, res)) return next();
    const policy = await rateLimitPolicy();
    if (!policy.enabled) {
      for (const { store } of active.values()) store.shutdown();
      active.clear();
      return next();
    }

    const label = typeof name === "string" ? name : name(req, res);
    const override = policy.rules[label];
    const current = active.get(label);
    if (override?.enabled === false) {
      current?.store.shutdown();
      active.delete(label);
      return next();
    }

    const revision = `${policy.revision}:${override?.revision ?? ""}`;
    if (current?.revision === revision) return current.handler(req, res, next);

    const { limit, windowSeconds } = override ?? rateLimitDefaults[label];
    const store = new MemoryStore();
    const handler = rateLimit({
      store,
      // One middleware per rule revision lets express-rate-limit apply a fixed window for that rule.
      validate: { creationStack: false },
      windowMs: windowSeconds * 1000,
      limit,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      keyGenerator: options.keyGenerator ?? accountOrIpKey,
      handler(_req, res, _next, { statusCode }) {
        res.locals.limiterPolicy = { name: label, limit, windowSeconds };
        res.setHeader("Cache-Control", "no-store");
        res.setHeader(LIMITER_HEADER, label);
        res.status(statusCode).json({ error });
      },
    });
    current?.store.shutdown();
    active.set(label, { revision, store, handler });
    return handler(req, res, next);
  });
}

function ipKey(req: Request) {
  return "ip:" + (req.ip ?? req.socket.remoteAddress ?? "unknown");
}

function accountOrIpKey(req: Request) {
  return req.userId ? `account:${req.userId}` : ipKey(req);
}

function accessKey(principal: NonNullable<ReturnType<typeof requestPrincipal>>) {
  // An earlier session version cannot drain the current budget.
  return `account:${principal.userId}:${principal.version}`;
}

export const globalLimiter = limiter(
  (req) => (requestPrincipal(req) ? "global-account" : "global-ip"),
  "Too many requests, slow down.",
  {
    skip: (req) => (
      // Keep the admin switch accessible even after the shared IP budget is exhausted.
      /^\/api\/admin\/rate-limits(?:\/[^/]+)?\/?$/i.test(req.path) ||
      (req.method === "POST" && /^\/api\/(?:client-network|client-errors|auth\/(?:refresh|register(?:\/captcha)?))\/?$/i.test(req.path))
    ),
    keyGenerator(req) {
      const principal = requestPrincipal(req);
      return principal ? accessKey(principal) : ipKey(req);
    },
  },
);

// Bound cookie lookups by IP before hitting Mongo. Other site activity must not exhaust this budget.
export const refreshLookupLimiter = limiter("refresh-lookup-ip", "Too many attempts, try again later.");

export const refreshLimiter = limiter(
  (_req, res) => (res.locals.refreshSession ? "refresh-account" : "refresh-ip"),
  "Too many attempts, try again later.",
  {
    keyGenerator(req, res) {
      const session = res.locals.refreshSession;
      return session ? "account:" + session.user + ":" + (session.sessionVersion ?? 0) : ipKey(req);
    },
  },
);

export const uploadLimiter = limiter(
  "upload",
  "Too many uploads, try again later.",
);

export const reportLimiter = limiter(
  "report",
  "You're reporting too fast, try again later.",
);

export const authLimiter = limiter(
  "auth",
  "Too many attempts, try again later.",
);

export const emailLimiter = limiter(
  "email",
  "Too many email requests, try again later.",
);

export const checkoutLimiter = limiter(
  "checkout",
  "Too many checkout attempts, try again later.",
);

export const searchLimiter = limiter(
  "search",
  "Searching too fast, try again in a moment.",
);

export const linkPreviewLimiter = limiter(
  "link-preview",
  "Too many requests, slow down.",
);

export const viewLimiter = limiter(
  "post-view-account",
  "Too many requests, slow down.",
  {
    keyGenerator: (req) => (req.userId ? `account:${req.userId}` : ipKey(req)),
  },
);

export const publicLimiter = limiter(
  (req) => (requestPrincipal(req) ? "public-account" : "public"),
  "Too many requests, slow down.",
  {
    keyGenerator(req) {
      const principal = requestPrincipal(req);
      return principal ? accessKey(principal) : ipKey(req);
    },
  },
);

export const communityLimiter = limiter(
  "community-create",
  "You're creating communities too fast, try again later.",
);

function rejectQuota(res: Response, name: string, limit: number, windowSeconds: number, retryAfter: number) {
  res.locals.limiterPolicy = { name, limit, windowSeconds };
  res.set({ [LIMITER_HEADER]: name, "Retry-After": String(retryAfter), "Cache-Control": "no-store" });
  res.status(429).json({ error: "Too many requests, slow down." });
}

export async function allowAccountAction(req: Request, res: Response, name: AccountActionRule, target?: string) {
  if (env.NODE_ENV === "test") return true;
  const policy = await rateLimitPolicy();
  const rule = policy.rules[name];
  if (rule?.enabled === false) return true;
  const { limit, windowSeconds } = rule ?? rateLimitDefaults[name];
  const threshold = name === "chat-create" ? Math.min(limit, maxChatCreateLimit) : limit;
  const retryAfter = await takeQuota(`action:${name}:${rule?.revision ?? ""}:${req.userId}`, threshold, windowSeconds, target);
  if (!retryAfter) return true;
  rejectQuota(res, name, threshold, windowSeconds, retryAfter);
  return false;
}

export function accountActionLimiter(name: AccountActionRule) {
  return asyncHandler(async (req, res, next) => {
    if (await allowAccountAction(req, res, name)) next();
  });
}

export async function allowRegistrationRequest(req: Request, res: Response, name: RegistrationRateLimit) {
  if (env.NODE_ENV === "test") return true;
  const { limit, windowSeconds } = registrationRateLimits[name];
  const key = createHmac("sha256", env.JWT_ACCESS_SECRET).update(`${name}:${ipKey(req)}`).digest("hex");
  const retryAfter = await takeQuota(key, limit, windowSeconds);
  if (!retryAfter) return true;
  rejectQuota(res, name, limit, windowSeconds, retryAfter);
  return false;
}

export const pushLimiter = limiter(
  "push",
  "Too many requests, try again later.",
);

export const testPushLimiter = limiter(
  "push-test",
  "Test notifications are limited, try again in a few minutes.",
);

export const readLimiter = limiter("messages-read", "Slow down.");

export const clientErrorLimiter = limiter("client-error", "Too many reports.");
export const clientNetworkLimiter = limiter("client-network", "Too many reports.");

export const contactLimiter = limiter(
  "contact",
  "Too many messages, try again later.",
);
