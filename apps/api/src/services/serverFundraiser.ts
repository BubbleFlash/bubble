import { z } from "zod";
import type { ServerFundraiserDTO } from "@commune/shared";
import { FundraiserSettings } from "../models/FundraiserSettings.js";

const URL = "https://bubbleflash.github.io/fundraiser-worker/fundraiser.json";
const CACHE_MS = 15 * 60 * 1000;
const RETRY_MS = 30 * 1000;
const targetSchema = z.object({
  id: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(300),
  currency: z.literal("RUB"),
  current: z.number().finite().nonnegative(),
  target: z.number().finite().positive(),
  updatedAt: z.iso.datetime(),
});

type Goal = z.infer<typeof targetSchema>;
let cached: { value: Goal[]; expiresAt: number } | undefined;
let pending: Promise<Goal[]> | undefined;
let retryAt = 0;

export function clearServerFundraiserCache() {
  cached = undefined;
  pending = undefined;
  retryAt = 0;
}

export async function getFundraiserGoals(): Promise<Goal[]> {
  const now = Date.now();
  if (cached && now < cached.expiresAt) return cached.value;
  if (now < retryAt) throw new Error("Fundraiser retry is pending");
  pending ??= (async () => {
    const response = await fetch(URL, { signal: AbortSignal.timeout(8000), redirect: "error" });
    if (!response.ok) throw new Error("Boosty request failed");
    const body: unknown = await response.json();
    const fresh = Array.isArray(body) ? z.array(targetSchema.extend({ id: z.number().int().positive() })).parse(body) : [targetSchema.parse(body)];
    cached = { value: fresh, expiresAt: Date.now() + CACHE_MS };
    return fresh;
  })().catch((error: unknown) => {
    retryAt = Date.now() + RETRY_MS;
    throw error;
  }).finally(() => { pending = undefined; });
  return pending;
}

export async function getServerFundraiser(): Promise<ServerFundraiserDTO> {
  const goals = await getFundraiserGoals();
  const settings = await FundraiserSettings.findById("fundraiser").lean();
  const goal = settings?.goalId == null ? goals[0] : goals.find((item) => item.id === settings.goalId);
  if (!goal) throw new Error("Selected fundraiser goal is unavailable");
  const { title, current, target, updatedAt } = goal;
  return { title, current, target, updatedAt };
}
