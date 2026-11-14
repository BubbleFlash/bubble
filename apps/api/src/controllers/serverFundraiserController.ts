import type { Request, Response } from "express";
import { getServerFundraiser } from "../services/serverFundraiser.js";
import { AppError } from "../utils/errors.js";

export async function get(_req: Request, res: Response) {
  try {
    const goal = await getServerFundraiser();
    res.set("Cache-Control", "no-store");
    res.json(goal);
  } catch {
    throw new AppError(503, "Server fundraiser is temporarily unavailable");
  }
}
