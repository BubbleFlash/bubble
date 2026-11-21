import type { Request, Response } from "express";
import { z } from "zod";
import { FundraiserSettings } from "../models/FundraiserSettings.js";
import { getFundraiserGoals } from "../services/serverFundraiser.js";
import { badRequest } from "../utils/errors.js";

export async function getSettings(_req: Request, res: Response) {
  const [goals, settings] = await Promise.all([getFundraiserGoals(), FundraiserSettings.findById("fundraiser").lean()]);
  res.json({ goals, goalId: settings?.goalId ?? goals[0]?.id ?? null });
}

export async function updateSettings(req: Request, res: Response) {
  const input = z.strictObject({ goalId: z.number().int().positive() }).safeParse(req.body);
  if (!input.success) throw badRequest("Invalid goal");
  const goals = await getFundraiserGoals();
  if (!goals.some((goal) => goal.id === input.data.goalId)) throw badRequest("Goal not found");
  await FundraiserSettings.findByIdAndUpdate("fundraiser", { $set: input.data }, { upsert: true });
  res.json(input.data);
}
