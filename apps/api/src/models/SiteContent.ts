import { Schema, model } from "mongoose";

const schema = new Schema({
  _id: { type: String, default: "site-content" },
  rules: { type: String, maxlength: 30000 },
  benefits: { type: String, maxlength: 30000 },
  principles: { type: String, maxlength: 30000 },
  about: { type: String, maxlength: 30000 },
}, { timestamps: true });

export const SiteContent = model("SiteContent", schema);
