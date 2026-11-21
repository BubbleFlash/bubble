import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Types } from "mongoose";
import { User } from "../models/User.js";
import { AuthToken } from "../models/AuthToken.js";
import { RefreshToken } from "../models/RefreshToken.js";
import { PushSubscription } from "../models/PushSubscription.js";
import { anonymizeExpiredAccounts, restorationDeadline, restoreAccountOnLogin } from "../services/accountDeletion.js";
import { toAuthor } from "../utils/serializers.js";
import { sendMail } from "../services/mailService.js";

vi.mock("../services/mailService.js", () => ({ sendMail: vi.fn().mockResolvedValue(undefined) }));
beforeEach(() => vi.mocked(sendMail).mockResolvedValue(undefined));
afterEach(() => vi.restoreAllMocks());

it("allows seven calendar months, clamping to the end of shorter months", () => {
  expect(restorationDeadline(new Date("2026-07-31T10:20:00Z")).toISOString()).toBe("2027-02-28T10:20:00.000Z");
});

it("restores only a still-pending account and does not expose its original author identity while hidden", async () => {
  const _id = new Types.ObjectId();
  const user = { _id, email: "person@example.com", username: "person", avatarUrl: "/photo", deletionExpiresAt: new Date(Date.now() + 1000) };
  expect(toAuthor(user)).toMatchObject({ id: String(_id), displayName: "Пользователь недоступен", avatarUrl: null });
  const update = vi.spyOn(User, "updateOne").mockResolvedValue({ modifiedCount: 0 } as never);
  await expect(restoreAccountOnLogin(user)).rejects.toThrow("Invalid email or password");
  expect(update.mock.calls[0]?.[0]).toMatchObject({ deletionExpiresAt: { $gt: expect.any(Date) } });
  update.mockResolvedValueOnce({ modifiedCount: 1 } as never);
  await restoreAccountOnLogin(user);
  expect(user.deletionExpiresAt).toBeUndefined();
});

it("anonymizes the user in place and removes authentication records after expiry", async () => {
  const _id = new Types.ObjectId();
  const now = new Date();
  const find = vi.spyOn(User, "find").mockReturnValue({
    select: () => ({ limit: () => ({ lean: async () => [{ _id }] }) }),
  } as never);
  const update = vi.spyOn(User, "updateOne").mockResolvedValue({ modifiedCount: 1 } as never);
  const tokens = vi.spyOn(AuthToken, "deleteMany").mockResolvedValue({ deletedCount: 1 } as never);
  vi.spyOn(RefreshToken, "deleteMany").mockResolvedValue({ deletedCount: 1 } as never);
  vi.spyOn(PushSubscription, "deleteMany").mockResolvedValue({ deletedCount: 1 } as never);
  await anonymizeExpiredAccounts(now);
  expect((find.mock.calls[0] as unknown[])[0]).toMatchObject({ deletionExpiresAt: { $lte: now } });
  const [filter, changes] = update.mock.calls[0] as unknown[];
  expect(filter).toMatchObject({ _id, deletionExpiresAt: { $lte: now } });
  expect(changes).toMatchObject({
    $set: { username: `deleted-${_id}`, email: `deleted-${_id}`, avatarUrl: null },
    $unset: { passwordHash: 1, googleId: 1, appearance: 1 },
  });
  expect(tokens).toHaveBeenCalledWith({ user: _id });
});
