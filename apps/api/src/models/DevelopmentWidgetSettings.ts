import { Schema, model } from "mongoose";

const schema = new Schema({
  _id: { type: String, default: "development-widget" },
  communitySlug: { type: String, default: "" },
});

export const DevelopmentWidgetSettings = model("DevelopmentWidgetSettings", schema);
