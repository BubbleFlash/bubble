import { assertAccountAllowed } from "../services/restrictions.js";
import type { Request, Response } from "express";
import * as accountService from "../services/accountService.js";
import { User } from "../models/User.js";
import { notFound } from "../utils/errors.js";
import { clearRefreshCookie, issueVerifiedRegistrationSession } from "../services/authService.js";
import { requestAccountDeletion } from "../services/accountDeletion.js";

export async function forgotPassword(req: Request, res: Response) {
  await accountService.requestPasswordReset((req.body as { email: string }).email);
  // Same answer for every address so the endpoint can't be used to find registered emails.
  res.status(202).json({ message: "If that email has an account, a reset link is on its way." });
}

export async function resetPassword(req: Request, res: Response) {
  const { token, password } = req.body as { token: string; password: string };
  await accountService.resetPassword(token, password);
  res.status(204).end();
}

export async function verifyEmail(req: Request, res: Response) {
  const userId = await accountService.verifyEmail((req.body as { token: string }).token);
  if (userId) {
    res.json(await issueVerifiedRegistrationSession(res, userId));
    return;
  }
  res.status(204).end();
}

export async function resendVerification(req: Request, res: Response) {
  const user = await User.findById(req.userId).select("email username displayName emailVerified banned accountRestriction sessionVersion").lean();
  if (!user) throw notFound("User not found");
  assertAccountAllowed(user);
  if (!user.emailVerified) await accountService.sendVerificationEmail(user);
  res.status(204).end();
}

export async function changePassword(req: Request, res: Response) {
  await accountService.changePassword(req.userId!, req.body.currentPassword, req.body.password);
  clearRefreshCookie(res);
  res.status(204).end();
}

export async function changeEmail(req: Request, res: Response) {
  await accountService.requestEmailChange(req.userId!, req.body.currentPassword, req.body.email);
  res.status(202).end();
}

export async function confirmEmailChange(req: Request, res: Response) {
  await accountService.confirmEmailChange(req.body.token);
  res.status(204).end();
}

export async function deleteAccount(req: Request, res: Response) {
  const deadline = await requestAccountDeletion(req.userId!);
  clearRefreshCookie(res);
  res.json({ restoreUntil: deadline.toISOString() });
}
