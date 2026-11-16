import { Schema, Types } from "mongoose";

export const moderationEventSchema = new Schema(
  {
    actor: { type: String, required: true },
    actorRole: { type: String, required: true },
    action: { type: String, required: true },
    reason: { type: String, required: true },
    time: { type: Date, required: true },
    until: Date,
    reportId: String,
    warningId: String,
  },
  { _id: true },
);

export const moderationFields = {
  moderationEvents: { type: [moderationEventSchema], default: undefined },
};

export const contentModerationFields = {
  ...moderationFields,
  purgedAt: Date,
  deletionPending: Boolean,
  deletionPendingImages: { type: [String], default: undefined },
  moderationState: { type: String, enum: ["published", "hidden", "removed", "withdrawn"] },
};

export const visibleContent = { moderationState: { $nin: ["hidden", "removed", "withdrawn"] } };

export function moderationEvent(
  actor: string,
  actorRole: string,
  action: string,
  reason: string,
  extra?: { until?: Date; reportId?: string; warningId?: string },
) {
  return {
    _id: new Types.ObjectId(),
    actor,
    actorRole,
    action,
    reason,
    time: new Date(),
    ...extra,
  };
}
