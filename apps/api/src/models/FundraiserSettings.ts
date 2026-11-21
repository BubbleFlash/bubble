import { Schema, model } from "mongoose";

const schema = new Schema({
  _id: { type: String, default: "fundraiser" },
  goalId: { type: Number, default: null },
});

export const FundraiserSettings = model("FundraiserSettings", schema);
