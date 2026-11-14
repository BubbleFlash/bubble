import type { Request, Response } from "express";
import { Report } from "../models/Report.js";
import { loadReadablePostAuthor } from "../services/postAccess.js";
import { badRequest, conflict } from "../utils/errors.js";
import { idParam } from "../utils/params.js";

export async function createReport(req: Request, res: Response) {
  const id = idParam(req, "id");
  const author = await loadReadablePostAuthor(id, req.userId!);
  if (String(author) === req.userId) throw badRequest("You can't report your own post");

  try {
    await Report.create({
      reporter: req.userId,
      post: id,
      reason: req.body.reason,
      details: req.body.details ?? "",
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw conflict("You already reported this post");
    }
    throw err;
  }
  res.status(201).json({ ok: true });
}
