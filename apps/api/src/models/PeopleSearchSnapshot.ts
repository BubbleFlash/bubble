import { Schema, model } from "mongoose";

const schema = new Schema({
  user: { type: Schema.Types.ObjectId, required: true },
  query: { type: String, default: "" },
  online: { type: [Schema.Types.ObjectId], default: [] },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

export const PeopleSearchSnapshot = model("PeopleSearchSnapshot", schema);
