import { contentModerationFields } from "./moderationFields.js";
import { Schema, model } from "mongoose";
import { postVisibilitySchema } from "@commune/shared";
import { repostSource } from "./repostSource.js";

const postSchema = new Schema(
  {
    ...contentModerationFields,
    author: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    content: { type: String, trim: true, maxlength: 2000, default: "" },
    imageUrl: { type: String, default: null, index: true, sparse: true },
    imageUrls: { type: [String], default: [] },
    musicTrackIds: { type: [{ type: Schema.Types.ObjectId, ref: "MusicTrack" }], default: [] },
    // Set when the post was made inside a community.
    community: { type: Schema.Types.ObjectId, ref: "Community", default: null, index: true },
    hideAuthor: { type: Boolean, default: false },
    adult: { type: Boolean, default: false },
    visibility: { type: String, enum: postVisibilitySchema.options, default: "public" },
    repost: { type: repostSource },
    // Oldest first. These ids survive deletion of an ancestor so descendants remain countable.
    repostAncestors: { type: [Schema.Types.ObjectId], default: undefined, index: true },
    // Legacy records are kept for historical sales but are excluded from the site.
    priceCents: { type: Number, default: null, min: 100 },
    premiumContent: { type: String, select: false },
    viewCount: { type: Number, default: 0, min: 0 },
    likeCount: { type: Number, default: 0, min: 0 },
    commentCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// Feeds list posts newest first (sorted by _id), for everyone, for the people you follow and per
// community. These indexes let MongoDB read exactly one page instead of sorting many posts.
postSchema.index({ author: 1, _id: -1 });
postSchema.index({ community: 1, _id: -1 });
postSchema.index({ imageUrls: 1 }, { sparse: true });
postSchema.index({ moderationState: 1, _id: -1 });

// Full-text search over the free text only. premiumContent is deliberately NOT indexed, so
// searching can never reveal paid content.
postSchema.index({ content: "text" });

export const Post = model("Post", postSchema);
