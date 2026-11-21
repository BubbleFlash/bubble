import { Schema, model } from "mongoose";

const counter = model("QuotaCounter", new Schema({
  _id: String,
  count: Number,
  targets: { type: [String], default: undefined },
  expiresAt: { type: Date, expires: 0 },
}));

/** Returns seconds until the next window, or zero if this request was admitted. */
export async function takeQuota(key: string, limit: number, windowSeconds: number, target?: string) {
  const windowMs = windowSeconds * 1000;
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const expiresAt = new Date(windowStart + windowMs);
  const id = `${key}:${windowStart}`;
  const targets = { $ifNull: ["$targets", []] };
  const update = [{ $set: {
    expiresAt,
    ...(target === undefined ? {
      count: { $min: [{ $add: [{ $ifNull: ["$count", 0] }, 1] }, limit + 1] },
    } : {
      // Requests racing to open the same conversation share its reservation.
      targets: { $cond: [{ $lt: [{ $size: targets }, limit] }, { $setUnion: [targets, [target]] }, targets] },
    }),
  } }];
  const increment = () => counter.findOneAndUpdate({ _id: id }, update, { upsert: true, new: true })
    .setOptions({ timeoutMS: 2_000 }).lean().orFail();
  const row = await increment().catch((error: unknown) => {
    // Another instance may have inserted the bucket while this upsert was in flight.
    if ((error as { code?: number }).code === 11000) return increment();
    throw error;
  });
  const admitted = target === undefined ? row.count! <= limit : row.targets!.includes(target);
  return admitted ? 0 : Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
}
