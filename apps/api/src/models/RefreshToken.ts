import { Schema, model } from "mongoose";

const refreshTokenSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  sessionVersion: { type: Number, default: 0 },
  tokenHash: { type: String, required: true, unique: true },
  // MongoDB removes the document automatically once expiresAt has passed.
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

export const RefreshToken = model("RefreshToken", refreshTokenSchema);
