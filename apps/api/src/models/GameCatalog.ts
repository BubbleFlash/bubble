import { Schema, model } from "mongoose";

const game = new Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  logoUrl: { type: String, default: null },
}, { _id: false });

export const GameCatalog = model("GameCatalog", new Schema({
  _id: String,
  items: { type: [game], default: [] },
}));
