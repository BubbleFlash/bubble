import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { env } from "../config/env.js";
import { Conversation } from "../models/Conversation.js";
import { User } from "../models/User.js";
import { signAccessToken } from "../utils/tokens.js";

vi.mock("node:crypto", async (importOriginal) => {
  const crypto = await importOriginal<typeof import("node:crypto")>();
  return { ...crypto, randomInt: (min: number, max?: number) => max === undefined ? 7 : crypto.randomInt(min, max) };
});

const port = Number(process.env.BUBBLE_RATE_LIMIT_TEST_MONGO_PORT);
describe.skipIf(!Number.isInteger(port) || port < 1 || port > 65535)("Account spam limits and registration captcha", () => {
  const database = `bubble_antispam_${randomUUID().replaceAll("-", "")}`;
  const primary = request(createApp().set("trust proxy", "loopback"));
  const secondary = request(createApp().set("trust proxy", "loopback"));
  const ip = "192.0.2.76";
  const settingsPath = "/api/admin/rate-limits";
  const registerPath = "/api/auth/register";
  const auth = new Map<string, string>();
  const headers = (name: string, address = ip) => ({ Authorization: auth.get(name)!, "X-Forwarded-For": address });
  const rule = (name: string, limit: number, enabled = true) => primary.put(`${settingsPath}/${name}`)
    .set(headers("admin")).send({ enabled, limit, windowSeconds: 3600 });
  const setCaptcha = (enabled: boolean) => primary.put(`${settingsPath}/captcha`).set(headers("admin")).send({ enabled });
  const newPost = (name: string, api = primary, address = ip) => api.post("/api/posts")
    .set(headers(name, address)).send({ content: "A fixture post" });
  const startChat = (name: string, target: string, api = primary) => api.post(`/api/messages/with/${target}`)
    .set(headers(name)).send({ text: "Hello there" });
  const fields = (name: string) => ({ username: name, email: `${name}@example.invalid`, password: "fixture-password" });
  const assertLimited = (res: request.Response, ruleName: string) => {
    expect(res.status, JSON.stringify(res.body)).toBe(429);
    expect(res.headers["x-ratelimit-limiter"]).toBe(ruleName);
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
    expect(res.headers["cache-control"]).toBe("no-store");
  };
  let originalEnv: typeof env.NODE_ENV;

  beforeAll(async () => {
    originalEnv = env.NODE_ENV;
    env.NODE_ENV = "development";
    await mongoose.connect(`mongodb://127.0.0.1:${port}/${database}?directConnection=true`, { serverSelectionTimeoutMS: 5000 });
    await Promise.all([User.init(), Conversation.init()]);
    const users = await User.create(["admin", "alice", "bob", "carol", "dana"].map((username) => ({
      username, email: `${username}@example.invalid`, passwordHash: "fixture", role: username === "admin" ? "admin" : "user",
    })));
    users.forEach((user) => auth.set(user.username, `Bearer ${signAccessToken(user.id)}`));
  }, 15_000);

  beforeEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    env.NODE_ENV = originalEnv;
    if (mongoose.connection.name === database) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("applies admin edits live and atomically shares the publication budget between requests", async () => {
    const defaults = await primary.get(settingsPath).set(headers("admin"));
    expect(defaults.body).toMatchObject({ enabled: false, captchaEnabled: false, rules: {
      "post-create": { enabled: true, limit: 10, windowSeconds: 900 },
    } });
    expect((await primary.put(`${settingsPath}/post-create`).set(headers("alice")).send({ enabled: false })).status).toBe(403);
    expect((await rule("post-create", 2)).status).toBe(200);
    const attempts = await Promise.all(Array.from({ length: 8 }, (_, index) => newPost("alice", index % 2 ? primary : secondary)));
    expect(attempts.filter((res) => res.status === 201)).toHaveLength(2);
    attempts.filter((res) => res.status !== 201).forEach((res) => assertLimited(res, "post-create"));
    const bob = await newPost("bob");
    expect(bob.status).toBe(201);
    const repost = await secondary.post("/api/posts/reposts").set(headers("alice", "198.51.100.76"))
      .send({ source: { post: bob.body.id }, content: "Consider sharing" });
    assertLimited(repost, "post-create");
    expect((await rule("post-create", 2, false)).status).toBe(200);
    expect((await newPost("alice")).status).toBe(201);
    expect((await rule("post-create", 2)).status).toBe(200);
    expect((await newPost("alice")).status).toBe(201);
  });

  it("isolates comments and messages between accounts even when their guest IP budget is exhausted", async () => {
    expect((await rule("global-ip", 1)).status).toBe(200);
    expect((await rule("comment-create", 1)).status).toBe(200);
    expect((await rule("message", 2)).status).toBe(200);
    expect((await rule("chat-create", 1)).status).toBe(200);
    expect((await primary.put(settingsPath).set(headers("admin")).send({ enabled: true })).status).toBe(200);
    const guest = () => primary.get("/api/not-a-route").set("X-Forwarded-For", ip);
    expect((await guest()).status).toBe(404);
    assertLimited(await guest(), "global-ip");
    const source = await newPost("carol");
    expect(source.status).toBe(201);
    const comment = (name: string, parentId?: string) => primary.post(`/api/posts/${source.body.id}/comments`)
      .set(headers(name)).send({ content: "A comment", parentId });
    const first = await comment("alice");
    expect(first.status).toBe(201);
    assertLimited(await comment("alice", first.body.id), "comment-create");
    expect((await comment("bob", first.body.id)).status).toBe(201);

    const chat = await startChat("alice", "bob");
    expect(chat.status).toBe(201);
    assertLimited(await startChat("alice", "carol"), "chat-create");
    const send = (name: string) => secondary.post(`/api/messages/${chat.body.conversationId}`)
      .set(headers(name)).send({ text: "Another message" });
    assertLimited(await send("alice"), "message");
    expect((await send("bob")).status).toBe(201);
    expect((await startChat("carol", "dana")).status).toBe(201);
    // Sending through the start route for an existing conversation spends only the message quota.
    expect((await startChat("carol", "dana", secondary)).status).toBe(201);
    expect((await primary.put(settingsPath).set(headers("admin")).send({ enabled: false })).status).toBe(200);
  });

  it("requires captcha when enabled and consumes correct and incorrect answers once", async () => {
    expect((await primary.put(`${settingsPath}/captcha`).set(headers("alice")).send({ enabled: true })).status).toBe(403);
    expect((await setCaptcha(true)).body).toEqual({ captchaEnabled: true });
    const browser = request.agent(createApp());
    const issue = async () => {
      const response = await browser.post(`${registerPath}/captcha`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ required: true, id: expect.stringMatching(/^[a-f0-9]{48}$/), image: expect.stringMatching(/^data:image\/svg\+xml;base64,/) });
      expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
      expect(response.headers["cache-control"]).toBe("no-store");
      return response.body.id as string;
    };
    const submit = (name: string, id: string, answer = "777777") => browser.post(registerPath).send({ ...fields(name), captcha: { id, answer } });
    expect((await browser.post(registerPath).send(fields("no_captcha"))).body.error).toBe("Captcha required");
    const wrong = await issue();
    expect((await submit("invalid_code", wrong, "123456")).body.error).toBe("Invalid or expired captcha");
    expect((await submit("invalid_replay", wrong)).status).toBe(400);
    const expired = await issue();
    await mongoose.connection.db!.collection<{ _id: string; expiresAt: Date }>("registrationcaptchas")
      .updateOne({ _id: expired }, { $set: { expiresAt: new Date(0) } });
    expect((await submit("expired_code", expired)).status).toBe(400);
    const correct = await issue();
    const otherBrowser = await primary.post(registerPath).send({ ...fields("other_browser"), captcha: { id: correct, answer: "777777" } });
    expect(otherBrowser.status).toBe(400);
    const raced = await Promise.all([submit("parallel_one", correct), submit("parallel_two", correct)]);
    expect(raced.map((res) => res.status).sort()).toEqual([201, 400]);
    expect((await submit("successful_replay", correct)).status).toBe(400);
    expect((await setCaptcha(false)).body).toEqual({ captchaEnabled: false });
    expect((await browser.post(`${registerPath}/captcha`)).body).toEqual({ required: false });
    expect((await browser.post(registerPath).send(fields("disabled_captcha"))).status).toBe(201);
  }, 15_000);

  it("limits the issuance and registration endpoints independently", async () => {
    expect((await setCaptcha(true)).status).toBe(200);
    const source = "198.51.100.99";
    const issue = () => primary.post(`${registerPath}/captcha`).set("X-Forwarded-For", source);
    const submit = () => primary.post(registerPath).set("X-Forwarded-For", source).send(fields("rate_fixture"));
    const issued = await Promise.all(Array.from({ length: 31 }, issue));
    expect(issued.filter((res) => res.status === 200)).toHaveLength(30);
    assertLimited(issued.find((res) => res.status !== 200)!, "registration-captcha");
    const attempts = await Promise.all(Array.from({ length: 21 }, submit));
    expect(attempts.filter((res) => res.status === 400)).toHaveLength(20);
    assertLimited(attempts.find((res) => res.status !== 400)!, "registration");
  });
});
