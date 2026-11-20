import { Schema, model } from "mongoose";

const schema = new Schema({
  _id: { type: String, default: "site-team" },
  developers: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
  artists: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
  testers: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
}, { timestamps: true });

export const SiteTeamSettings = model("SiteTeamSettings", schema);
