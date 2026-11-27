import { User } from "../models/User.js";
import { AuthToken } from "../models/AuthToken.js";
import { RefreshToken } from "../models/RefreshToken.js";
import { PushSubscription } from "../models/PushSubscription.js";
import { Subscription } from "../models/Subscription.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { badRequest, unauthorized } from "../utils/errors.js";
import { accountDeletedMail, accountRestoredMail } from "./emailTemplates.js";
import { sendMail } from "./mailService.js";

export function restorationDeadline(now: Date) {
  const deadline = new Date(now);
  const day = deadline.getUTCDate();
  deadline.setUTCDate(1);
  deadline.setUTCMonth(deadline.getUTCMonth() + 7);
  const lastDay = new Date(Date.UTC(deadline.getUTCFullYear(), deadline.getUTCMonth() + 1, 0)).getUTCDate();
  deadline.setUTCDate(Math.min(day, lastDay));
  return deadline;
}

export async function requestAccountDeletion(userId: string) {
  const renewing = await Subscription.exists({
    user: userId, provider: "lemonsqueezy", cancelled: false,
    status: { $nin: ["expired", "cancelled"] },
  });
  if (renewing) throw badRequest("Cancel your renewing subscription before deleting your account");
  const deadline = restorationDeadline(new Date());
  const user = await User.findOneAndUpdate(
    { _id: userId, deletionExpiresAt: null, anonymizedAt: null },
    { $set: { deletionExpiresAt: deadline }, $inc: { sessionVersion: 1 }, $unset: { pendingEmail: 1 } },
    { new: true },
  );
  if (!user) throw unauthorized("Session expired");
  await RefreshToken.deleteMany({ user: userId, $or: [
    { sessionVersion: { $lt: user.sessionVersion } }, { sessionVersion: null },
  ] }).catch((err: unknown) => logger.warn({ err }, "Could not clean up old refresh tokens"));
  void sendMail(accountDeletedMail(user.email, user.displayName || user.username, deadline, `${env.CLIENT_ORIGIN}/login`))
    .catch((err: unknown) => logger.warn({ err }, "Could not send account deletion notice"));
  return deadline;
}

export async function restoreAccountOnLogin<T extends {
  _id: unknown; email: string; username: string; displayName?: string | null;
  deletionExpiresAt?: Date | null; anonymizedAt?: Date | null;
}>(user: T) {
  if (user.anonymizedAt) throw unauthorized("Invalid email or password");
  if (!user.deletionExpiresAt) return;
  const restored = await User.updateOne(
    { _id: user._id, deletionExpiresAt: { $eq: user.deletionExpiresAt, $gt: new Date() }, anonymizedAt: null },
    { $unset: { deletionExpiresAt: 1 } },
  );
  if (!restored.modifiedCount) throw unauthorized("Invalid email or password");
  user.deletionExpiresAt = undefined;
  void sendMail(accountRestoredMail(user.email, user.displayName || user.username, env.CLIENT_ORIGIN))
    .catch((err: unknown) => logger.warn({ err }, "Could not send account restoration notice"));
}

/** Keep a tombstone for author and moderation references while removing profile and login data. */
export async function anonymizeExpiredAccounts(now = new Date()) {
  const due = await User.find({ deletionExpiresAt: { $lte: now }, anonymizedAt: null }).select("_id").limit(100).lean();
  for (const { _id } of due) {
    await User.updateOne(
      { _id, deletionExpiresAt: { $lte: now }, anonymizedAt: null },
      {
        $set: {
          username: `deleted-${_id}`, email: `deleted-${_id}`, displayName: "Пользователь недоступен",
          bio: "", avatarUrl: null, role: "user", emailVerified: false, plusUntil: null,
          pushMessages: false, pushSocial: false, anonymizedAt: now, deletionCleanupPending: true,
        },
        $unset: {
          deletionExpiresAt: 1, passwordHash: 1, googleId: 1, pendingEmail: 1, credentialsChangedAt: 1,
          appearance: 1, avatarFrame: 1, shareProfileAppearance: 1, profileAppearanceVisibility: 1, hideProfileFonts: 1,
          friendsVisibility: 1, musicLibraryVisibility: 1, notificationPreferences: 1, failedLogins: 1, lockUntil: 1,
        },
        $inc: { sessionVersion: 1 },
      },
    );
  }
  const pending = await User.find({ deletionCleanupPending: true }).select("_id").limit(100).lean();
  for (const { _id } of pending) {
    await Promise.all([
      RefreshToken.deleteMany({ user: _id }),
      AuthToken.deleteMany({ user: _id }),
      PushSubscription.deleteMany({ user: _id }),
    ]);
    await User.updateOne({ _id }, { $unset: { deletionCleanupPending: 1 } });
  }
}

export function startAccountDeletionWorker() {
  let running = false;
  const sweep = async () => {
    if (running) return;
    running = true;
    try {
      await anonymizeExpiredAccounts();
    } catch (err) {
      logger.error({ err }, "Could not anonymize expired accounts");
    } finally {
      running = false;
    }
  };
  void sweep();
  const timer = setInterval(() => void sweep(), 15 * 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
