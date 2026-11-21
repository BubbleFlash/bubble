import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { env } from "../config/env.js";
import { TelemetryBucket } from "../models/TelemetryBucket.js";
import { User } from "../models/User.js";
import { flushTelemetry } from "../services/telemetry.js";
import { saveRateLimitSettings } from "../services/rateLimitSettings.js";
import { signAccessToken } from "../utils/tokens.js";

const port = Number(process.env.BUBBLE_MONITOR_TEST_MONGO_PORT);
const integration =
  Number.isInteger(port) && port >= 1 && port <= 65_535 ? describe : describe.skip;

integration("monitoring on isolated MongoDB", () => {
  const dbName = `bubble_monitor_test_${randomUUID().replaceAll("-", "")}`;
  const api = request(createApp());
  let ownsDatabase = false;
  const originalMode = env.NODE_ENV;
  let admin = "";
  let moderator = "";

  beforeAll(async () => {
    await mongoose.connect(`mongodb://127.0.0.1:${port}/${dbName}?directConnection=true`, {
      autoCreate: false,
      autoIndex: false,
      serverSelectionTimeoutMS: 3000,
    });
    if ((await mongoose.connection.db!.listCollections().toArray()).length)
      throw new Error("Expected an empty test database");
    ownsDatabase = true;
    await TelemetryBucket.createIndexes();
    const users = await User.insertMany(
      ["admin", "moderator"].map((role) => ({
        role,
        username: `monitor_${role}`,
        email: `${role}@example.invalid`,
        passwordHash: "fixture",
        emailVerified: true,
      })),
    );
    admin = `Bearer ${signAccessToken(users[0]!.id)}`;
    moderator = `Bearer ${signAccessToken(users[1]!.id)}`;
    await saveRateLimitSettings(true);
    env.NODE_ENV = "development";
  });
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await flushTelemetry();
    env.NODE_ENV = originalMode;
    if (ownsDatabase && mongoose.connection.name === dbName)
      await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("captures the real auth limit, keeps client observations separate, and reports safe aggregates to admins", async () => {
    for (let n = 0; n < 20; n++)
      expect((await api.post("/api/auth/login").send({})).status).toBe(400);
    const limited = await api
      .post("/api/auth/login")
      .set("CF-Ray", "0123456789abcdef-FRA")
      .send({});
    expect(limited.status).toBe(429);
    expect(limited.headers["x-ratelimit-limiter"]).toBe("auth");

    const at = Date.now();
    const origin = "/users/fixture-private-account?secret=drop-me";
    for (const events of [
      [
        { route: origin, at, kind: "offline", method: "GET" },
        {
          route: "/auth/login",
          at,
          kind: "http",
          method: "POST",
          status: 429,
          cfRay: "1111111111111111-AMS",
        },
      ],
      [
        {
          route: origin,
          at: at - 1,
          kind: "offline",
          method: "GET",
          cfRay: "2222222222222222-AMS",
        },
      ],
    ]) {
      expect((await api.post("/api/client-network").send({ events })).status).toBe(204);
      await flushTelemetry();
    }
    expect(
      (
        await api
          .post("/api/client-network")
          .send({ events: [{ route: "/users", at, method: "GET", kind: "http", status: 200 }] })
      ).status,
    ).toBe(400);

    const metricsPath = "/api/admin/telemetry/metrics";
    const networkPath = "/api/admin/telemetry/network";
    expect((await api.get(metricsPath)).status).toBe(401);
    expect((await api.get(networkPath).set("Authorization", moderator)).status).toBe(403);
    expect((await api.get(`${metricsPath}?hours=900`).set("Authorization", admin)).status).toBe(
      400,
    );
    const metrics = await api.get(`${metricsPath}?hours=1`).set("Authorization", admin);
    expect(metrics.status).toBe(200);
    expect(metrics.body.total).toMatchObject({
      count: 21,
      limited: 1,
      clientErrors: 21,
      serverErrors: 0,
    });
    expect(metrics.body.total.p95Ms).toEqual(expect.any(Number));
    expect(metrics.body.rows).toEqual([
      expect.objectContaining({ route: "/auth/login", method: "POST", limited: 1 }),
    ]);

    const network = await api.get(networkPath).set("Authorization", admin);
    expect(network.status).toBe(200);
    expect(network.body.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "api",
          route: "/auth/login",
          status: 429,
          limiter: "auth",
          limit: 20,
          windowSeconds: 900,
          requestId: limited.headers["x-request-id"],
          cfRay: "0123456789abcdef-FRA",
          retryAfter: expect.any(Number),
        }),
        expect.objectContaining({
          source: "web",
          status: 429,
          limiter: null,
          cfRay: "1111111111111111-AMS",
        }),
        expect.objectContaining({
          source: "web",
          kind: "offline",
          route: "/users/:username",
          count: 2,
          cfRay: null,
        }),
      ]),
    );
    expect(JSON.stringify(await TelemetryBucket.find().lean())).not.toMatch(
      /fixture-private-account|drop-me/,
    );
  });
});
