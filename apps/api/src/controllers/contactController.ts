import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { ContactMessage } from "../models/ContactMessage.js";
import { sendMail } from "../services/mailService.js";
import { contactMail } from "../services/emailTemplates.js";

export async function send(req: Request, res: Response) {
  const { name, email, message, website } = req.body as {
    name: string;
    email: string;
    message: string;
    website?: string;
  };

  // Honeypot filled in: pretend it worked so bots learn nothing.
  if (website) return void res.status(201).json({ ok: true });

  await ContactMessage.create({ name, email, message });

  if (env.CONTACT_EMAIL) {
    // Best effort: the message is already saved, so a mail failure must not fail the request.
    try {
      await sendMail(contactMail(env.CONTACT_EMAIL, name, email, message));
    } catch (err) {
      logger.error({ err: String(err) }, "Could not email contact message");
    }
  }
  res.status(201).json({ ok: true });
}
