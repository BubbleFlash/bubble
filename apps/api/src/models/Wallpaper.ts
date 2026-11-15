import { moderationFields, contentModerationFields } from "./moderationFields.js";
import { Schema, model } from "mongoose";
import { REPORT_REASONS, WALLPAPER_NAME_MAX_LENGTH } from "@commune/shared";

const wallpaperSchema = new Schema(
  {
    ...contentModerationFields,
    author: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, trim: true, maxlength: WALLPAPER_NAME_MAX_LENGTH },
    imageUrl: { type: String, required: true, unique: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
wallpaperSchema.index({ moderationState: 1, _id: -1 });

const reactionSchema = new Schema({
  wallpaper: { type: Schema.Types.ObjectId, ref: "Wallpaper", required: true },
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  kind: { type: String, enum: ["like", "favorite"], required: true },
});
reactionSchema.index({ wallpaper: 1, kind: 1, user: 1 }, { unique: true });
reactionSchema.index({ user: 1, kind: 1, wallpaper: 1 });

const reportSchema = new Schema(
  {
    ...moderationFields,
    status: { type: String, enum: ["open", "resolved", "dismissed"], default: "open" },
    decision: String,
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    resolvedAt: Date,
    wallpaper: { type: Schema.Types.ObjectId, ref: "Wallpaper", required: true },
    reporter: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, enum: [...REPORT_REASONS], required: true },
    details: { type: String, default: "", maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
reportSchema.index({ reporter: 1, wallpaper: 1 }, { unique: true });

export const Wallpaper = model("Wallpaper", wallpaperSchema);
export const WallpaperReaction = model("WallpaperReaction", reactionSchema);
export const WallpaperReport = model("WallpaperReport", reportSchema);
