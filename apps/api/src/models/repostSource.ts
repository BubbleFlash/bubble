import { Schema } from "mongoose";

export const repostSource = new Schema(
  {
    post: { type: Schema.Types.ObjectId, ref: "Post", required: true },
    comment: { type: Schema.Types.ObjectId, ref: "Comment" },
  },
  { _id: false },
);
