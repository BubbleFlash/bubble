import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { confirmDirectUpload, createUploadTicket } from "../services/uploadService.js";

describe("image upload mode", () => {
  it("selects the API upload route", () => {
    expect(createUploadTicket()).toEqual({ mode: "server" });
  });

  it("rejects confirmation of direct image uploads", async () => {
    await expect(confirmDirectUpload("a".repeat(32), "png")).rejects.toMatchObject({
      status: 400,
      message: "Direct uploads are not enabled",
    });
  });

  it.each(["/api/uploads/sign", "/api/uploads/complete"])(
    "does not expose the obsolete direct upload route %s",
    async (path) => {
      expect((await request(createApp()).post(path)).status).toBe(404);
    },
  );
});
