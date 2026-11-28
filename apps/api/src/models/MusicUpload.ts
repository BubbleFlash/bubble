import { Schema, model } from "mongoose";
import { musicUploadStages } from "@commune/shared";

const musicUploadSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    storageKey: {
      type: String,
      required: true,
      unique: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    artist: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    mimeType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
      min: 1,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    completedTrackId: {
      type: Schema.Types.ObjectId,
      ref: "MusicTrack",
      default: null,
    },
    normalizeToMp3: Boolean,
    sourceETag: String,
    nextAttemptAt: Date,
    attempts: Number,
    failed: Boolean,
    stage: { type: String, enum: musicUploadStages },
    processedSeconds: Number,
    progressPercent: Number,
    retryReason: { type: String, enum: ["tools_unavailable", "processing_error"] },
  },
  { timestamps: true },
);

musicUploadSchema.index({ userId: 1, createdAt: -1 });
musicUploadSchema.index({ nextAttemptAt: 1 }, { sparse: true });

export const MusicUpload = model("MusicUpload", musicUploadSchema);
