import { Schema, model } from "mongoose";
import type { RateLimitName, RateLimitRule } from "@commune/shared";

export type StoredRateLimitRules = Partial<Record<RateLimitName, RateLimitRule & { revision: string }>>;

interface Settings {
  _id: string;
  enabled: boolean;
  revision: string;
  captchaRevision?: string | null;
  registrationClosed?: boolean;
  rules?: StoredRateLimitRules;
}

const schema = new Schema<Settings>({
  _id: { type: String, default: "rate-limits" },
  enabled: { type: Boolean, required: true },
  revision: { type: String, required: true },
  captchaRevision: { type: String },
  registrationClosed: { type: Boolean },
  rules: { type: Schema.Types.Mixed },
});

export const RateLimitSettings = model("RateLimitSettings", schema);
