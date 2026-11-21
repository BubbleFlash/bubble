import { DISPLAY_NAME_MAX_LENGTH, musicSettingsSchema } from "@commune/shared";
import { moderationFields } from "./moderationFields.js";
import { Schema, model } from "mongoose";
import type { InferSchemaType } from "mongoose";

const userSchema = new Schema(
  {
    username: { type: String, required: true, trim: true, minlength: 3, maxlength: 24 },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, trim: true, maxlength: DISPLAY_NAME_MAX_LENGTH },
    bio: { type: String, default: "", maxlength: 160 },
    pinnedPost: { type: Schema.Types.ObjectId, ref: "Post" },
    mutedUsers: { type: [Schema.Types.ObjectId], default: undefined },
    mutedCommunities: { type: [Schema.Types.ObjectId], default: undefined },
    avatarUrl: { type: String, default: null, index: true, sparse: true },
    avatarFrame: {
      type: new Schema({
        effect: { type: String, enum: ["glow", "pulse"], required: true },
        color: { type: String, required: true, match: /^#[0-9a-f]{6}$/ },
        intensity: { type: Number, required: true, min: 1, max: 5 },
      }, { _id: false }),
      default: undefined,
    },
    shareProfileAppearance: { type: Boolean },
    profileAppearanceVisibility: { type: String, enum: ["everyone", "friends", "only_me"] },
    appearance: {
      backgroundUrl: { type: String, index: true, sparse: true },
      primaryColor: { type: String },
      accentColor: { type: String },
      windowOpacity: { type: Number },
      font: { type: String },
    },
    ...moderationFields,
    moderationRevision: { type: Number, default: 0 },
    sessionVersion: { type: Number, default: 0 },
    credentialsChangedAt: Date,
    deletionExpiresAt: { type: Date, index: true, sparse: true },
    anonymizedAt: Date,
    deletionCleanupPending: { type: Boolean, index: true, sparse: true },
    pendingEmail: {
      type: new Schema({
        address: { type: String, required: true },
        tokenHash: { type: String, required: true },
        expiresAt: { type: Date, required: true },
        sessionVersion: { type: Number, required: true },
      }, { _id: false }),
      default: undefined,
    },
    accountRestriction: { reason: String, until: Date },
    publishingRestriction: { reason: String, until: Date },
    role: { type: String, enum: ["user", "moderator", "admin"], default: "user" },
    banned: { type: Boolean, default: false },
    friendsVisibility: {
      type: String,
      enum: ["everyone", "friends", "only_me"],
      default: "everyone",
    },
    // Google account id ("sub"). Unset for password-only accounts, so the unique index is sparse.
    googleId: { type: String, unique: true, sparse: true },
    // Commune Plus access runs until this moment. Set by the payment webhook and checked
    // against the clock, so access ends on time even if a cancellation webhook is missed.
    plusUntil: { type: Date, default: null },
    emailVerified: { type: Boolean, default: false },
    registrationPending: { type: Boolean, default: false },
    // Which push notifications this person wants (they can still be turned off per device).
    pushMessages: { type: Boolean, default: true },
    pushSocial: { type: Boolean, default: true },
    notificationPreferences: {
      follow: { visible: Boolean, sound: Boolean },
      like: { visible: Boolean, sound: Boolean },
      comment: { visible: Boolean, sound: Boolean },
      repost: { visible: Boolean, sound: Boolean },
    },
    musicLibraryVisibility: { type: String, enum: musicSettingsSchema.shape.visibility.options, default: "everyone" },
    // Brute-force protection: consecutive wrong passwords, and the end of a temporary lock.
    failedLogins: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, default: null, select: false },
  },
  { timestamps: true },
);

// Case-insensitive unique usernames ("Sam" and "sam" are the same person).
userSchema.index({ username: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });
userSchema.index({ "pendingEmail.tokenHash": 1 }, { unique: true, sparse: true });

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model("User", userSchema);
