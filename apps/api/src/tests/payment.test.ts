import mongoose from "mongoose";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPostSchema } from "@commune/shared";
import { createApp } from "../app.js";
import { Purchase } from "../models/Purchase.js";
import { splitSale } from "../services/purchaseService.js";
import { signAccessToken } from "../utils/tokens.js";

const app = createApp();
const ME = new mongoose.Types.ObjectId().toString();
const POST_ID = new mongoose.Types.ObjectId().toString();
const auth = { Authorization: `Bearer ${signAccessToken(ME)}` };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("post publishing", () => {
  it("rejects prices and protected content while still accepting old free-post payloads", () => {
    expect(createPostSchema.safeParse({ content: "Hi", priceCents: 500 }).success).toBe(false);
    expect(createPostSchema.safeParse({ content: "Hi", premiumContent: "Secret" }).success).toBe(false);
    expect(createPostSchema.safeParse({ content: "Hi", priceCents: null, premiumContent: null }).success).toBe(true);
  });
});

describe("splitSale", () => {
  it("keeps the platform fee and gives the rest to the creator", () => {
    expect(splitSale(1000, 20)).toEqual({ feeCents: 200, creatorShareCents: 800 });
    // Rounding never loses a cent: fee + share always equals the amount.
    const { feeCents, creatorShareCents } = splitSale(333, 20);
    expect(feeCents + creatorShareCents).toBe(333);
  });
});

it("no longer serves the post checkout endpoint", async () => {
  expect((await request(app).post(`/api/posts/${POST_ID}/checkout`).set(auth)).status).toBe(404);
});

describe("webhook and earnings without Lemon Squeezy configured", () => {
  it("answers 503 to webhooks", async () => {
    const res = await request(app).post("/api/webhooks/lemonsqueezy").send({});
    expect(res.status).toBe(503);
  });

  it("GET /users/me/earnings requires a login", async () => {
    const res = await request(app).get("/api/users/me/earnings");
    expect(res.status).toBe(401);
  });

  it("GET /users/me/earnings returns zeros for a creator with no sales", async () => {
    vi.spyOn(Purchase, "aggregate").mockResolvedValue([] as never);
    const res = await request(app).get("/api/users/me/earnings").set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      currency: "USD",
      sales: 0,
      grossCents: 0,
      feeCents: 0,
      netCents: 0,
    });
  });
});
