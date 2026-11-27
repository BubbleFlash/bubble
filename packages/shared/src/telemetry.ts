import { z } from "zod";
import { rateLimitNames, registrationRateLimits, type RegistrationRateLimit } from "./rateLimits.js";

export const telemetryMethods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OTHER"] as const;
export const networkKinds = [
  "http",
  "network",
  "offline",
  "timeout",
  "socket-connect",
  "socket-auth",
  "socket-fallback",
  "socket-drop",
  "socket-limit",
  "closed",
] as const;
export const telemetryLimiters = [...rateLimitNames, ...Object.keys(registrationRateLimits) as RegistrationRateLimit[]];

// Use fixed labels for observations made before Express has matched a route or outside the API.
// Never include a dynamic segment even when it looks like a username, ID, or valid token.
const routeGroups = [
  [
    "/auth",
    "register login google refresh logout change-password change-email confirm-email-change delete-account forgot-password reset-password verify-email resend-verification",
  ],
  ["/notifications", "unread-count read preferences"],
  ["/public", "posts"],
  ["/search", "people posts"],
  ["/uploads", "image font direct"],
  ["/push", "status subscribe unsubscribe preferences test"],
  ["/billing", "checkout portal"],
  ["/moderation", "notices reports content users history games"],
  ["/admin", "errors telemetry rate-limits"],
] as const;

export function telemetryRoute(path: string): string {
  const clean = path
    .split(/[?#]/, 1)[0]!
    .replace(/^\/api(?=\/|$)/i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  if (
    /^\/(?:news|games|contact|link-preview|server-fundraiser|insights|profile-presence|socket\.io|client-errors|client-network)$/.test(
      clean,
    )
  )
    return clean;
  if (clean === "/auth/register/captcha") return clean;
  for (const [root, suffixes] of routeGroups) {
    if (clean === root) return root;
    if (clean.startsWith(`${root}/`)) {
      const segment = clean.split("/")[2]!;
      return suffixes.split(" ").includes(segment) ? `${root}/${segment}` : root;
    }
  }
  if (
    clean === "/messages/unread-count" ||
    clean === "/users/me" ||
    clean === "/users/me/relationships/counts"
  )
    return clean;
  if (clean.startsWith("/messages/with/")) return "/messages/with/:username";
  if (clean.startsWith("/messages/images/")) return "/messages/images/:id";
  if (clean === "/messages/images") return clean;
  for (const [root, label, suffixes] of [
    ["posts", "id", "comments like report view repost"],
    ["users", "username", "posts music follow friends"],
    ["messages", "id", "read items"],
    ["communities", "slug", "posts members join permissions"],
    ["wallpapers", "id", "report like save"],
  ] as const) {
    const group = `/${root}`;
    if (clean === group) return group;
    if (clean.startsWith(`${group}/`)) {
      const parts = clean.split("/");
      const suffix = parts[3];
      const prefix = `${group}/:${label}`;
      const route = suffix && suffixes.split(" ").includes(suffix) ? `${prefix}/${suffix}` : prefix;
      if (route === "/users/:username/friends" && parts[4] === "access") return `${route}/access`;
      if (route === "/messages/:id/items" && parts[4]) return `${route}/:messageId`;
      if (route === "/posts/:id/comments" && parts[4]) {
        return `/posts/:id/comments/:commentId${["like", "report"].includes(parts[5] ?? "") ? `/${parts[5]}` : ""}`;
      }
      return route;
    }
  }
  return "/other";
}

export function telemetryPage(path: string): string {
  const clean = path.split(/[?#]/, 1)[0]!.replace(/\/+$/, "") || "/";
  if (/^\/(?:explore|music|settings|notifications|login|register|news|search|contact|plus|friends|verify-email|forgot-password|reset-password|confirm-email-change|insights)?$/.test(clean)) return clean;
  if (/^\/u\/[^/]+$/.test(clean)) return "/u/:username";
  if (/^\/u\/[^/]+\/music$/.test(clean)) return "/u/:username/music";
  if (/^\/c\/[^/]+$/.test(clean)) return "/c/:slug";
  if (/^\/friends\/[^/]+$/.test(clean)) return "/friends/:username";
  return telemetryRoute(clean);
}

export const requestIdPattern = /^(?:[0-9]{1,12}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i;
export const cfRayPattern = /^[a-f0-9]{16,32}(?:-[a-z]{3})?$/i;
export const clientNetworkEventSchema = z
  .object({
    kind: z.enum(networkKinds).exclude(["closed"]),
    method: z.enum(telemetryMethods),
    route: z.string().startsWith("/").max(100),
    at: z.number().int().nonnegative(),
    status: z
      .number()
      .int()
      .min(429)
      .max(599)
      .refine((code) => code === 429 || code >= 500)
      .optional(),
    limiter: z.enum(telemetryLimiters).optional(),
    retryAfter: z.number().int().min(0).max(86_400).optional(),
    requestId: z.string().regex(requestIdPattern).optional(),
    cfRay: z.string().regex(cfRayPattern).optional(),
  })
  .strict()
  .refine((event) => (event.kind === "http") === (event.status !== undefined));

export const clientNetworkBatchSchema = z
  .object({ events: z.array(clientNetworkEventSchema).min(1).max(10) })
  .strict();
export type ClientNetworkEvent = z.infer<typeof clientNetworkEventSchema>;
export const telemetryQuerySchema = z.object({ hours: z.enum(["1", "24", "168"]).default("24") });
export type TelemetryHours = z.infer<typeof telemetryQuerySchema>["hours"];

export interface ApiMetricRow {
  method: string;
  route: string;
  count: number;
  limited: number;
  serverErrors: number;
  clientErrors: number;
  p95Ms: number | null;
  p99Ms: number | null;
}

export interface NetworkIncidentRow {
  source: "api" | "web";
  kind: (typeof networkKinds)[number];
  method: string;
  route: string;
  status: number | null;
  limiter: string | null;
  limit: number | null;
  windowSeconds: number | null;
  retryAfter: number | null;
  requestId: string | null;
  cfRay: string | null;
  count: number;
  firstSeen: string;
  lastSeen: string;
}

export interface MetricsReport {
  from: string;
  until: string;
  total: ApiMetricRow;
  rows: ApiMetricRow[];
}

export interface NetworkReport {
  from: string;
  until: string;
  rows: NetworkIncidentRow[];
}
