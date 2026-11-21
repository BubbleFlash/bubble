import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { rateLimitDefaults, type RateLimitName, type RateLimitRule } from "@commune/shared";
import { logger } from "../config/logger.js";
import { RateLimitSettings, type StoredRateLimitRules } from "../models/RateLimitSettings.js";

const settingsId = "rate-limits";
const cacheMs = 5_000;
const defaultPolicy = { enabled: false, revision: "", captchaRevision: null as string | null, rules: {} as StoredRateLimitRules };
let lastKnown = defaultPolicy;
let cached: { expiresAt: number; value: Promise<typeof defaultPolicy> } | undefined;

export async function readRateLimitSettings() {
  const row = await RateLimitSettings.findById(settingsId)
    .setOptions({ timeoutMS: 1_000 })
    .lean();
  return row ? {
    enabled: row.enabled,
    revision: row.revision,
    captchaRevision: row.captchaRevision ?? null,
    rules: row.rules ?? {},
  } : defaultPolicy;
}

export function rateLimitPolicy(): Promise<typeof defaultPolicy> {
  if (mongoose.connection.readyState !== 1) return Promise.resolve(lastKnown);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = readRateLimitSettings()
    .then((policy) => {
      if (cached?.value !== value) return rateLimitPolicy();
      lastKnown = policy;
      return policy;
    })
    .catch((error: unknown) => {
      logger.warn({ err: error }, "Could not refresh rate limit settings");
      return lastKnown;
    });
  cached = { expiresAt: Date.now() + cacheMs, value };
  return value;
}

async function updateSettings(fields: Record<string, unknown>) {
  await RateLimitSettings.updateOne({ _id: settingsId }, [{ $set: fields }], { upsert: true });
  cached = undefined;
}

export function saveRateLimitSettings(enabled: boolean) {
  return updateSettings({
    enabled,
    revision: { $cond: [{ $eq: ["$enabled", enabled] }, "$revision", randomUUID()] },
  });
}

export function saveCaptchaSettings(enabled: boolean) {
  return updateSettings({
    enabled: { $ifNull: ["$enabled", false] },
    revision: { $ifNull: ["$revision", ""] },
    captchaRevision: enabled ? { $ifNull: ["$captchaRevision", randomUUID()] } : null,
  });
}

export function saveRateLimitRule(name: RateLimitName, rule: RateLimitRule) {
  const field = `rules.${name}`;
  const defaults = rateLimitDefaults[name];
  const ruleUnchanged = {
    $and: [
      { $eq: [{ $ifNull: [`$${field}.enabled`, true] }, rule.enabled] },
      { $eq: [{ $ifNull: [`$${field}.limit`, defaults.limit] }, rule.limit] },
      { $eq: [{ $ifNull: [`$${field}.windowSeconds`, defaults.windowSeconds] }, rule.windowSeconds] },
    ],
  };
  return updateSettings({
    enabled: { $ifNull: ["$enabled", false] },
    revision: { $ifNull: ["$revision", ""] },
    [field]: {
      ...rule,
      revision: { $cond: [ruleUnchanged, { $ifNull: [`$${field}.revision`, ""] }, randomUUID()] },
    },
  });
}
