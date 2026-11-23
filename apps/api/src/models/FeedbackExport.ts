import { model, Schema } from "mongoose";

const feedbackExportSchema = new Schema({
  _id: { type: String, required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  exportedAt: { type: Date, required: true },
});

export const FeedbackExport = model("FeedbackExport", feedbackExportSchema);
