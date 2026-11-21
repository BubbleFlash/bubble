
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { Types } from "mongoose";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPostSchema,
  fontUploadUrlSchema,
  updateAppearanceSchema,
  updateProfileSchema,
  uploadUrlSchema,
} from "@commune/shared";

const storage = vi.hoisted(() => ({
  uploadObject: vi.fn(),
  getObject: vi.fn(),
  deleteObject: vi.fn(),
  createDownloadUrl: vi.fn(),
}));

vi.mock("../services/storageService.js", () => storage);

import { Post } from "../models/Post.js";
import { User } from "../models/User.js";
import { Community } from "../models/Community.js";
import { Wallpaper } from "../models/Wallpaper.js";
import { createApp } from "../app.js";
import { env } from "../config/env.js";
import { detectImageType } from "../utils/images.js";
import { signAccessToken } from "../utils/tokens.js";
import { mockUser } from "./helpers.js";

const app = createApp();
const originalDelivery = { direct: env.S3_DIRECT_IMAGES, endpoint: env.S3_PUBLIC_ENDPOINT };

const auth = {
  Authorization: `Bearer ${signAccessToken("507f1f77bcf86cd799439011")}`,
};

// Minimal buffers that start with each format's real signature.
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);

const jpg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(32),
]);

const gif = Buffer.concat([
  Buffer.from("GIF89a"),
  Buffer.alloc(32),
]);

const webp = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.alloc(4),
  Buffer.from("WEBP"),
  Buffer.alloc(16),
]);

beforeEach(() => {
  env.S3_DIRECT_IMAGES = false;
  mockUser({ role: "user", banned: false });
});

afterEach(() => {
  env.S3_DIRECT_IMAGES = originalDelivery.direct;
  env.S3_PUBLIC_ENDPOINT = originalDelivery.endpoint;
  vi.clearAllMocks();
});

describe("detectImageType", () => {
  it("recognizes png, jpeg, gif and webp by their signatures", () => {
    expect(detectImageType(png)).toBe("png");
    expect(detectImageType(jpg)).toBe("jpg");
    expect(detectImageType(gif)).toBe("gif");
    expect(detectImageType(webp)).toBe("webp");
  });

  it("rejects text, html, svg and empty buffers", () => {
    expect(detectImageType(Buffer.from("hello world"))).toBeNull();
    expect(
      detectImageType(Buffer.from("<html><script>alert(1)</script></html>")),
    ).toBeNull();
    expect(
      detectImageType(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      ),
    ).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe("POST /api/uploads", () => {
  it("requires authentication", async () => {
    const res = await request(app)
      .post("/api/uploads")
      .attach("file", png, "a.png");

    expect(res.status).toBe(401);
  });

  it("returns 400 when no file is sent", async () => {
    const res = await request(app)
      .post("/api/uploads")
      .set(auth);

    expect(res.status).toBe(400);
  });

  it("rejects a non-image even if it is named .png", async () => {
    const res = await request(app)
      .post("/api/uploads")
      .set(auth)
      .attach("file", Buffer.from("not really an image"), {
        filename: "evil.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(400);
    expect(storage.uploadObject).not.toHaveBeenCalled();
  });

  it("rejects files over 4 MB", async () => {
    const big = Buffer.concat([
      png,
      Buffer.alloc(4 * 1024 * 1024),
    ]);

    const res = await request(app)
      .post("/api/uploads")
      .set(auth)
      .attach("file", big, "big.png");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/4 MB/);
    expect(storage.uploadObject).not.toHaveBeenCalled();
  });

  it("stores a valid image in S3 under a random name", async () => {
    const res = await request(app)
      .post("/api/uploads")
      .set(auth)
      .attach("file", png, "photo.png");

    expect(res.status).toBe(201);
    expect(uploadUrlSchema.safeParse(res.body.url).success).toBe(true);
    expect(res.body.url).toMatch(/^\/uploads\/[a-f0-9]{32}\.png$/);
    expect(res.body.url).not.toContain("photo");

    expect(storage.uploadObject).toHaveBeenCalledTimes(1);
    expect(storage.uploadObject).toHaveBeenCalledWith(
      expect.stringMatching(/^uploads\/[a-f0-9]{32}\.png$/),
      png,
      "image/png",
    );
  });

  it("serves an image from S3", async () => {
    vi.spyOn(Post, "exists").mockResolvedValueOnce(null);
    vi.spyOn(Wallpaper, "exists").mockResolvedValueOnce(null);
    storage.getObject.mockResolvedValue({
      Body: {
        transformToWebStream: () =>
          Readable.toWeb(Readable.from([png])),
      },
      ContentType: "image/png",
      ContentLength: png.length,
      ETag: '"image-v1"',
    });

    const res = await request(app).get(
      `/uploads/${"a".repeat(32)}.png`,
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/image\/png/);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe("private, no-cache");
    expect(res.headers.etag).toBe('"image-v1"');
    expect(Buffer.compare(res.body, png)).toBe(0);

    expect(storage.getObject).toHaveBeenCalledWith(
      `uploads/${"a".repeat(32)}.png`,
    );
  });

  it("revalidates cached bytes in storage without downloading them again", async () => {
    vi.spyOn(Post, "exists").mockResolvedValue(null);
    vi.spyOn(Wallpaper, "exists").mockResolvedValue(null);
    storage.getObject.mockRejectedValueOnce(Object.assign(new Error("Not modified"), { $metadata: { httpStatusCode: 304 } }));
    const response = await request(app).get(`/uploads/${"a".repeat(32)}.png`).set("If-None-Match", '"image-v1"');
    expect(response.status).toBe(304);
    expect(response.text).toBe("");
    expect(response.headers["cache-control"]).toBe("private, no-cache");
    expect(storage.getObject).toHaveBeenCalledWith(`uploads/${"a".repeat(32)}.png`, '"image-v1"');
  });

  it("accepts a named NotModified response when a cached image is revalidated", async () => {
    vi.spyOn(Post, "exists").mockResolvedValue(null);
    vi.spyOn(Wallpaper, "exists").mockResolvedValue(null);
    storage.getObject.mockRejectedValueOnce(Object.assign(new Error("Not modified"), { name: "NotModified" }));
    const response = await request(app).get(`/uploads/${"a".repeat(32)}.png`).set("If-None-Match", '"image-v1"');
    expect(response.status).toBe(304);
  });

  it("does not fetch an image referenced only by moderated content", async () => {
    env.S3_DIRECT_IMAGES = true;
    env.S3_PUBLIC_ENDPOINT = "https://storage.example.test";
    vi.spyOn(Post, "exists").mockResolvedValueOnce({ _id: new Types.ObjectId() }).mockResolvedValueOnce(null);
    vi.spyOn(User, "exists").mockResolvedValueOnce(null);
    vi.spyOn(Community, "exists").mockResolvedValueOnce(null);
    vi.spyOn(Wallpaper, "exists").mockResolvedValue(null);
    storage.getObject.mockClear();

    const response = await request(app).get(`/uploads/${"a".repeat(32)}.png?direct=1`).set("If-None-Match", '"image-v1"');
    expect(response.status).toBe(404);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(storage.getObject).not.toHaveBeenCalled();
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });

  it("redirects opted-in images only after moderation checks and signs a short noncached URL", async () => {
    env.S3_DIRECT_IMAGES = true;
    env.S3_PUBLIC_ENDPOINT = "https://storage.example.test";
    const post = vi.spyOn(Post, "exists").mockResolvedValue(null);
    vi.spyOn(Wallpaper, "exists").mockResolvedValue(null);
    storage.createDownloadUrl.mockResolvedValueOnce("https://storage.example.test/signed-image");
    const response = await request(app).get(`/uploads/${"a".repeat(32)}.png?direct=1`);
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("https://storage.example.test/signed-image");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(storage.createDownloadUrl).toHaveBeenCalledWith(`uploads/${"a".repeat(32)}.png`, 60, undefined, "no-store");
    expect(post.mock.invocationCallOrder[0]).toBeLessThan(storage.createDownloadUrl.mock.invocationCallOrder[0]!);
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it.each(["disabled", "no public endpoint", "proxy fallback", "signing error"])("keeps the image proxy available: %s", async (mode) => {
    env.S3_DIRECT_IMAGES = mode !== "disabled";
    env.S3_PUBLIC_ENDPOINT = mode === "no public endpoint" ? undefined : "https://storage.example.test";
    vi.spyOn(Post, "exists").mockResolvedValue(null);
    vi.spyOn(Wallpaper, "exists").mockResolvedValue(null);
    if (mode === "signing error") storage.createDownloadUrl.mockRejectedValueOnce(new Error("Signing unavailable"));
    const response = await request(app).get(`/uploads/${"a".repeat(32)}.png${mode === "proxy fallback" ? "" : "?direct=1"}`);
    expect(response.status).toBe(200);
    expect(Buffer.compare(response.body, png)).toBe(0);
    expect(storage.getObject).toHaveBeenCalledOnce();
    if (mode !== "signing error") expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });

  it("does not treat a deleted object as a cache hit", async () => {
    vi.spyOn(Post, "exists").mockResolvedValue(null);
    vi.spyOn(Wallpaper, "exists").mockResolvedValue(null);
    storage.getObject.mockRejectedValueOnce(Object.assign(new Error("Missing"), { name: "NoSuchKey" }));
    const response = await request(app).get(`/uploads/${"a".repeat(32)}.png`).set("If-None-Match", '"image-v1"');
    expect(response.status).toBe(404);
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("does not serve a hidden wallpaper even if it is still selected as a background", async () => {
    vi.spyOn(Post, "exists").mockResolvedValue(null);
    vi.spyOn(Wallpaper, "exists").mockResolvedValueOnce({ _id: new Types.ObjectId() }).mockResolvedValueOnce(null);
    const user = vi.spyOn(User, "exists").mockResolvedValue(null);
    vi.spyOn(Community, "exists").mockResolvedValue(null);
    storage.getObject.mockClear();

    const response = await request(app).get(`/uploads/${"b".repeat(32)}.png`);
    expect(response.status).toBe(404);
    expect(storage.getObject).not.toHaveBeenCalled();
    expect(user).toHaveBeenCalledWith({ avatarUrl: `/uploads/${"b".repeat(32)}.png` });
  });

  it("does not read files outside the upload folder", async () => {
    const res = await request(app).get(
      "/uploads/..%2f..%2fpackage.json",
    );

    expect(res.status).not.toBe(200);
    expect(storage.getObject).not.toHaveBeenCalled();
  });
});

describe("shared schemas for images", () => {
  it("accepts only our own upload paths", () => {
    const good = `/uploads/${"a".repeat(32)}.png`;

    expect(uploadUrlSchema.safeParse(good).success).toBe(true);
    expect(
      uploadUrlSchema.safeParse("https://evil.example/x.png").success,
    ).toBe(false);
    expect(
      uploadUrlSchema.safeParse("/uploads/../secret.png").success,
    ).toBe(false);
    expect(
      uploadUrlSchema.safeParse(`/uploads/${"a".repeat(32)}.svg`).success,
    ).toBe(false);
  });

  it("allows an image-only post but rejects an empty one", () => {
    const imageUrl = `/uploads/${"b".repeat(32)}.jpg`;

    expect(
      createPostSchema.safeParse({ content: "", imageUrl }).success,
    ).toBe(true);
    expect(
      createPostSchema.safeParse({ content: "hi" }).success,
    ).toBe(true);
    expect(
      createPostSchema.safeParse({ content: "   " }).success,
    ).toBe(false);
  });

  it("lets a profile update send only an avatar, or null to remove it", () => {
    const avatarUrl = `/uploads/${"c".repeat(32)}.webp`;

    expect(
      updateProfileSchema.safeParse({ avatarUrl }).success,
    ).toBe(true);
    expect(
      updateProfileSchema.safeParse({ avatarUrl: null }).success,
    ).toBe(true);
    expect(updateProfileSchema.safeParse({}).success).toBe(true);
  });
});

describe("custom site fonts", () => {
  it("requires authentication and rejects non-font files", async () => {
    expect((await request(app).post("/api/uploads/font")).status).toBe(401);
    const response = await request(app).post("/api/uploads/font").set(auth).attach("file", png, "fake.ttf");
    expect(response.status).toBe(400);
    expect(storage.uploadObject).not.toHaveBeenCalled();
  });

  it("stores a WOFF2 with a font MIME type and account-scoped path", async () => {
    const font = readFileSync(new URL("../../../../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2", import.meta.url));
    const response = await request(app).post("/api/uploads/font").set(auth).attach("file", font, "font.woff2");
    expect(response.status).toBe(201);
    expect(response.body.url).toMatch(/^\/uploads\/507f1f77bcf86cd799439011-[a-f0-9]{32}\.woff2$/);
    expect(storage.uploadObject).toHaveBeenCalledWith(response.body.url.slice(1), font, "font/woff2");
    expect(fontUploadUrlSchema.safeParse(response.body.url).success).toBe(true);
    expect(updateAppearanceSchema.safeParse({ appearance: { font: response.body.url } }).success).toBe(true);
    expect(updateAppearanceSchema.safeParse({ appearance: { font: "https://example.org/font.woff2" } }).success).toBe(false);
  });
});
