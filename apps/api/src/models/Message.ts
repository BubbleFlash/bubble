import { Schema, model } from "mongoose";
import { repostSource } from "./repostSource.js";

const messageSchema = new Schema({
  conversation: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
  sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, default: "", maxlength: 1000 },
  musicTrackIds: {
    type: [{ type: Schema.Types.ObjectId, ref: "MusicTrack" }],
    validate: {
      validator: (ids: unknown[]) => ids.length <= 10 && new Set(ids.map(String)).size === ids.length,
      message: "Music attachments must contain at most 10 distinct tracks",
    },
  },
  imageIds: { type: [{ type: Schema.Types.ObjectId, ref: "MessageImage" }], default: [] },
  repost: { type: repostSource },
  repostAncestors: { type: [Schema.Types.ObjectId], default: undefined },
  clientMessageId: { type: String },
  createdAt: { type: Date, default: Date.now },
  editedAt: { type: Date },
});

messageSchema.index({ conversation: 1, createdAt: -1, _id: -1 });
messageSchema.index({ imageIds: 1 });
messageSchema.index({ repostAncestors: 1 });
messageSchema.index({ "repost.post": 1 });

export const Message = model("Message", messageSchema);
