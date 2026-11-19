import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { env } from "../config/env.js";
import { signAccessToken } from "../utils/tokens.js";

const originalEnv = env.NODE_ENV;
const app = createApp();
// Model a trusted local ingress with two public client IPs. Only this test app uses loopback trust.
app.set("trust proxy", "loopback");
const api = request(app);

beforeAll(() => {
  env.NODE_ENV = "development";
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
