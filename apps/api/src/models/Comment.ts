import { contentModerationFields } from "./moderationFields.js";
import { Schema, model } from "mongoose";

const commentSchema = new Schema(
  {
    ...contentModerationFields,
    post: { type: Schema.Types.ObjectId, ref: "Post", required: true },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true, trim: true, maxlength: 300 },
    parent: { type: Schema.Types.ObjectId, ref: "Comment" },
    mention: { name: { type: String }, username: { type: String } },
  },
  { timestamps: true },
);

commentSchema.index({ post: 1, _id: 1 });
commentSchema.index({ post: 1, parent: 1 });
commentSchema.index({ moderationState: 1, _id: -1 });

export const Comment = model("Comment", commentSchema);
