import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { env } from "../config/env.js";
import { TestGateSettings } from "../models/TestGateSettings.js";
import { User } from "../models/User.js";
import { signAccessToken } from "../utils/tokens.js";

const port = process.env.BUBBLE_GATE_TEST_MONGO_PORT;
const integration = port && /^\d{1,5}$/.test(port) && env.TEST_GATE_SECRET ? describe : describe.skip;

integration("test access settings on isolated MongoDB", () => {
  const dbName = `bubble_gate_test_${randomUUID().replaceAll("-", "")}`;
  const api = request(createApp());
  const token = `Bearer ${signAccessToken(new mongoose.Types.ObjectId().toString())}`;
  const internal = { "x-test-gate-secret": env.TEST_GATE_SECRET! };
  let ownsDatabase = false;
  const role = (name: string) => vi.spyOn(User, "findById").mockImplementation((() => ({ select: () => ({ lean: async () => ({ role: name, banned: false }) }) })) as never);
  beforeAll(async () => {
    await mongoose.connect(`mongodb://127.0.0.1:${port}/${dbName}`, { serverSelectionTimeoutMS: 3000 });
    ownsDatabase = true;
  });
  beforeEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    if (ownsDatabase && mongoose.connection.name === dbName) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  it("restricts settings to admins and immediately applies credential changes", async () => {
    expect((await api.get("/api/internal/test-gate/status")).status).toBe(404);
    role("moderator");
    expect((await api.get("/api/admin/test-gate").set("Authorization", token)).status).toBe(403);
    expect((await api.put("/api/admin/test-gate").set("Authorization", token).send({ enabled: false })).status).toBe(403);
    vi.restoreAllMocks();
    role("admin");
    expect((await api.get("/api/internal/test-gate/status").set(internal)).body.enabled).toBe(false);
    expect((await api.put("/api/admin/test-gate").set("Authorization", token).send({ enabled: true })).status).toBe(400);
    const enabled = await api.put("/api/admin/test-gate").set("Authorization", token).send({ enabled: true, username: "tester", password: "first-password" });
    expect(enabled.status).toBe(200);
    expect(enabled.body).toEqual({ available: true, enabled: true, username: "tester", configured: true });
    const stored = await TestGateSettings.findById("test-gate").select("+passwordHash").lean();
    expect(stored?.passwordHash).not.toContain("first-password");
    expect((await api.post("/api/internal/test-gate/verify").set(internal).send({ username: "tester", password: "wrong" })).status).toBe(401);
    const first = await api.post("/api/internal/test-gate/verify").set(internal).send({ username: "tester", password: "first-password" });
    expect(first.status).toBe(200);
    const longPassword = "a".repeat(72) + "correct";
    expect((await api.put("/api/admin/test-gate").set("Authorization", token).send({ enabled: true, username: "next", password: longPassword })).status).toBe(200);
    const second = await api.post("/api/internal/test-gate/verify").set(internal).send({ username: "next", password: longPassword });
    expect(second.status).toBe(200);
    expect(second.body.version).not.toBe(first.body.version);
    expect((await api.post("/api/internal/test-gate/verify").set(internal).send({ username: "next", password: "a".repeat(72) + "wrong" })).status).toBe(401);
    expect((await api.post("/api/internal/test-gate/verify").set(internal).send({ username: "tester", password: "first-password" })).status).toBe(401);
    expect((await api.put("/api/admin/test-gate").set("Authorization", token).send({ enabled: false })).status).toBe(200);
    expect((await api.get("/api/internal/test-gate/status").set(internal)).body.enabled).toBe(false);
  });
});
