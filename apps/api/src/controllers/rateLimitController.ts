import type { Request, Response } from "express";
import {
  rateLimitDefaults,
  rateLimitNames,
  rateLimitNameSchema,
  rateLimitRuleSchema,
  type RateLimitSettingsDTO,
} from "@commune/shared";
import { z } from "zod";
import { readRateLimitSettings, saveRateLimitRule, saveRateLimitSettings } from "../services/rateLimitSettings.js";
import { badRequest } from "../utils/errors.js";

const schema = z.strictObject({ enabled: z.boolean() });

export async function getSettings(_req: Request, res: Response) {
  const settings = await readRateLimitSettings();
  const rules = Object.fromEntries(rateLimitNames.map((name) => {
    const { enabled, limit, windowSeconds } = settings.rules[name] ?? { enabled: true, ...rateLimitDefaults[name] };
    return [name, { enabled, limit, windowSeconds }];
  })) as RateLimitSettingsDTO["rules"];
  res.json({ enabled: settings.enabled, rules } satisfies RateLimitSettingsDTO);
}

export async function updateSettings(req: Request, res: Response) {
  const input = schema.safeParse(req.body);
  if (!input.success) throw badRequest("Invalid rate limit settings");
  const { enabled } = input.data;
  await saveRateLimitSettings(enabled);
  res.json({ enabled });
}

export async function updateRule(req: Request, res: Response) {
  const name = rateLimitNameSchema.safeParse(req.params.name);
  const rule = rateLimitRuleSchema.safeParse(req.body);
  if (!name.success || !rule.success) throw badRequest("Invalid rate limit rule");
  await saveRateLimitRule(name.data, rule.data);
  res.json(rule.data);
}
