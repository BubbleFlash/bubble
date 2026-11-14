import { Schema, model } from "mongoose";
import { communityRoleSchema } from "@commune/shared";

const communitySchema = new Schema(
  {
    // URL-safe, lowercase, unique: /c/<slug>
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    description: { type: String, default: "", maxlength: 280 },
    avatarUrl: { type: String, default: null },
    creator: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Keys are Membership ids, so rejoining never inherits a previous grant.
    managers: {
      type: Map,
      of: { type: String, enum: ["admin", "editor"] },
      default: undefined,
    },
    managerNotes: { type: Map, of: String, default: undefined },
    hiddenTeam: { type: [Schema.Types.ObjectId], default: undefined },
    permissions: {
      publish: { type: String, enum: communityRoleSchema.options },
      managePosts: { type: String, enum: communityRoleSchema.options },
      editAppearance: { type: String, enum: communityRoleSchema.options },
    },
    accessVersion: Number,
    departingMemberships: { type: [Schema.Types.ObjectId], default: undefined },
    // Kept in step with Membership rows (like likeCount on posts) so lists need no counting.
    memberCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// "Most popular first" lists.
communitySchema.index({ memberCount: -1, _id: -1 });

export const Community = model("Community", communitySchema);
