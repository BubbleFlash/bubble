import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { User } from "../models/User.js";
import { Post } from "../models/Post.js";
import { anonymizeExpiredAccounts } from "../services/accountDeletion.js";
import { sendMail } from "../services/mailService.js";
import { signAccessToken } from "../utils/tokens.js";

vi.mock("../services/mailService.js", () => ({ sendMail: vi.fn() }));
const port = process.env.BUBBLE_ACCOUNT_TEST_MONGO_PORT;
const integration = port && /^\d{1,5}$/.test(port) ? describe : describe.skip;

integration("Bubble account lifecycle on isolated MongoDB", () => {
  const dbName = `bubble_account_test_${randomUUID().replaceAll("-", "")}`;
  const api = request(createApp());
  const post = (path: string, body: object, token?: string) => {
    const req = api.post(`/api${path}`).send(body);
    return token ? req.set("Authorization", `Bearer ${token}`) : req;
  };
  const me = (token: string) => api.get("/api/users/me").set("Authorization", `Bearer ${token}`);
  const login = (email: string, password: string) => post("/auth/login", { email, password });
  let ownsDatabase = false;

  beforeAll(async () => {
    await mongoose.connect(`mongodb://127.0.0.1:${port}/${dbName}`, { serverSelectionTimeoutMS: 3000 });
    if ((await mongoose.connection.db!.listCollections().toArray()).some(({ name }) => name === "users")) {
      // Auto-create may initialize empty collections. Never reuse a database containing account data.
      if (await User.estimatedDocumentCount()) throw new Error("Expected an empty test database");
    }
    ownsDatabase = true;
    await User.init();
    // Match a database where old duplicates prevented the original unique index from being built.
    await User.collection.dropIndex("username_1");
    await User.collection.dropIndex("unique_registered_username");
    await User.create([
      { username: "LegacyNick", email: "legacy1@example.invalid", passwordHash: "fixture" },
      { username: "legacynick", email: "legacy2@example.invalid", passwordHash: "fixture" },
    ]);
  });
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(sendMail).mockResolvedValue(undefined);
  });
  afterAll(async () => {
    if (ownsDatabase && mongoose.connection.name === dbName) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("rejects occupied usernames and emails, including case variants and concurrent registrations", async () => {
    const password = "fixture-password";
    const duplicate = await post("/auth/register", { username: "LEGACYNICK", email: "legacy3@example.invalid", password });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toBe("Username is already taken");
    expect((await post("/auth/register", { username: "UniqueNick", email: "unique@example.invalid", password })).status).toBe(201);
    for (const username of ["UniqueNick", "uniquenick", "UNIQUENICK"]) {
      expect((await post("/auth/register", { username, email: `${username}@other.invalid`, password })).status).toBe(409);
    }
    expect((await post("/auth/register", { username: "DifferentNick", email: "unique@example.invalid", password })).status).toBe(409);
    const attempts = await Promise.all([
      post("/auth/register", { username: "RaceNick", email: "race1@example.invalid", password }),
      post("/auth/register", { username: "racenick", email: "race2@example.invalid", password }),
    ]);
    expect(attempts.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(await User.countDocuments({ username: "racenick" }).collation({ locale: "en", strength: 2 })).toBe(1);
  }, 20_000);

  it("lets only an admin pause and resume signup without blocking sign-in", async () => {
    const password = "fixture-password";
    const admin = await User.create({ username: "reg_admin", email: "reg-admin@example.invalid", passwordHash: await bcrypt.hash(password, 4), role: "admin" });
    const user = await User.findOne({ email: "legacy1@example.invalid" }).orFail();
    const path = "/api/admin/registration";
    const token = `Bearer ${signAccessToken(admin.id)}`;
    const signup = { username: "PauseCheck", email: "pause-check@example.invalid", password };

    expect((await api.get(path).set("Authorization", token)).body).toEqual({ registrationClosed: false });
    expect((await api.put(path).set("Authorization", `Bearer ${signAccessToken(user.id)}`).send({ registrationClosed: true })).status).toBe(403);
    expect((await api.put(path).set("Authorization", token).send({ registrationClosed: true })).body).toEqual({ registrationClosed: true });
    expect((await post("/auth/register/captcha", {})).body.error).toBe("Registration is temporarily unavailable");
    expect((await post("/auth/register", signup)).status).toBe(503);
    expect(await User.exists({ username: signup.username })).toBeNull();
    expect((await login(admin.email, password)).status).toBe(200);
    expect((await api.put(path).set("Authorization", token).send({ registrationClosed: false })).body).toEqual({ registrationClosed: false });
    expect((await post("/auth/register", signup)).status).toBe(201);
  }, 20_000);

  it("changes credentials, hides a profile, restores on login and preserves posts after expiry", async () => {
    const email = "before@example.invalid";
    const nextEmail = "after@example.invalid";
    const password = "original-password";
    const nextPassword = "replacement-password";
    const registered = await post("/auth/register", { username: "bubbletester", email, password });
    expect(registered.status, JSON.stringify(registered.body)).toBe(201);
    expect(registered.body).toEqual({ verificationRequired: true });
    expect((await login(email, password)).status).toBe(403);
    const verification = vi.mocked(sendMail).mock.calls.map(([message]) => message).reverse().find((message) => message.to === email);
    const verificationToken = /verify-email\?token=([a-f0-9]{96})/.exec(verification?.text ?? "")?.[1];
    expect(verificationToken).toBeDefined();
    const confirmed = await post("/auth/verify-email", { token: verificationToken });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.accessToken).toBeTruthy();
    expect(confirmed.headers["set-cookie"]?.[0]).toContain("commune_rt=");
    expect((await post("/auth/verify-email", { token: verificationToken })).status).toBe(400);
    const session = await login(email, password);
    expect(session.status).toBe(200);
    const id = session.body.user.id;
    const firstToken = session.body.accessToken;
    expect((await me(firstToken)).body.email).toBe(email);
    expect(await api.get("/api/users/bubbletester").set("Authorization", `Bearer ${firstToken}`).then((r) => r.body.email)).toBeUndefined();

    expect((await post("/auth/change-email", { email: nextEmail, currentPassword: password }, firstToken)).status).toBe(202);
    expect((await me(firstToken)).body.email).toBe(email);
    const mail = vi.mocked(sendMail).mock.calls.map(([message]) => message).find((message) => message.to === nextEmail);
    const token = /confirm-email-change\?token=([a-f0-9]{96})/.exec(mail?.text ?? "")?.[1];
    expect(token).toBeDefined();
    expect((await post("/auth/confirm-email-change", { token })).status).toBe(204);
    expect((await post("/auth/confirm-email-change", { token })).status).toBe(400);
    expect((await me(firstToken)).status).toBe(401);

    const second = await login(nextEmail, password);
    expect(second.status).toBe(200);
    expect((await post("/auth/change-password", { currentPassword: password, password: nextPassword }, second.body.accessToken)).status).toBe(204);
    expect((await login(nextEmail, password)).status).toBe(401);
    const third = await login(nextEmail, nextPassword);
    expect(third.status).toBe(200);

    const publication = await post("/posts", { content: "Эта запись остаётся." }, third.body.accessToken);
    expect(publication.status).toBe(201);
    const hidden = await post("/auth/delete-account", { confirmation: "УДАЛИТЬ" }, third.body.accessToken);
    expect(hidden.status, JSON.stringify(hidden.body)).toBe(200);
    expect((await me(third.body.accessToken)).status).toBe(401);
    let publicFeed = await api.get("/api/public/posts");
    expect(publicFeed.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: publication.body.id, author: expect.objectContaining({ displayName: "Пользователь недоступен" }) }),
    ]));
    const restored = await login(nextEmail, nextPassword);
    expect(restored.status).toBe(200);
    expect((await User.findById(id).lean())?.deletionExpiresAt).toBeUndefined();

    expect((await post("/auth/delete-account", { confirmation: "УДАЛИТЬ" }, restored.body.accessToken)).status).toBe(200);
    await User.updateOne({ _id: id }, { $set: { deletionExpiresAt: new Date(Date.now() - 1000) } });
    expect((await login(nextEmail, nextPassword)).status).toBe(401);
    await anonymizeExpiredAccounts();
    expect(await User.exists({ email: nextEmail })).toBeNull();
    expect(await User.exists({ username: "bubbletester" })).toBeNull();
    expect(await Post.exists({ _id: publication.body.id, author: id })).not.toBeNull();
    publicFeed = await api.get("/api/public/posts");
    expect(publicFeed.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: publication.body.id, content: "Эта запись остаётся.", author: expect.objectContaining({ avatarUrl: null }) }),
    ]));
  }, 20_000);
});
