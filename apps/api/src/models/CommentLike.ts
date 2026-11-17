import { Schema, model } from "mongoose";

const schema = new Schema({
  post: { type: Schema.Types.ObjectId, ref: "Post", required: true, index: true },
  comment: { type: Schema.Types.ObjectId, ref: "Comment", required: true },
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
});

schema.index({ comment: 1, user: 1 }, { unique: true });

export const CommentLike = model("CommentLike", schema);
