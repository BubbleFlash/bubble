import { describe, expect, it } from "vitest";
import { createPostSchema, createRepostSchema, updateCommunityPostSchema, createCommentSchema, sendMessageSchema, editMessageSchema } from "@commune/shared";
import { Comment } from "../models/Comment.js";
import { Message } from "../models/Message.js";
import { Types } from "mongoose";

describe("content length limits", () => {
  it("accepts 2000 characters in personal and community posts and reposts", () => {
    for (const length of [2000, 2001]) {
      const content = "a".repeat(length);
      const valid = length === 2000;
      expect(createPostSchema.safeParse({ content }).success).toBe(valid);
      expect(createPostSchema.safeParse({ content, community: "test" }).success).toBe(valid);
      expect(updateCommunityPostSchema.safeParse({ content }).success).toBe(valid);
      expect(createRepostSchema.safeParse({ content, source: { post: new Types.ObjectId().toString() } }).success).toBe(valid);
    }
  });

  it("enforces comment and message limits in both shared validation and models", () => {
    const id = new Types.ObjectId();
    for (const length of [1000, 1001]) {
      const content = "a".repeat(length);
      expect(createCommentSchema.safeParse({ content }).success).toBe(length === 1000);
      expect(new Comment({ author: id, post: id, content }).validateSync() === undefined).toBe(length === 1000);
    }
    for (const length of [2000, 2001]) {
      const text = "a".repeat(length);
      expect(sendMessageSchema.safeParse({ text }).success).toBe(length === 2000);
      expect(editMessageSchema.safeParse({ text }).success).toBe(length === 2000);
      expect(new Message({ sender: id, conversation: id, text }).validateSync() === undefined).toBe(length === 2000);
    }
  });
});
