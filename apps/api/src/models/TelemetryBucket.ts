import { Schema, model } from "mongoose";

const telemetryBucketSchema = new Schema(
  {
    _id: { type: String, required: true },
    bucket: { type: Date, required: true, expires: 8 * 24 * 60 * 60 },
    source: { type: String, required: true },
    method: { type: String, required: true },
    route: { type: String, required: true },
    kind: { type: String, required: true },
    status: { type: Number, default: null },
    limiter: { type: String, default: null },
    limit: { type: Number, default: null },
    windowSeconds: { type: Number, default: null },
    count: { type: Number, required: true },
    // Sparse histogram with a fixed set of numeric bucket indexes.
    histogram: Schema.Types.Mixed,
    firstSeen: { type: Date, required: true },
    lastSeen: { type: Date, required: true },
    sample: Schema.Types.Mixed,
  },
  { versionKey: false },
);
telemetryBucketSchema.index({ source: 1, kind: 1, bucket: 1 });

export const TelemetryBucket = model("TelemetryBucket", telemetryBucketSchema);
