import { z } from "zod";
import type { ServerFundraiserDTO } from "@commune/shared";

const TARGET_ID = 842291;
const URL = "https://api.boosty.to/v1/target/bubblesocial/";
const CACHE_MS = 15 * 1000;
const targetSchema = z.object({
  id: z.number(),
  type: z.literal("money"),
  description: z.string().trim().min(1).max(300),
  bloggerCurrency: z.literal("RUB"),
  currentSum: z.number().finite().nonnegative(),
  targetSum: z.number().finite().positive(),
});

let cached: ServerFundraiserDTO | undefined;
let pending: Promise<ServerFundraiserDTO> | undefined;

export function clearServerFundraiserCache() {
  cached = undefined;
  pending = undefined;
}

export async function getServerFundraiser(): Promise<ServerFundraiserDTO> {
  if (cached && Date.now() - Date.parse(cached.updatedAt) < CACHE_MS) return cached;
  pending ??= (async () => {
    const response = await fetch(URL, { signal: AbortSignal.timeout(8000), redirect: "error" });
    if (!response.ok) throw new Error("Boosty request failed");
    const body: unknown = await response.json();
    const result = z.object({ data: z.array(z.unknown()) }).parse(body);
    const match = result.data.find((item) => typeof item === "object" && item !== null && "id" in item && item.id === TARGET_ID);
    const target = targetSchema.parse(match);
    const fresh = {
      title: target.description,
      current: target.currentSum,
      target: target.targetSum,
      updatedAt: new Date().toISOString(),
    };
    cached = fresh;
    return fresh;
  })().finally(() => { pending = undefined; });
  return pending;
}
