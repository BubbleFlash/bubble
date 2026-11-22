import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { Response } from "express";
import type { AuthResponse, LoginInput, RegisterInput } from "@commune/shared";
import { env } from "../config/env.js";
import { RefreshToken } from "../models/RefreshToken.js";
import { ensureRegistrationUsernameIndex, User, usernameCollation } from "../models/User.js";
import { assertAccountAllowed } from "./restrictions.js";
import { AppError, conflict, unauthorized } from "../utils/errors.js";
import { toAccountUser } from "../utils/serializers.js";
import { verifyGoogleIdToken, type GoogleProfile } from "./googleAuth.js";
import { sendVerificationEmail } from "./accountService.js";
import { generateRefreshToken, hashToken, signAccessToken } from "../utils/tokens.js";
import { restoreAccountOnLogin } from "./accountDeletion.js";
import { assertRegistrationOpen, readRateLimitSettings } from "./rateLimitSettings.js";

export const REFRESH_COOKIE = "commune_rt";
const COOKIE_PATH = "/api/auth";
// Used to keep login timing similar whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

const refreshCookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: "lax" as const,
  path: COOKIE_PATH,
};

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    ...refreshCookieOptions,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
}

async function issueSession(res: Response, user: Parameters<typeof toAccountUser>[0]) {
  const { token, hash } = generateRefreshToken();
  await RefreshToken.create({
    user: user._id,
    tokenHash: hash,
    sessionVersion: user.sessionVersion ?? 0,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
  });
  setRefreshCookie(res, token);
  const body: AuthResponse = {
    user: toAccountUser(user),
    accessToken: signAccessToken(user._id.toString(), user.sessionVersion ?? 0),
  };
  return body;
}

export async function issueVerifiedRegistrationSession(res: Response, userId: unknown) {
  const user = await User.findById(userId);
  if (!user || user.deletionExpiresAt || user.anonymizedAt || !user.emailVerified) throw unauthorized("Account not found");
  assertAccountAllowed(user);
  return issueSession(res, user);
}

function usernameTaken(username: string) {
  return User.exists({ username }).collation(usernameCollation);
}

function isDuplicateKey(error: unknown, field: "username" | "email") {
  if (typeof error !== "object" || error === null) return false;
  const duplicate = error as { code?: number; keyPattern?: Record<string, unknown> };
  return duplicate.code === 11000 && duplicate.keyPattern?.[field] === 1;
}

export async function register(input: RegisterInput) {
  if (env.NODE_ENV === "production" && !env.RESEND_API_KEY) throw new AppError(503, "Email delivery is unavailable");
  const [takenUsername, takenEmail] = await Promise.all([usernameTaken(input.username), User.exists({ email: input.email })]);
  if (takenUsername) throw conflict("Username is already taken");
  if (takenEmail) throw conflict("Email is already taken");

  await ensureRegistrationUsernameIndex();
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await User.create({
    username: input.username,
    registrationUsernameProtected: true,
    email: input.email,
    passwordHash,
    registrationPending: true,
  }).catch((error: unknown) => {
    if (isDuplicateKey(error, "username")) throw conflict("Username is already taken");
    if (isDuplicateKey(error, "email")) throw conflict("Email is already taken");
    throw error;
  });
  await sendVerificationEmail(user);
  return { verificationRequired: true };
}

const MAX_FAILED_LOGINS = 8;
const LOCK_MS = 15 * 60 * 1000;

/** Counts a wrong password in the database (works across serverless instances) and locks after too many. */
async function recordFailedLogin(userId: unknown) {
  const updated = await User.findOneAndUpdate(
    { _id: userId },
    { $inc: { failedLogins: 1 } },
    { new: true },
  ).select("+failedLogins");
  if (updated && (updated.failedLogins ?? 0) >= MAX_FAILED_LOGINS) {
    await User.updateOne(
      { _id: userId },
      { $set: { failedLogins: 0, lockUntil: new Date(Date.now() + LOCK_MS) } },
    );
  }
}

export async function login(input: LoginInput, res: Response) {
  const user = await User.findOne({ email: input.email }).select(
    "+passwordHash +failedLogins +lockUntil",
  );
  const locked = Boolean(user?.lockUntil && user.lockUntil.getTime() > Date.now());
  // Always compare, even for unknown or locked accounts, so timing reveals nothing.
  const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || locked || !ok) {
    if (user && !locked) await recordFailedLogin(user._id);
    // The same answer in every case, so it cannot be used to find out which emails exist or
    // which accounts are locked.
    throw unauthorized("Invalid email or password");
  }
  if ((user.failedLogins ?? 0) > 0 || user.lockUntil) {
    await User.updateOne({ _id: user._id }, { $set: { failedLogins: 0, lockUntil: null } });
  }
  // Checked after the password so the message can't be used to discover which emails exist.
  assertAccountAllowed(user);
  if (user.registrationPending && !user.emailVerified) {
    await sendVerificationEmail(user);
    throw new AppError(403, "Email confirmation required");
  }
  await restoreAccountOnLogin(user);
  return issueSession(res, user);
}

export async function findRefreshSession(presented: string | undefined) {
  if (!presented) throw unauthorized("No session");
  return RefreshToken.findOne({ tokenHash: hashToken(presented), expiresAt: { $gt: new Date() } })
    .select("user sessionVersion")
    .lean();
}

export type RefreshSession = NonNullable<Awaited<ReturnType<typeof findRefreshSession>>>;

/** Only consume the token after checking its budget. Concurrent rotations have one winner. */
export async function refresh(session: RefreshSession | null, res: Response) {
  if (!session) {
    // This response might arrive after another tab has already rotated the same cookie.
    throw unauthorized("Session expired");
  }
  const record = await RefreshToken.findOneAndDelete({ _id: session._id, expiresAt: { $gt: new Date() } });
  if (!record) throw unauthorized("Session expired");
  const user = await User.findById(record.user);
  if (!user || user.deletionExpiresAt || user.anonymizedAt) {
    clearRefreshCookie(res);
    throw unauthorized("Session expired");
  }
  assertAccountAllowed(user);
  if ((record.sessionVersion ?? 0) !== (user.sessionVersion ?? 0)) {
    clearRefreshCookie(res);
    throw unauthorized("Session expired");
  }
  return issueSession(res, user);
}

export async function logout(presented: string | undefined, res: Response) {
  if (presented) await RefreshToken.deleteOne({ tokenHash: hashToken(presented) });
  clearRefreshCookie(res);
}

/** Accounts created with Google get a random password nobody knows, so password login is off. */
const randomPasswordHash = () => bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);

async function createGoogleAccount(profile: GoogleProfile) {
  const { registrationClosed } = await readRateLimitSettings();
  assertRegistrationOpen(registrationClosed);
  await ensureRegistrationUsernameIndex();
  const passwordHash = await randomPasswordHash();
  const raw = profile.name ?? profile.email.split("@")[0] ?? "";
  let base = raw
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 16);
  if (base.length < 3) base = "user";
  for (let attempt = 0; attempt < 7; attempt++) {
    const username = attempt === 0 ? base : `${base}${crypto.randomBytes(4).toString("hex")}`;
    if (await usernameTaken(username)) continue;
    try {
      return await User.create({
        username,
        registrationUsernameProtected: true,
        email: profile.email,
        passwordHash,
        googleId: profile.sub,
        emailVerified: true,
      });
    } catch (error) {
      if (!isDuplicateKey(error, "username")) throw error;
    }
  }
  throw conflict("Username is already taken");
}

/** Sign in, or sign up, with a Google ID token. */
export async function loginWithGoogle(credential: string, res: Response) {
  if (!env.GOOGLE_CLIENT_ID) throw new AppError(503, "Google sign-in is not set up");
  const google = await verifyGoogleIdToken(credential);

  let user = await User.findOne({ googleId: google.sub });
  if (!user) {
    const existing = await User.findOne({ email: google.email });
    if (existing) {
      if (existing.deletionExpiresAt || existing.anonymizedAt) throw unauthorized("Invalid email or password");
      existing.googleId = google.sub;
      if (!existing.emailVerified) {
        // Someone may have registered this address with a password before its real owner
        // arrived. Google just proved ownership, so cancel any password and sessions that
        // were set up without that proof.
        existing.passwordHash = await randomPasswordHash();
        existing.emailVerified = true;
        existing.sessionVersion = (existing.sessionVersion ?? 0) + 1;
        existing.credentialsChangedAt = new Date();
        existing.pendingEmail = undefined;
        await RefreshToken.deleteMany({ user: existing._id });
      }
      await existing.save();
      user = existing;
    } else {
      user = await createGoogleAccount(google);
    }
  }
  assertAccountAllowed(user);
  await restoreAccountOnLogin(user);
  return issueSession(res, user);
}
