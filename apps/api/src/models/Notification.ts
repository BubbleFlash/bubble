import { Schema, model } from "mongoose";
import { notificationTypes } from "@commune/shared";

const notificationSchema = new Schema({
  // Who receives the notification.
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  // Who caused it.
  actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: notificationTypes, required: true },
  post: { type: Schema.Types.ObjectId, ref: "Post", default: null },
  comment: { type: Schema.Types.ObjectId, ref: "Comment" },
  postComment: { type: Boolean, default: false },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

notificationSchema.index({ user: 1, createdAt: -1, _id: -1 });
notificationSchema.index({ user: 1, read: 1 });
notificationSchema.index({ post: 1 });

export const Notification = model("Notification", notificationSchema);
