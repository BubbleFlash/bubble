import { z } from "zod";
import type { ServerFundraiserDTO } from "@commune/shared";

const URL = "https://bubbleflash.github.io/fundraiser-worker/fundraiser.json";
const CACHE_MS = 15 * 60 * 1000;
const RETRY_MS = 30 * 1000;
const targetSchema = z.object({
  title: z.string().trim().min(1).max(300),
  currency: z.literal("RUB"),
  current: z.number().finite().nonnegative(),
  target: z.number().finite().positive(),
  updatedAt: z.iso.datetime(),
});

let cached: { value: ServerFundraiserDTO; expiresAt: number } | undefined;
let pending: Promise<ServerFundraiserDTO> | undefined;
let retryAt = 0;

export function clearServerFundraiserCache() {
  cached = undefined;
  pending = undefined;
  retryAt = 0;
}

export async function getServerFundraiser(): Promise<ServerFundraiserDTO> {
  const now = Date.now();
  if (cached && now < cached.expiresAt) return cached.value;
  if (now < retryAt) throw new Error("Fundraiser retry is pending");
  pending ??= (async () => {
    const response = await fetch(URL, { signal: AbortSignal.timeout(8000), redirect: "error" });
    if (!response.ok) throw new Error("Boosty request failed");
    const { title, current, target, updatedAt } = targetSchema.parse(await response.json());
    const fresh = { title, current, target, updatedAt };
    cached = { value: fresh, expiresAt: Date.now() + CACHE_MS };
    return fresh;
  })().catch((error: unknown) => {
    retryAt = Date.now() + RETRY_MS;
    throw error;
  }).finally(() => { pending = undefined; });
  return pending;
}
