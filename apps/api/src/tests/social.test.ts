import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { paginationSchema, updateProfileSchema } from "@commune/shared";
import { createApp } from "../app.js";
import { Notification } from "../models/Notification.js";
import { signAccessToken } from "../utils/tokens.js";

const app = createApp();

describe("social routes require auth", () => {
  const protectedRoutes: Array<[string, string]> = [
    ["get", "/api/users/someone"],
    ["get", "/api/users/someone/posts"],
    ["post", "/api/users/someone/follow"],
    ["patch", "/api/users/me"],
    ["get", "/api/notifications"],
    ["get", "/api/notifications/unread-count"],
    ["post", "/api/notifications/read"],
    ["get", "/api/notifications/preferences"],
    ["patch", "/api/notifications/preferences"],
  ];

  it.each(protectedRoutes)("%s %s returns 401 without a token", async (method, path) => {
    const res = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[
      method
    ]!(path);
    expect(res.status).toBe(401);
  });
});

describe("profile validation", () => {
  const token = signAccessToken("507f1f77bcf86cd799439011");

  it("rejects a bio longer than 160 characters", async () => {
    const res = await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ bio: "x".repeat(161) });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown feed type", async () => {
    const res = await request(app)
      .get("/api/posts?feed=everything")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

describe("shared schemas", () => {
  it("defaults the feed to 'all'", () => {
    expect(paginationSchema.parse({}).feed).toBe("all");
  });

  it("accepts the following feed", () => {
    expect(paginationSchema.parse({ feed: "following" }).feed).toBe("following");
  });

  it("trims and accepts a valid bio", () => {
    expect(updateProfileSchema.parse({ bio: "  hello  " }).bio).toBe("hello");
  });
});

describe("reading specific notifications", () => {
  const user = "507f1f77bcf86cd799439011";
  const authorization = { Authorization: `Bearer ${signAccessToken(user)}` };
  const id = "507f1f77bcf86cd799439012";
  const createdAt = "2026-10-31T09:00:00.000Z";

  it("updates only the signed-in recipient's selected event version", async () => {
    const update = vi.spyOn(Notification, "updateMany").mockResolvedValue({ modifiedCount: 1 } as never);
    try {
      const res = await request(app).post("/api/notifications/read").set(authorization)
        .send({ items: [{ id, createdAt }] });
      expect(res.status).toBe(204);
      expect(update).toHaveBeenCalledWith({
        user,
        read: false,
        type: { $in: ["follow", "like", "comment"] },
        $or: [{ _id: id, createdAt: new Date(createdAt) }],
      }, { $set: { read: true } });
    } finally {
      update.mockRestore();
    }
  });

  it("rejects an empty selection and invalid versions", async () => {
    for (const items of [[], [{ id, createdAt: "yesterday" }], [{ id: "not-an-id", createdAt }]]) {
      const res = await request(app).post("/api/notifications/read").set(authorization).send({ items });
      expect(res.status).toBe(400);
    }
  });
});

describe("notification pagination", () => {
  const user = "507f1f77bcf86cd799439011";
  const authorization = { Authorization: `Bearer ${signAccessToken(user)}` };
  const createdAt = new Date("2026-10-31T09:00:00.000Z");
  const id = "507f1f77bcf86cd799439012";
  const cursor = `${createdAt.toISOString()}|${id}`;

  it("walks notifications with the same timestamp using their IDs", async () => {
    const row = { _id: id, actor: { _id: user, username: "friend" }, type: "follow", createdAt, read: false };
    const older = { ...row, _id: user };
    const sort = vi.fn().mockReturnThis();
    const limit = vi.fn().mockReturnThis();
    const populate = vi.fn().mockReturnThis();
    const lean = vi.fn().mockResolvedValueOnce([row, older]).mockResolvedValueOnce([older]);
    const find = vi.spyOn(Notification, "find").mockReturnValue({ sort, limit, populate, lean } as never);
    try {
      const first = await request(app).get("/api/notifications").query({ limit: 1, type: "follow" }).set(authorization);
      expect(first.status).toBe(200);
      expect(first.body.items.map((item: { id: string }) => item.id)).toEqual([id]);
      expect(first.body.nextCursor).toBe(cursor);
      const second = await request(app).get("/api/notifications")
        .query({ limit: 1, type: "follow", cursor: first.body.nextCursor }).set(authorization);
      expect(second.status).toBe(200);
      expect(second.body.items.map((item: { id: string }) => item.id)).toEqual([user]);
      expect(second.body.nextCursor).toBeNull();
      expect(sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
      expect(limit).toHaveBeenCalledWith(2);
      expect(find).toHaveBeenLastCalledWith({
        user,
        type: { $in: ["follow"] },
        $or: [{ createdAt: { $lt: createdAt } }, { createdAt, _id: { $lt: id } }],
      });
    } finally {
      find.mockRestore();
    }
  });

  it("rejects malformed cursors", async () => {
    const res = await request(app).get("/api/notifications").query({ cursor: "yesterday" }).set(authorization);
    expect(res.status).toBe(400);
  });
});
