import { Schema, model } from "mongoose";

const schema = new Schema({
  _id: { type: String, default: "main-feed" },
  pinnedPost: { type: Schema.Types.ObjectId, ref: "Post" },
});

export const FeedSettings = model("FeedSettings", schema);
