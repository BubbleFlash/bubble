import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { Comment } from "../models/Comment.js";
import { Community } from "../models/Community.js";
import { Like } from "../models/Like.js";
import { Follow } from "../models/Follow.js";
import { Membership } from "../models/Membership.js";
import { Message } from "../models/Message.js";
import { Post } from "../models/Post.js";
import { User } from "../models/User.js";
import * as realtime from "../services/realtime.js";
import { signAccessToken } from "../utils/tokens.js";

// Use a dedicated localhost MongoDB, never the application's configured database.
const port = process.env.BUBBLE_REPOST_TEST_MONGO_PORT;
const integration = port && /^\d{1,5}$/.test(port) ? describe : describe.skip;

integration("reposts on isolated MongoDB", () => {
  const dbName = `bubble_repost_test_${randomUUID().replaceAll("-", "")}`;
  const api = request(createApp());
  const users = ["alice", "boris", "vera"] as const;
  type Person = (typeof users)[number];
  const ids = new Map<Person, mongoose.Types.ObjectId>();
  const auth = (person: Person) => ({
    Authorization: `Bearer ${signAccessToken(String(ids.get(person)))}`,
  });
  const get = (person: Person, path: string) => api.get(`/api${path}`).set(auth(person));
  const newPost = async (person: Person, content: string, options = {}) => {
    const res = await api.post("/api/posts").set(auth(person)).send({ content, ...options });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.id as string;
  };
  const repost = (person: Person, post: string, fields = {}, comment?: string) =>
    api.post("/api/posts/reposts").set(auth(person)).send({ source: { post, comment }, ...fields });
  const like = (person: Person, id: string) => api.post(`/api/posts/${id}/like`).set(auth(person));
  const remove = (person: Person, id: string) => api.delete(`/api/posts/${id}`).set(auth(person));
  let ownsDatabase = false;

  beforeAll(async () => {
    await mongoose.connect(`mongodb://127.0.0.1:${port}/${dbName}`, { serverSelectionTimeoutMS: 3000 });
    if ((await mongoose.connection.db!.listCollections().toArray()).length)
      throw new Error("Expected a new test database");
    ownsDatabase = true;
    await Promise.all([Post.init(), Like.init()]);
    const docs = await User.create(users.map((username) => ({
      username, email: `${username}@example.invalid`, passwordHash: "test",
    })));
    users.forEach((name, index) => ids.set(name, docs[index]!._id));
  });

  beforeEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    if (ownsDatabase && mongoose.connection.readyState === 1 && mongoose.connection.name === dbName)
      await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("shares independently, propagates counts, and deduplicates all likes at the original", async () => {
    const original = await newPost("alice", "Корневая запись", { imageUrls: ["/uploads/0123456789abcdef0123456789abcdef.webp"] });
    const first = await repost("boris", original, { content: "Подпись Бориса" });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const middle = first.body.id as string;
    expect(first.body).toMatchObject({
      content: "Подпись Бориса",
      repost: { postId: original, author: { username: "alice" }, imageUrls: expect.arrayContaining([expect.stringContaining(".webp")]) },
    });
    expect(await Post.findById(middle).lean()).toMatchObject({ imageUrls: [], imageUrl: null, musicTrackIds: [] });
    const last = await repost("vera", middle);
    expect(last.status, JSON.stringify(last.body)).toBe(201);
    const end = last.body.id as string;
    expect(last.body.repost).toMatchObject({ postId: middle, repost: { postId: original } });
    const branch = await repost("alice", original);
    expect(branch.status).toBe(201);
    expect((await get("vera", `/posts/${middle}`)).body.repostCount).toBe(1);
    expect((await get("vera", `/posts/${original}`)).body.repostCount).toBe(3);

    const likes = await Promise.all([
      like("vera", original), like("vera", middle), like("vera", end), like("alice", end),
    ]);
    expect(likes.every((res) => res.status === 200)).toBe(true);
    expect((await get("vera", `/posts/${original}`)).body).toMatchObject({ likeCount: 2, likedByMe: true });
    expect((await get("vera", `/posts/${middle}`)).body).toMatchObject({ likeCount: 1, likedByMe: true });
    await like("vera", original);
    expect((await get("vera", `/posts/${original}`)).body).toMatchObject({ likeCount: 2, likedByMe: false });
    await like("vera", end);
    expect((await get("vera", `/posts/${end}`)).body).toMatchObject({ likeCount: 1, likedByMe: false });
    const comments = await api.post(`/api/posts/${middle}/comments`).set(auth("vera")).send({ content: "Ответ репосту" });
    expect(comments.status).toBe(201);
    expect((await get("vera", `/posts/${original}`)).body.commentCount).toBe(0);
    expect((await get("vera", `/posts/${middle}`)).body.commentCount).toBe(1);
    const events = await get("alice", "/notifications");
    expect(events.body.filter((event: { type: string }) => event.type === "repost")).toEqual(expect.arrayContaining([
      expect.objectContaining({ postId: middle, actor: expect.objectContaining({ username: "boris" }) }),
      expect.objectContaining({ postId: end, actor: expect.objectContaining({ username: "vera" }) }),
    ]));

    expect((await remove("boris", middle)).status).toBe(204);
    expect((await get("vera", `/posts/${original}`)).body).toMatchObject({ repostCount: 2, likeCount: 1 });
    expect((await get("vera", `/posts/${end}`)).body.repost).toEqual({ kind: "unavailable" });
    expect((await remove("alice", original)).status).toBe(204);
    expect((await get("vera", `/posts/${branch.body.id}`)).body.repost).toEqual({ kind: "unavailable" });
  });

  it("checks community membership and binds a quoted comment to its original post", async () => {
    const original = await newPost("alice", "Исходная запись для комментария");
    const unrelated = await newPost("boris", "Другая запись");
    const reply = await api.post(`/api/posts/${original}/comments`).set(auth("vera")).send({ content: "Цитируемый комментарий" });
    expect(reply.status).toBe(201);
    const community = await Community.create({ name: "Проверка репостов", slug: "reposts", creator: ids.get("alice") });
    expect((await repost("boris", original, { community: "reposts" })).status).toBe(403);
    await Membership.create({ community: community._id, user: ids.get("boris"), role: "member" });
    expect((await repost("boris", unrelated, { community: "reposts" }, reply.body.id)).status).toBe(404);
    const share = await repost("boris", original, { community: "reposts" }, reply.body.id);
    expect(share.status).toBe(201);
    expect((await get("vera", "/communities/reposts/posts")).body.items).toEqual([
      expect.objectContaining({
        id: share.body.id,
        repost: expect.objectContaining({
          kind: "comment", commentId: reply.body.id, postId: original, author: expect.objectContaining({ username: "vera" }),
        }),
      }),
    ]);
    const focused = await Comment.create({ post: original, author: ids.get("vera"), content: "Комментарий вне первой страницы" });
    await Comment.insertMany(Array.from({ length: 200 }, (_, i) => ({
      _id: new mongoose.Types.ObjectId(i.toString(16).padStart(24, "0")),
      post: original,
      author: ids.get("vera"),
      content: "Предыдущий комментарий",
    })));
    const linked = await get("vera", `/posts/${original}/comments?comment=${focused.id}`);
    expect(linked.status).toBe(200);
    expect(linked.body.at(-1)).toMatchObject({ id: focused.id });
    const mismatched = await get("vera", `/posts/${unrelated}/comments?comment=${focused.id}`);
    expect(mismatched.body).toEqual([]);
    await Comment.deleteOne({ _id: reply.body.id });
    expect((await get("vera", `/posts/${share.body.id}`)).body.repost).toEqual({ kind: "unavailable" });
  });

  it("keeps private content out of feeds, search, comments, and nested previews", async () => {
    const original = await newPost("alice", "uniquewordprivate", { visibility: "private" });
    expect((await get("alice", `/posts/${original}`)).body.visibility).toBe("private");
    expect((await get("boris", `/posts/${original}`)).status).toBe(404);
    expect((await get("boris", `/posts/${original}/comments`)).status).toBe(404);
    expect((await like("boris", original)).status).toBe(404);
    expect((await repost("boris", original)).status).toBe(404);
    expect((await get("boris", "/search/posts?q=uniquewordprivate")).body.items).toEqual([]);
    expect((await get("boris", "/posts")).body.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: original })]));
    expect((await get("boris", "/users/alice/posts")).body.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: original })]));
    const share = await repost("alice", original);
    expect(share.body.repost).toMatchObject({ kind: "post", content: "uniquewordprivate" });
    const nested = await repost("boris", share.body.id);
    expect(nested.body.repost).toMatchObject({ kind: "post", repost: { kind: "unavailable" } });
    const guest = await api.get("/api/public/posts");
    expect(guest.status).toBe(200);
    expect(JSON.stringify(guest.body)).not.toContain("uniquewordprivate");
    expect(guest.body.items.find((item: { id: string }) => item.id === share.body.id).repost).toEqual({ kind: "unavailable" });
  });

  it("checks private access independently per recipient without leaking a preview through Socket.IO", async () => {
    const original = await newPost("alice", "Личная запись для проверки", { visibility: "private" });
    const share = await repost("alice", original);
    expect(share.body.repost).toMatchObject({ kind: "post", content: "Личная запись для проверки" });
    const events = vi.spyOn(realtime, "emitToUsers").mockResolvedValue(undefined);
    const sent = await api.post("/api/messages/with/vera").set(auth("alice")).send({
      text: "Моя подпись", repost: { post: original },
    });
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    expect(sent.body.message.repost).toMatchObject({ kind: "post", content: "Личная запись для проверки" });
    expect(events).toHaveBeenCalledWith(expect.any(Array), "message:new", {
      message: expect.objectContaining({ hasRepost: true, text: "Моя подпись" }),
    });
    expect(JSON.stringify(events.mock.calls)).not.toContain("Личная запись для проверки");
    const convo = sent.body.conversationId as string;
    const thread = await get("vera", `/messages/${convo}`);
    expect(thread.body.items[0]).toMatchObject({ text: "Моя подпись", repost: { kind: "unavailable" } });
    expect((await get("alice", `/posts/${original}`)).body.repostCount).toBe(2);
    const forwarded = await api.post("/api/messages/with/vera").set(auth("boris")).send({
      repost: { post: share.body.id },
    });
    expect(forwarded.status).toBe(201);
    const notifications = await get("alice", "/notifications");
    expect(notifications.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "repost", postId: original, actor: expect.objectContaining({ username: "boris" }) }),
    ]));
    expect(JSON.stringify(notifications.body)).not.toContain(forwarded.body.conversationId);
    expect((await get("alice", `/posts/${original}`)).body.repostCount).toBe(3);
    expect((await get("alice", `/posts/${share.body.id}`)).body.repostCount).toBe(1);
    await Message.updateOne({ _id: forwarded.body.message.id }, { $unset: { repostAncestors: "" } });
    expect((await get("alice", `/posts/${original}`)).body.repostCount).toBe(3);
    await Message.updateOne({ _id: forwarded.body.message.id }, { $set: { repostAncestors: [original, share.body.id] } });
    await remove("alice", share.body.id);
    expect((await get("alice", `/posts/${original}`)).body.repostCount).toBe(2);

    expect((await get("alice", `/messages/${convo}`)).body.items[0].repost).toMatchObject({ kind: "post", content: "Личная запись для проверки" });
    expect(await Message.findById(sent.body.message.id).lean()).toMatchObject({ repost: { post: new mongoose.Types.ObjectId(original) } });
    await remove("alice", original);
    expect((await get("vera", `/messages/${convo}`)).body.items[0].repost).toEqual({ kind: "unavailable" });
  });

  it("rejects paid posts and hides old paid records including in communities and quotes", async () => {
    const community = await Community.create({ name: "Обычные записи", slug: "freeposts", creator: ids.get("alice") });
    await Membership.create({ community: community._id, user: ids.get("alice"), role: "owner" });
    const payload = { content: "Новое платное", priceCents: 500, premiumContent: "Закрытый текст" };
    expect((await api.post("/api/posts").set(auth("alice")).send(payload)).status).toBe(400);
    expect((await api.post("/api/posts").set(auth("alice")).send({ ...payload, community: community.slug })).status).toBe(400);

    const original = await newPost("alice", "uniquepaidlegacy", { community: community.slug });
    const share = await repost("boris", original);
    expect(share.status).toBe(201);
    await Post.updateOne({ _id: original }, { $set: { priceCents: 500, premiumContent: "Старый закрытый текст" } });
    for (const path of [`/posts/${original}`, `/posts/${original}/comments`]) {
      expect((await get("alice", path)).status).toBe(404);
    }
    expect((await api.post(`/api/posts/${original}/checkout`).set(auth("boris"))).status).toBe(404);
    expect((await repost("alice", original)).status).toBe(404);
    expect((await get("alice", "/communities/freeposts/posts")).body.items).toEqual([]);
    expect((await get("alice", "/search/posts?q=uniquepaidlegacy")).body.items).toEqual([]);
    expect((await get("alice", `/posts/${share.body.id}`)).body.repost).toEqual({ kind: "unavailable" });
    expect(await Post.exists({ _id: original, priceCents: 500 })).toBeTruthy();
  });

  it("restricts friends-only posts and their reposts to mutual friends", async () => {
    const original = await newPost("alice", "Только для друзей", { visibility: "friends" });
    expect((await get("boris", `/posts/${original}`)).status).toBe(404);
    await Follow.create({ follower: ids.get("boris"), following: ids.get("alice") });
    expect((await get("boris", `/posts/${original}`)).status).toBe(404);
    await Follow.create({ follower: ids.get("alice"), following: ids.get("boris") });
    expect((await get("boris", `/posts/${original}`)).status).toBe(200);
    expect((await get("boris", "/posts")).body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: original })]));
    expect((await get("vera", "/posts")).body.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: original })]));
    const shared = await repost("boris", original);
    expect(shared.status).toBe(201);
    expect((await get("vera", `/posts/${shared.body.id}`)).body.repost).toEqual({ kind: "unavailable" });
    await Follow.deleteOne({ follower: ids.get("alice"), following: ids.get("boris") });
    expect((await get("boris", `/posts/${original}`)).status).toBe(404);
  });

  it("allows only the community owner to edit the community", async () => {
    const community = await Community.create({ name: "Начальное имя", slug: "editgroup", creator: ids.get("alice") });
    await Membership.create({ community: community._id, user: ids.get("alice"), role: "owner" });
    await Membership.create({ community: community._id, user: ids.get("boris"), role: "member" });
    expect((await api.patch("/api/communities/editgroup").set(auth("boris")).send({ name: "Чужое имя" })).status).toBe(403);
    const result = await api.patch("/api/communities/editgroup").set(auth("alice")).send({ name: "Новое имя", description: "Описание" });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ name: "Новое имя", description: "Описание" });
    const id = await newPost("boris", "Запись группы", { community: "editgroup" });
    expect((await get("vera", `/posts/${id}`)).body.community).toMatchObject({ name: "Новое имя", creatorId: String(ids.get("alice")) });
  });
});
