import { Schema, model } from "mongoose";

const schema = new Schema({
  _id: { type: String, default: "test-gate" },
  enabled: { type: Boolean, default: false },
  username: { type: String, default: "" },
  passwordHash: { type: String, default: "", select: false },
  version: { type: String, required: true },
}, { timestamps: true });

export const TestGateSettings = model("TestGateSettings", schema);
