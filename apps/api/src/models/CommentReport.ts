import { Schema, model, type Types } from "mongoose";
import { REPORT_REASONS, REPORT_STATUSES } from "@commune/shared";
import { moderationFields } from "./moderationFields.js";

const schema = new Schema({
  ...moderationFields,
  decision: String,
  snapshot: { content: String, author: Schema.Types.ObjectId, parent: Schema.Types.ObjectId },
  reporter: { type: Schema.Types.ObjectId, ref: "User", required: true },
  // CMS stores the comment ID in `post`. The earlier format stores the parent post ID there.
  post: { type: Schema.Types.ObjectId, required: true },
  comment: { type: Schema.Types.ObjectId, ref: "Comment", required: true },
  reason: { type: String, enum: [...REPORT_REASONS], required: true },
  details: { type: String, default: "", maxlength: 300 },
  status: { type: String, enum: [...REPORT_STATUSES], default: "open" },
  resolvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  resolvedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});
schema.index({ reporter: 1, comment: 1 }, {
  name: "reporter_comment_present",
  unique: true,
  partialFilterExpression: { comment: { $type: "objectId" } },
});
schema.index({ status: 1, _id: -1 });
schema.index({ post: 1 });
export const CommentReport = model("CommentReport", schema);

export function commentReportTarget(commentId: string | Types.ObjectId) {
  return { $or: [{ comment: commentId }, { comment: { $exists: false }, post: commentId }] };
}

export function commentReportsForPost(postId: string, commentIds: Types.ObjectId[] = []) {
  return {
    $or: [
      { "snapshot.parent": postId },
      { post: postId, comment: { $exists: true } },
      { comment: { $exists: false }, post: { $in: commentIds } },
    ],
  };
}
