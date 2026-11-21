import { AppError } from "../utils/errors.js";

type Restriction = { reason?: string | null; until?: Date | null };
type RestrictedUser = {
  banned?: boolean | null;
  accountRestriction?: Restriction | null;
  publishingRestriction?: Restriction | null;
};

export function usableAccountFilter(prefix = "") {
  const reason = prefix + "accountRestriction.reason";
  const until = prefix + "accountRestriction.until";
  return {
    [prefix + "banned"]: { $ne: true },
    [prefix + "deletionExpiresAt"]: null,
    [prefix + "anonymizedAt"]: null,
    $nor: [{ [reason]: { $type: "string" }, $or: [{ [until]: null }, { [until]: { $gt: new Date() } }] }],
  };
}

export function accountRestriction(user: RestrictedUser) {
  if (user.banned) return { reason: "Причина блокировки не была сохранена.", until: null };
  const restriction = user.accountRestriction;
  return restriction?.reason && (!restriction.until || restriction.until.getTime() > Date.now())
    ? restriction
    : null;
}

export function publishingRestriction(user: RestrictedUser) {
  const restriction = user.publishingRestriction;
  return restriction?.until && restriction.until.getTime() > Date.now() ? restriction : null;
}

export function restrictionError(kind: "account" | "publishing", restriction: Restriction) {
  return new AppError(
    403,
    kind === "account" ? "This account has been suspended" : "Publishing is restricted",
    {
      kind,
      reason: restriction.reason ?? "Причина не указана.",
      until: restriction.until?.toISOString() ?? null,
    },
  );
}

export function assertAccountAllowed(user: RestrictedUser) {
  const restriction = accountRestriction(user);
  if (restriction) throw restrictionError("account", restriction);
}
