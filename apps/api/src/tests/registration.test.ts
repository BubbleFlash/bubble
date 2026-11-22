import { afterEach, describe, expect, it, vi } from "vitest";
import { User } from "../models/User.js";
import { register } from "../services/authService.js";

const input = { username: "wAs", email: "new@example.invalid", password: "fixture-password" };

afterEach(() => vi.restoreAllMocks());

describe("registration uniqueness", () => {
  it("rejects an occupied username even when the email is free", async () => {
    const collation = vi.fn().mockResolvedValue({ _id: "legacy-account" });
    const exists = vi.spyOn(User, "exists")
      .mockReturnValueOnce({ collation } as never)
      .mockResolvedValueOnce(null);
    const create = vi.spyOn(User, "create");
    await expect(register(input)).rejects.toMatchObject({ status: 409, message: "Username is already taken" });
    expect(exists).toHaveBeenCalledWith({ username: input.username });
    expect(exists).toHaveBeenCalledWith({ email: input.email });
    expect(collation).toHaveBeenCalledWith({ locale: "en", strength: 2 });
    expect(create).not.toHaveBeenCalled();
  });

  it("returns the same message when an overlapping signup takes the username", async () => {
    vi.spyOn(User, "exists")
      .mockReturnValueOnce({ collation: async () => null } as never)
      .mockResolvedValueOnce(null);
    vi.spyOn(User.collection, "createIndex").mockResolvedValue("unique_registered_username");
    vi.spyOn(User, "create").mockRejectedValue({ code: 11000, keyPattern: { username: 1, registrationUsernameProtected: 1 } });
    await expect(register(input)).rejects.toMatchObject({ status: 409, message: "Username is already taken" });
  });
});
