import type { Request, Response } from "express";
import rateLimit, { type Options } from "express-rate-limit";
import { env } from "../config/env.js";
import { requestPrincipal } from "./auth.js";

export const LIMITER_HEADER = "X-RateLimit-Limiter";

function limiter(
  name: string | ((req: Request, res: Response) => string),
  windowMs: number,
  limit: number,
  error: string,
  options: Partial<Pick<Options, "keyGenerator" | "skip">> = {},
) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => env.NODE_ENV === "test",
    ...options,
    handler(req, res, _next, { statusCode }) {
      const label = typeof name === "string" ? name : name(req, res);
      res.locals.limiterPolicy = { name: label, limit, windowSeconds: windowMs / 1000 };
      res.setHeader("Cache-Control", "no-store");
      res.setHeader(LIMITER_HEADER, label);
      res.status(statusCode).json({ error });
    },
  });
}

// Only ordinary reads and the background view ping use the signed account budget.
// Requests without a valid access token and other mutations keep the client IP budget.
const accountReads = [
  /^\/api\/posts(?:\/[^/]+(?:\/comments)?)?\/?$/i,
  /^\/api\/users\/[^/]+(?:\/(?:posts|music|follow|friends(?:\/access)?))?\/?$/i,
  /^\/api\/users\/me\/relationships\/counts\/?$/i,
  /^\/api\/communities(?:\/[^/]+(?:\/posts)?)?\/?$/i,
  /^\/api\/notifications(?:\/(?:unread-count|preferences))?\/?$/i,
  /^\/api\/(?:messages\/unread-count|moderation\/notices)\/?$/i,
  /^\/api\/(?:news|server-fundraiser|public\/posts)\/?$/i,
];
const postView = /^\/api\/posts\/[^/]+\/view\/?$/i;

function browsingPrincipal(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") {
    const path = req.path;
    return accountReads.some((route) => route.test(path)) ? requestPrincipal(req) : null;
  }
  return req.method === "POST" && postView.test(req.path) ? requestPrincipal(req) : null;
}

function ipKey(req: Request) {
  return "ip:" + (req.ip ?? req.socket.remoteAddress ?? "unknown");
}

function accessKey(principal: NonNullable<ReturnType<typeof requestPrincipal>>) {
  // An earlier session version cannot drain the current budget.
  return `account:${principal.userId}:${principal.version}`;
}

export const globalLimiter = limiter(
  (req) => (browsingPrincipal(req) ? "global-account" : "global-ip"),
  15 * 60 * 1000,
  300,
  "Too many requests, slow down.",
  {
    skip: (req) => env.NODE_ENV === "test" || (req.method === "POST" && /^\/api\/client-network\/?$/i.test(req.path)),
    keyGenerator(req) {
      const principal = browsingPrincipal(req);
      return principal ? accessKey(principal) : ipKey(req);
    },
  },
);

export const refreshLimiter = limiter(
  (_req, res) => (res.locals.refreshSession ? "refresh-account" : "refresh-ip"),
  15 * 60 * 1000,
  20,
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
  15 * 60 * 1000,
  30,
  "Too many uploads, try again later.",
);

export const reportLimiter = limiter(
  "report",
  15 * 60 * 1000,
  10,
  "You're reporting too fast, try again later.",
);

export const authLimiter = limiter(
  "auth",
  15 * 60 * 1000,
  20,
  "Too many attempts, try again later.",
);

export const emailLimiter = limiter(
  "email",
  15 * 60 * 1000,
  5,
  "Too many email requests, try again later.",
);

export const checkoutLimiter = limiter(
  "checkout",
  15 * 60 * 1000,
  20,
  "Too many checkout attempts, try again later.",
);

export const searchLimiter = limiter(
  "search",
  60 * 1000,
  40,
  "Searching too fast, try again in a moment.",
);

export const linkPreviewLimiter = limiter(
  "link-preview",
  60 * 1000,
  40,
  "Too many requests, slow down.",
);

export const viewLimiter = limiter(
  "post-view-account",
  15 * 60 * 1000,
  200,
  "Too many requests, slow down.",
  {
    keyGenerator: (req) => (req.userId ? `account:${req.userId}` : ipKey(req)),
  },
);

export const publicLimiter = limiter(
  (req) => (requestPrincipal(req) ? "public-account" : "public"),
  60 * 1000,
  60,
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
  60 * 60 * 1000,
  10,
  "You're creating communities too fast, try again later.",
);

export const messageLimiter = limiter(
  "message",
  10 * 60 * 1000,
  60,
  "You're sending messages too fast, slow down.",
);

export const newChatLimiter = limiter(
  "chat-create",
  60 * 60 * 1000,
  20,
  "You're starting too many chats, try again later.",
);

export const pushLimiter = limiter(
  "push",
  10 * 60 * 1000,
  30,
  "Too many requests, try again later.",
);

export const testPushLimiter = limiter(
  "push-test",
  10 * 60 * 1000,
  3,
  "Test notifications are limited, try again in a few minutes.",
);

export const readLimiter = limiter("messages-read", 10 * 60 * 1000, 300, "Slow down.");

export const clientErrorLimiter = limiter("client-error", 10 * 60 * 1000, 20, "Too many reports.");
export const clientNetworkLimiter = limiter("client-network", 10 * 60 * 1000, 20, "Too many reports.");

export const contactLimiter = limiter(
  "contact",
  60 * 60 * 1000,
  5,
  "Too many messages, try again later.",
);
