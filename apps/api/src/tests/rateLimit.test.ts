import request from "supertest";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { env } from "../config/env.js";
import { generateRefreshToken, signAccessToken } from "../utils/tokens.js";
import { RefreshToken } from "../models/RefreshToken.js";
import { User } from "../models/User.js";
import * as rateLimitSettings from "../services/rateLimitSettings.js";

const originalEnv = env.NODE_ENV;
const app = createApp();
// Model a trusted local ingress with two public client IPs. Only this test app uses loopback trust.
app.set("trust proxy", "loopback");
const api = request(app);

beforeAll(() => {
  env.NODE_ENV = "development";
});

const mongoPort = Number(process.env.BUBBLE_RATE_LIMIT_TEST_MONGO_PORT);
describe.skipIf(!Number.isInteger(mongoPort) || mongoPort < 1 || mongoPort > 65535)("HTTP rate limits with MongoDB", () => {
  const database = `bubble_rate_limit_${randomUUID().replaceAll("-", "")}`;
  beforeAll(async () => {
    await mongoose.connect(`mongodb://127.0.0.1:${mongoPort}/${database}`, {
      autoCreate: false,
      autoIndex: false,
      serverSelectionTimeoutMS: 5000,
    });
  });
  afterAll(async () => {
    if (mongoose.connection.name === database) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("starts without throttling and lets only admins restore and disable all HTTP limits", async () => {
    vi.restoreAllMocks();
    const [admin, moderator] = await User.insertMany(
      ["admin", "moderator"].map((role) => ({
        role, username: `limits_${role}`, email: `limits_${role}@example.invalid`, passwordHash: "fixture",
      })),
    );
    const adminToken = `Bearer ${signAccessToken(admin!.id)}`;
    const moderatorToken = `Bearer ${signAccessToken(moderator!.id)}`;
    const ip = "192.0.2.44";
    const path = "/api/admin/rate-limits";
    const getSettings = () => api.get(path).set("X-Forwarded-For", ip).set("Authorization", adminToken);
    const toggle = (enabled: boolean) => api.put(path).set("X-Forwarded-For", ip)
      .set("Authorization", adminToken).send({ enabled });
    const search = () => api.get("/api/search/people?q=limits").set("X-Forwarded-For", ip)
      .set("Authorization", moderatorToken);
    const sharedRequest = () => api.get("/api/nat-fixture-missing").set("X-Forwarded-For", ip);

    expect((await api.get(path)).status).toBe(401);
    expect((await api.get(path).set("Authorization", moderatorToken)).status).toBe(403);
    expect((await api.put(path).set("Authorization", moderatorToken).send({ enabled: true })).status).toBe(403);
    expect((await getSettings()).body).toMatchObject({
      enabled: false,
      rules: { search: { enabled: true, limit: 40, windowSeconds: 60 } },
    });
    expect((await api.put(path).set("Authorization", adminToken).send({ enabled: "true" })).status).toBe(400);
    for (let i = 0; i < 301; i++) expect((await sharedRequest()).status).toBe(404);
    for (let i = 0; i < 41; i++) expect((await search()).status).toBe(200);

    expect((await toggle(true)).body).toEqual({ enabled: true });
    expect((await getSettings()).body.enabled).toBe(true);
    for (let i = 0; i < 40; i++) expect((await search()).status).toBe(200);
    const limitedSearch = await search();
    expect(limitedSearch.status).toBe(429);
    expect(limitedSearch.headers["x-ratelimit-limiter"]).toBe("search");
    expect((await toggle(true)).status).toBe(200);
    expect((await search()).status).toBe(429);
    for (let i = 0; i < 300; i++) expect((await sharedRequest()).status).toBe(404);
    const limitedIp = await sharedRequest();
    expect(limitedIp.status).toBe(429);
    expect(limitedIp.headers["x-ratelimit-limiter"]).toBe("global-ip");

    expect((await getSettings()).status).toBe(200);
    expect((await toggle(false)).body).toEqual({ enabled: false });
    const unblocked = await search();
    expect(unblocked.status).toBe(200);
    expect(unblocked.headers.ratelimit).toBeUndefined();
    expect((await toggle(true)).status).toBe(200);
    expect((await search()).headers.ratelimit).toContain("remaining=39,");
    expect((await toggle(false)).status).toBe(200);
  }, 25_000);

  it("persists rule edits independently and enforces the saved threshold and window", async () => {
    vi.restoreAllMocks();
    const [admin, moderator] = await User.insertMany(
      ["admin", "moderator"].map((role) => ({
        role, username: `policy_${role}`, email: `policy_${role}@example.invalid`, passwordHash: "fixture",
      })),
    );
    const adminToken = `Bearer ${signAccessToken(admin!.id)}`;
    const moderatorToken = `Bearer ${signAccessToken(moderator!.id)}`;
    const path = "/api/admin/rate-limits";
    const updateRule = (name: string, body: object, token = adminToken) =>
      api.put(`${path}/${name}`).set("Authorization", token).send(body);
    const search = () => api.get("/api/search/people?q=policy").set("X-Forwarded-For", "192.0.2.61")
      .set("Authorization", moderatorToken);
    const publicPosts = () => api.get("/api/public/posts?limit=invalid").set("X-Forwarded-For", "192.0.2.61");
    const firstSearchRule = { enabled: true, limit: 2, windowSeconds: 30 };
    const publicRule = { enabled: true, limit: 1, windowSeconds: 60 };
    await rateLimitSettings.saveRateLimitSettings(false);

    expect((await updateRule("search", firstSearchRule, moderatorToken)).status).toBe(403);
    expect((await updateRule("unknown", firstSearchRule)).status).toBe(400);
    expect((await updateRule("search", { ...firstSearchRule, windowSeconds: 0 })).status).toBe(400);
    const saved = await Promise.all([updateRule("search", firstSearchRule), updateRule("public", publicRule)]);
    expect(saved.map(({ status }) => status)).toEqual([200, 200]);
    expect((await api.get(path).set("Authorization", adminToken)).body).toMatchObject({
      enabled: false,
      rules: { search: firstSearchRule, public: publicRule },
    });
    expect((await search()).headers.ratelimit).toBeUndefined();

    await rateLimitSettings.saveRateLimitSettings(true);
    expect((await search()).headers["ratelimit-policy"]).toBe("2;w=30");
    expect((await search()).status).toBe(200);
    const limited = await search();
    expect(limited.status).toBe(429);
    expect(limited.headers["x-ratelimit-limiter"]).toBe("search");
    expect(Number(limited.headers["retry-after"])).toBeLessThanOrEqual(30);
    expect((await publicPosts()).status).toBe(400);
    expect((await publicPosts()).status).toBe(429);

    const raisedSearchRule = { enabled: true, limit: 3, windowSeconds: 90 };
    expect((await updateRule("search", raisedSearchRule)).status).toBe(200);
    expect((await search()).headers["ratelimit-policy"]).toBe("3;w=90");
    expect((await search()).status).toBe(200);
    expect((await search()).status).toBe(200);
    expect((await search()).status).toBe(429);
    expect((await updateRule("search", raisedSearchRule)).status).toBe(200);
    expect((await search()).status).toBe(429);

    expect((await updateRule("search", { ...raisedSearchRule, enabled: false })).status).toBe(200);
    expect((await search()).status).toBe(200);
    // Editing or disabling search must not change the current public budget.
    expect((await publicPosts()).headers["x-ratelimit-limiter"]).toBe("public");
    await rateLimitSettings.saveRateLimitSettings(false);
  });

  it.each([20, 50])("restores %i distinct accounts concurrently with an exhausted shared browsing budget", async (count) => {
    vi.restoreAllMocks();
    await rateLimitSettings.saveRateLimitSettings(true);
    const ip = `192.0.2.${count + 100}`;
    const users = await User.insertMany(Array.from({ length: count }, (_, index) => ({
      username: `nat_${count}_${index}`, email: `nat_${count}_${index}@example.invalid`, passwordHash: "fixture",
    })));
    const sessions = users.map((user) => ({ user, ...generateRefreshToken() }));
    await RefreshToken.insertMany(sessions.map(({ user, hash }) => ({
      user: user._id, tokenHash: hash, expiresAt: new Date(Date.now() + 60_000),
    })));

    const sharedRequest = () => api.get("/api/nat-fixture-missing").set("X-Forwarded-For", ip);
    for (let i = 0; i < 300; i++) expect((await sharedRequest()).status).toBe(404);
    expect((await sharedRequest()).headers["x-ratelimit-limiter"]).toBe("global-ip");

    await Promise.all(sessions.map(async ({ user, token }) => {
      const response = await api.post("/api/auth/refresh").set("X-Forwarded-For", ip).set("Cookie", `commune_rt=${token}`);
      expect(response.status).toBe(200);
      expect(response.body.user.username).toBe(user.username);
      expect(response.headers["ratelimit-policy"]).toBe("20;w=900");
      const startup = ["/posts?feed=all", "/messages/unread-count", "/notifications/unread-count", "/moderation/notices"];
      for (const path of startup) {
        const result = await api.get(`/api${path}`).set("X-Forwarded-For", ip)
          .set("Authorization", `Bearer ${response.body.accessToken}`);
        expect(result.status, path).toBe(200);
      }
    }));

    // The independent admission budget still stops excessive requests before cookie lookup.
    const noCookie = () => api.post("/api/auth/refresh").set("X-Forwarded-For", ip);
    for (let i = count; i < 300; i++) expect((await noCookie()).status).toBe(401);
    const blocked = await noCookie();
    expect(blocked.status).toBe(429);
    expect(blocked.headers["x-ratelimit-limiter"]).toBe("refresh-lookup-ip");
    expect(blocked.headers["ratelimit-policy"]).toBe("300;w=900");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
  }, 25_000);
});
afterAll(() => {
  env.NODE_ENV = originalEnv;
});

function browse(ip: string, token: string) {
  return api
    .get("/api/moderation/notices")
    .set("X-Forwarded-For", ip)
    .set("Authorization", `Bearer ${token}`);
}

describe("HTTP rate limits", () => {
  beforeEach(() => {
    vi.spyOn(rateLimitSettings, "rateLimitPolicy").mockResolvedValue({ enabled: true, revision: "http-tests", captchaRevision: null, registrationClosed: false, rules: {} });
  });
  afterEach(() => vi.restoreAllMocks());

  it("isolates accounts sharing NAT and keeps the same budget when an account changes IP", async () => {
    const nat = "192.0.2.10";
    const other = "198.51.100.20";
    const alice = signAccessToken("alice");
    const bob = signAccessToken("bob");
    const expiredSessionVersion = signAccessToken("alice", 1);

    const first = await browse(nat, alice);
    expect(first.status).toBe(200);
    expect(first.headers.ratelimit).toContain("remaining=299,");
    expect((await browse(other, alice)).headers.ratelimit).toContain("remaining=298,");
    expect((await browse(nat, bob)).headers.ratelimit).toContain("remaining=299,");

    const stale = await browse(nat, expiredSessionVersion);
    expect(stale.status).toBe(401);
    expect((await browse(nat, alice)).headers.ratelimit).toContain("remaining=297,");
    for (let i = 0; i < 297; i++) expect((await browse(nat, alice)).status).toBe(200);

    const denied = await browse(other, alice);
    expect(denied.status).toBe(429);
    expect(denied.headers["x-ratelimit-limiter"]).toBe("global-account");
    expect(Number(denied.headers["retry-after"])).toBeGreaterThan(0);
    expect(denied.headers["cache-control"]).toBe("no-store");
    const unaffected = await browse(nat, bob);
    expect(unaffected.status).toBe(200);
    expect(unaffected.headers.ratelimit).toContain("remaining=298,");
  });

  it("keeps separate IP budgets for public clients", async () => {
    const publicRequest = (ip: string) =>
      api.get("/api/public/posts?limit=invalid").set("X-Forwarded-For", ip);
    const first = "192.0.2.30";
    for (let i = 0; i < 60; i++) expect((await publicRequest(first)).status).toBe(400);
    const blocked = await publicRequest(first);
    expect(blocked.status).toBe(429);
    expect(blocked.headers["x-ratelimit-limiter"]).toBe("public");
    const signedIn = await publicRequest(first).set(
      "Authorization",
      `Bearer ${signAccessToken("public-reader")}`,
    );
    expect(signedIn.status).toBe(400);
    expect(signedIn.headers.ratelimit).toContain("remaining=59,");
    const second = await publicRequest("192.0.2.31");
    expect(second.status).toBe(400);
    expect(second.headers.ratelimit).toContain("remaining=59,");
  });

  it("does not charge guest refreshes against the login budget", async () => {
    const ip = "192.0.2.40";
    const refresh = () => api.post("/api/auth/refresh").set("X-Forwarded-For", ip);
    const login = () => api.post("/api/auth/login").set("X-Forwarded-For", ip).send({});
    for (let i = 0; i < 21; i++) expect((await refresh()).status).toBe(401);
    const firstLogin = await login();
    expect(firstLogin.status).toBe(400);
    expect(firstLogin.headers.ratelimit).toContain("remaining=19,");
    for (let i = 0; i < 19; i++) expect((await login()).status).toBe(400);
    const blocked = await login();
    expect(blocked.status).toBe(429);
    expect(blocked.headers["x-ratelimit-limiter"]).toBe("auth");
    expect((await refresh()).status).toBe(401);
  });
});
