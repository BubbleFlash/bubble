import { accountRestriction } from "./restrictions.js";
import bcrypt from "bcryptjs";
import { env, isProd } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AuthToken } from "../models/AuthToken.js";
import { RefreshToken } from "../models/RefreshToken.js";
import { User } from "../models/User.js";
import { AppError, badRequest, conflict, unauthorized } from "../utils/errors.js";
import { generateRefreshToken, hashToken } from "../utils/tokens.js";
import { emailChangeMail, emailChangedMail, passwordChangedMail, resetPasswordMail, verifyEmailMail } from "./emailTemplates.js";
import { sendMail } from "./mailService.js";

type Purpose = "verify_email" | "reset_password";

const TTL_MS: Record<Purpose, number> = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 60 * 60 * 1000,
};

/** Replaces any earlier token of this kind for the user and returns the new raw token. */
async function createToken(user: Recipient, purpose: Purpose) {
  const { token, hash } = generateRefreshToken();
  await AuthToken.deleteMany({ user: user._id, purpose });
  await AuthToken.create({
    user: user._id,
    email: user.email,
    sessionVersion: user.sessionVersion ?? 0,
    purpose,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + TTL_MS[purpose]),
  });
  return token;
}

/** Consumes a token (single use). Returns the user id, or throws if unknown or expired. */
async function consumeToken(raw: string, purpose: Purpose) {
  const record = await AuthToken.findOneAndDelete({ tokenHash: hashToken(raw), purpose });
  if (!record || record.expiresAt.getTime() < Date.now()) {
    throw badRequest("This link is invalid or has expired");
  }
  return record;
}

interface Recipient {
  _id: unknown;
  email: string;
  username: string;
  displayName?: string | null;
  sessionVersion?: number | null;
}

function versionFilter(version?: number | null) {
  return version ? { sessionVersion: version } : { sessionVersion: { $in: [null, 0] } };
}

function tokenAccount(record: Awaited<ReturnType<typeof consumeToken>>) {
  return {
    _id: record.user,
    anonymizedAt: null,
    ...(record.email ? { email: record.email, ...versionFilter(record.sessionVersion) } : { credentialsChangedAt: null }),
  };
}

export async function sendVerificationEmail(user: Recipient) {
  if (isProd && !env.RESEND_API_KEY) throw new AppError(503, "Email delivery is unavailable");
  const token = await createToken(user, "verify_email");
  const link = `${env.CLIENT_ORIGIN}/verify-email?token=${token}`;
  await sendMail(verifyEmailMail(user.email, user.displayName || user.username, link));
}

/** For flows where the caller must not wait on, or learn about, email delivery. */
export function sendVerificationEmailInBackground(user: Recipient) {
  sendVerificationEmail(user).catch((err: unknown) =>
    logger.error({ err }, "Could not send verification email"),
  );
}

export async function verifyEmail(raw: string) {
  const record = await consumeToken(raw, "verify_email");
  const user = await User.findOneAndUpdate({ ...tokenAccount(record), deletionExpiresAt: null }, { $set: { emailVerified: true, registrationPending: false } }, { new: false });
  if (!user) throw badRequest("This link is invalid or has expired");
  return user.registrationPending ? user._id : null;
}

/** Always resolves, whether or not the email belongs to an account (no account discovery). */
export async function requestPasswordReset(email: string) {
  const user = await User.findOne({ email }).select("email username displayName banned accountRestriction sessionVersion deletionExpiresAt anonymizedAt").lean();
  if (!user || accountRestriction(user) || user.anonymizedAt || (user.deletionExpiresAt && user.deletionExpiresAt <= new Date())) return;
  const token = await createToken(user, "reset_password");
  const link = `${env.CLIENT_ORIGIN}/reset-password?token=${token}`;
  sendMail(resetPasswordMail(user.email, user.displayName || user.username, link)).catch((err: unknown) =>
    logger.error({ err }, "Could not send password reset email"),
  );
}

export async function resetPassword(raw: string, password: string) {
  const record = await consumeToken(raw, "reset_password");
  const passwordHash = await bcrypt.hash(password, 12);
  // Receiving the email also proves the mailbox is theirs, so mark it verified.
  const user = await User.findOneAndUpdate(
    { ...tokenAccount(record), $or: [{ deletionExpiresAt: null }, { deletionExpiresAt: { $gt: new Date() } }] },
    { $set: { passwordHash, emailVerified: true, failedLogins: 0, lockUntil: null, credentialsChangedAt: new Date() }, $inc: { sessionVersion: 1 }, $unset: { pendingEmail: 1 } },
    { new: true },
  );
  if (!user) throw badRequest("This link is invalid or has expired");
  // Sign the account out everywhere: a reset usually means someone else may have had access.
  await discardOlderSessions(user._id, user.sessionVersion);
  sendNotice(passwordChangedMail(user.email, user.displayName || user.username, `${env.CLIENT_ORIGIN}/login`));
}

function sendNotice(mail: Parameters<typeof sendMail>[0]) {
  void sendMail(mail).catch((err: unknown) => logger.warn({ err }, "Could not send account notice"));
}

async function discardOlderSessions(userId: unknown, version?: number | null) {
  await RefreshToken.deleteMany({ user: userId, $or: [{ sessionVersion: { $lt: version ?? 0 } }, { sessionVersion: null }] })
    .catch((err: unknown) => logger.warn({ err }, "Could not clean up old refresh tokens"));
}

async function checkPassword(userId: string, currentPassword: string) {
  const user = await User.findById(userId).select("+passwordHash");
  if (!user || user.deletionExpiresAt || user.anonymizedAt) throw unauthorized("Session expired");
  if (!await bcrypt.compare(currentPassword, user.passwordHash)) throw badRequest("Current password is incorrect");
  return user;
}

export async function changePassword(userId: string, currentPassword: string, password: string) {
  const user = await checkPassword(userId, currentPassword);
  const passwordHash = await bcrypt.hash(password, 12);
  const updated = await User.findOneAndUpdate(
    { _id: userId, ...versionFilter(user.sessionVersion), deletionExpiresAt: null, anonymizedAt: null },
    { $set: { passwordHash, failedLogins: 0, lockUntil: null, credentialsChangedAt: new Date() }, $inc: { sessionVersion: 1 }, $unset: { pendingEmail: 1 } },
    { new: true },
  );
  if (!updated) throw unauthorized("Session expired");
  await discardOlderSessions(userId, updated.sessionVersion);
  sendNotice(passwordChangedMail(user.email, user.displayName || user.username, `${env.CLIENT_ORIGIN}/login`));
}

export async function requestEmailChange(userId: string, currentPassword: string, email: string) {
  if (isProd && !env.RESEND_API_KEY) throw new AppError(503, "Email delivery is unavailable");
  const user = await checkPassword(userId, currentPassword);
  if (email === user.email) throw badRequest("The new email is the same as the current one");
  if (await User.exists({ email })) throw conflict("Email or username is already taken");
  const { token, hash } = generateRefreshToken();
  const result = await User.updateOne(
    { _id: userId, ...versionFilter(user.sessionVersion), deletionExpiresAt: null, anonymizedAt: null },
    { $set: { pendingEmail: { address: email, tokenHash: hash, expiresAt: new Date(Date.now() + 3_600_000), sessionVersion: user.sessionVersion ?? 0 } } },
  );
  if (!result.matchedCount) throw unauthorized("Session expired");
  await sendMail(emailChangeMail(email, user.displayName || user.username, `${env.CLIENT_ORIGIN}/confirm-email-change?token=${token}`));
}

export async function confirmEmailChange(token: string) {
  const tokenHash = hashToken(token);
  const user = await User.findOne({ "pendingEmail.tokenHash": tokenHash }).lean();
  if (!user?.pendingEmail || accountRestriction(user)) throw badRequest("This link is invalid or has expired");
  try {
    const updated = await User.findOneAndUpdate(
      { _id: user._id, ...versionFilter(user.pendingEmail.sessionVersion), deletionExpiresAt: null, anonymizedAt: null,
        "pendingEmail.tokenHash": tokenHash, "pendingEmail.expiresAt": { $gt: new Date() } },
      { $set: { email: user.pendingEmail.address, emailVerified: true, credentialsChangedAt: new Date() },
        $unset: { pendingEmail: 1, googleId: 1 }, $inc: { sessionVersion: 1 } },
      { new: true },
    );
    if (!updated) throw badRequest("This link is invalid or has expired");
    await discardOlderSessions(user._id, updated.sessionVersion);
    sendNotice(emailChangedMail(user.email, user.displayName || user.username));
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === 11000) throw conflict("Email or username is already taken");
    throw err;
  }
}
