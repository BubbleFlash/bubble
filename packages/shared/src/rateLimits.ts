import { z } from "zod";

export const rateLimitDefaults = {
  "global-ip": { limit: 300, windowSeconds: 900 },
  "global-account": { limit: 300, windowSeconds: 900 },
  "refresh-lookup-ip": { limit: 300, windowSeconds: 900 },
  "refresh-ip": { limit: 20, windowSeconds: 900 },
  "refresh-account": { limit: 20, windowSeconds: 900 },
  auth: { limit: 20, windowSeconds: 900 },
  email: { limit: 5, windowSeconds: 900 },
  search: { limit: 40, windowSeconds: 60 },
  public: { limit: 60, windowSeconds: 60 },
  "public-account": { limit: 60, windowSeconds: 60 },
  "link-preview": { limit: 40, windowSeconds: 60 },
  "post-view-account": { limit: 200, windowSeconds: 900 },
  upload: { limit: 30, windowSeconds: 900 },
  report: { limit: 10, windowSeconds: 900 },
  "community-create": { limit: 10, windowSeconds: 3600 },
  message: { limit: 60, windowSeconds: 600 },
  "chat-create": { limit: 20, windowSeconds: 3600 },
  "messages-read": { limit: 300, windowSeconds: 600 },
  push: { limit: 30, windowSeconds: 600 },
  "push-test": { limit: 3, windowSeconds: 600 },
  checkout: { limit: 20, windowSeconds: 900 },
  contact: { limit: 5, windowSeconds: 3600 },
  "client-error": { limit: 20, windowSeconds: 600 },
  "client-network": { limit: 20, windowSeconds: 600 },
};

export type RateLimitName = keyof typeof rateLimitDefaults;
export const rateLimitNames = Object.keys(rateLimitDefaults) as RateLimitName[];
export const rateLimitNameSchema = z.enum(rateLimitNames);

// Node timers accept delays up to 2^31 − 1 milliseconds.
export const maxRateLimitWindowSeconds = Math.floor(2_147_483_647 / 1000);
export const rateLimitRuleSchema = z.strictObject({
  enabled: z.boolean(),
  limit: z.int().positive(),
  windowSeconds: z.int().min(1).max(maxRateLimitWindowSeconds),
});

export type RateLimitRule = z.infer<typeof rateLimitRuleSchema>;
export type RateLimitSettingsDTO = { enabled: boolean; rules: Record<RateLimitName, RateLimitRule> };
