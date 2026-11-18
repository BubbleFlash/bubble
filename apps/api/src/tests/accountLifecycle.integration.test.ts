import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { User } from "../models/User.js";
import { Post } from "../models/Post.js";
import { anonymizeExpiredAccounts } from "../services/accountDeletion.js";
import { sendMail } from "../services/mailService.js";

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
  });
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(sendMail).mockResolvedValue(undefined);
  });
  afterAll(async () => {
    if (ownsDatabase && mongoose.connection.name === dbName) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("changes credentials, hides a profile, restores on login and preserves posts after expiry", async () => {
    const email = "before@example.invalid";
    const nextEmail = "after@example.invalid";
    const password = "original-password";
    const nextPassword = "replacement-password";
    const registered = await post("/auth/register", { username: "bubbletester", email, password });
    expect(registered.status, JSON.stringify(registered.body)).toBe(201);
    const id = registered.body.user.id;
    const firstToken = registered.body.accessToken;
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
