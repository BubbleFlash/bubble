import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { Comment } from "../models/Comment.js";
import { CommentLike } from "../models/CommentLike.js";
import { CommentReport } from "../models/CommentReport.js";
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
  const like = (person: Person, id: string) => api.put(`/api/posts/${id}/like`).set(auth(person));
  const unlike = (person: Person, id: string) => api.delete(`/api/posts/${id}/like`).set(auth(person));
  const remove = (person: Person, id: string) => api.delete(`/api/posts/${id}`).set(auth(person));
  let ownsDatabase = false;

  beforeAll(async () => {
    await mongoose.connect(`mongodb://127.0.0.1:${port}/${dbName}`, {
      serverSelectionTimeoutMS: 3000,
      socketTimeoutMS: 5000,
      autoCreate: false,
      autoIndex: false,
    });
    if ((await mongoose.connection.db!.listCollections().toArray()).length)
      throw new Error("Expected a new test database");
    ownsDatabase = true;
    await Promise.all([Post.createIndexes(), Like.createIndexes(), CommentLike.createIndexes(), CommentReport.createIndexes()]);
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

  it("protects hidden community authors in public posts, profiles, following feeds and reposts", async () => {
    const community = await Community.create({ slug: "hidden_authors", name: "Группа", creator: ids.get("alice") });
    const source = await Post.create({ author: ids.get("boris"), community: community._id, content: "Скрытый автор", hideAuthor: true, adult: true, imageUrls: ["/uploads/0123456789abcdef0123456789abcdef.webp"] });
    const id = String(source._id);
    const guest = await api.get(`/api/public/posts/${id}`);
    expect(guest.body).toMatchObject({ hideAuthor: true, adult: true, author: { id: "", username: "" } });
    expect((await get("vera", `/posts/${id}`)).body.author.id).toBe("");
    expect((await get("alice", `/posts/${id}`)).body.author.id).toBe(String(ids.get("boris")));
    expect((await get("boris", `/posts/${id}`)).body.author.id).toBe(String(ids.get("boris")));
    await User.updateOne({ _id: ids.get("vera") }, { $set: { role: "moderator" } });
    expect((await get("vera", `/posts/${id}`)).body.author.id).toBe(String(ids.get("boris")));
    await User.updateOne({ _id: ids.get("vera") }, { $set: { role: "user" } });
    expect((await get("vera", "/users/boris/posts")).body.items.some((row: { id: string }) => row.id === id)).toBe(false);
    await Follow.create({ follower: ids.get("vera"), following: ids.get("boris") });
    expect((await get("vera", "/posts?feed=following")).body.items.some((row: { id: string }) => row.id === id)).toBe(false);
    const shared = await repost("vera", id);
    expect(shared.status).toBe(201);
    expect(shared.body.repost).toMatchObject({ adult: true, hideAuthor: true, author: { id: "" } });
    const membership = await Membership.create({ user: ids.get("vera"), community: community._id });
    await Community.updateOne({ _id: community._id }, { $set: { [`managers.${membership._id}`]: "editor" } });
    expect((await get("vera", `/posts/${id}`)).body.author.id).toBe(String(ids.get("boris")));
    expect((await get("vera", `/posts/${shared.body.id}`)).body.repost.author.id).toBe(String(ids.get("boris")));
  });

  it("saves and updates community author visibility and the adult photo flag", async () => {
    await Community.create({ slug: "author_flags", name: "Группа", creator: ids.get("alice") });
    const id = await newPost("alice", "Запись", { community: "author_flags", hideAuthor: true, adult: true });
    expect((await get("vera", `/posts/${id}`)).body).toMatchObject({ hideAuthor: true, adult: true, author: { id: "" } });
    const update = await api.patch(`/api/posts/${id}`).set(auth("alice")).send({ hideAuthor: false, adult: false });
    expect(update.status).toBe(200);
    expect((await get("vera", `/posts/${id}`)).body).toMatchObject({ hideAuthor: false, adult: false, author: { id: String(ids.get("alice")) } });
    const personal = await newPost("alice", "Личная запись", { hideAuthor: true, adult: true });
    expect((await get("vera", `/posts/${personal}`)).body).toMatchObject({ hideAuthor: false, adult: true, author: { id: String(ids.get("alice")) } });
  });

  it("keeps repost likes independent while liking the original when a repost is liked", async () => {
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

    expect((await like("vera", original)).status).toBe(200);
    expect((await get("vera", `/posts/${middle}`)).body).toMatchObject({ likeCount: 0, likedByMe: false });
    expect((await unlike("vera", original)).status).toBe(200);
    const likes = await Promise.all([
      like("vera", original), like("vera", middle), like("vera", end), like("alice", end),
    ]);
    expect(likes.every((res) => res.status === 200)).toBe(true);
    expect((await get("vera", `/posts/${original}`)).body).toMatchObject({ likeCount: 2, likedByMe: true });
    expect((await get("vera", `/posts/${middle}`)).body).toMatchObject({ likePostId: original, likeCount: 1, likedByMe: true });
    expect(await Like.countDocuments({ post: original })).toBe(2);
    expect(await Like.countDocuments({ post: { $in: [middle, end] } })).toBe(3);
    expect((await unlike("vera", original)).status).toBe(200);
    expect((await get("vera", `/posts/${original}`)).body).toMatchObject({ likeCount: 1, likedByMe: false });
    expect((await get("vera", `/posts/${middle}`)).body).toMatchObject({ likeCount: 1, likedByMe: true });
    expect((await get("vera", `/posts/${end}`)).body).toMatchObject({ likeCount: 2, likedByMe: true });
    expect((await unlike("vera", end)).status).toBe(200);
    expect((await get("vera", `/posts/${original}`)).body).toMatchObject({ likeCount: 1, likedByMe: false });
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

    const preferences = (visible: boolean) => api.patch("/api/notifications/preferences")
      .set(auth("alice")).send({ type: "repost", visible, sound: false });
    const repostEvents = () => get("alice", "/notifications").query({ type: "repost", limit: 30 });
    try {
      expect((await preferences(false)).body.repost).toEqual({ visible: false, sound: false });
      expect((await repostEvents()).body.items).toEqual([]);
      expect((await preferences(true)).body.repost).toEqual({ visible: true, sound: false });
      const visible = (await repostEvents()).body.items;
      const selected = visible.find((item: { postId: string }) => item.postId === end);
      expect(selected).toMatchObject({ type: "repost", read: false });
      expect((await api.post("/api/notifications/read").set(auth("alice"))
        .send({ items: [{ id: selected.id, createdAt: selected.createdAt }] })).status).toBe(204);
      expect((await repostEvents()).body.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ postId: middle, read: false }),
        expect.objectContaining({ postId: end, read: true }),
      ]));
    } finally {
      await api.patch("/api/notifications/preferences").set(auth("alice"))
        .send({ type: "repost", visible: true, sound: true });
    }

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

  it("enforces community roles across member management, appearance, posts and reposts", async () => {
    const base = "/communities/rolecheck";
    const call = (person: Person, method: "post" | "put" | "patch" | "delete", path: string, body?: object) => {
      const req = api[method](`/api${path}`).set(auth(person));
      return body ? req.send(body) : req;
    };
    const role = (person: Person, target: Person, value: string) =>
      call(person, "put", `${base}/members/${ids.get(target)}/role`, { role: value });
    expect((await call("alice", "post", "/communities", { slug: "rolecheck", name: "Проверка ролей" })).status).toBe(201);
    expect((await call("boris", "post", `${base}/join`)).status).toBe(204);
    expect((await call("vera", "post", `${base}/join`)).status).toBe(204);
    expect((await role("alice", "boris", "admin")).status).toBe(204);
    expect((await role("alice", "vera", "editor")).status).toBe(204);
    expect((await call("boris", "put", `${base}/members/${ids.get("vera")}/team-visibility`, { visible: false })).status).toBe(403);
    expect((await call("alice", "put", `${base}/members/${ids.get("vera")}/note`, { note: "Отвечает за мемы" })).status).toBe(204);
    expect((await get("vera", `${base}/team`)).body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ username: "vera", note: "Отвечает за мемы" }),
    ]));
    expect((await call("alice", "put", `${base}/members/${ids.get("vera")}/team-visibility`, { visible: false })).status).toBe(204);
    expect((await get("vera", `${base}/team`)).body.items.some((person: { username: string }) => person.username === "vera")).toBe(false);
    expect((await get("boris", `${base}/managers`)).body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ username: "vera", visibleInTeam: false }),
    ]));
    expect((await call("alice", "put", `${base}/members/${ids.get("vera")}/team-visibility`, { visible: true })).status).toBe(204);
    expect((await role("boris", "vera", "admin")).status).toBe(403);
    expect((await call("boris", "delete", `${base}/members/${ids.get("alice")}`)).status).toBe(400);
    expect((await call("boris", "delete", `${base}/members/${ids.get("vera")}`)).status).toBe(403);
    expect((await get("vera", `${base}/managers`)).status).toBe(403);
    expect((await get("boris", `${base}/managers`)).body.items).toEqual([
      expect.objectContaining({ username: "alice", role: "owner" }),
      expect.objectContaining({ username: "boris", role: "admin" }),
      expect.objectContaining({ username: "vera", role: "editor" }),
    ]);
    const original = await newPost("vera", "Запись редактора", { community: "rolecheck" });
    const other = await newPost("alice", "Запись владельца", { community: "rolecheck" });
    const edited = await call("vera", "patch", `/posts/${other}`, {
      content: "Правка редактора", imageUrls: ["/uploads/0123456789abcdef0123456789abcdef.webp"],
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ author: { username: "alice" }, imageUrls: [expect.stringContaining(".webp")] });
    expect((await call("vera", "patch", `/posts/${other}`, { content: "", imageUrls: [], musicTrackIds: [] })).status).toBe(400);
    expect((await call("boris", "patch", base, { name: "Название администратора" })).status).toBe(200);
    expect((await call("alice", "put", `${base}/permissions`, {
      publish: "admin", managePosts: "admin", editAppearance: "owner",
    })).status).toBe(200);
    expect((await call("boris", "patch", base, { name: "Другое название" })).status).toBe(403);
    expect((await call("vera", "post", "/posts", { content: "Запись", community: "rolecheck" })).status).toBe(403);
    expect((await repost("vera", original, { community: "rolecheck" })).status).toBe(403);
    expect((await repost("boris", other, { community: "rolecheck" })).status).toBe(201);
    expect((await get("vera", "/communities?publishable=1")).body.some((group: { slug: string }) => group.slug === "rolecheck")).toBe(false);
    expect((await get("boris", "/communities?publishable=1")).body.some((group: { slug: string }) => group.slug === "rolecheck")).toBe(true);
    expect((await get("vera", `/posts/${original}`)).body.communityActions).toEqual({ edit: false, delete: false });
    expect((await call("vera", "patch", `/posts/${original}`, { content: "Правка" })).status).toBe(403);
    expect((await remove("vera", original)).status).toBe(403);
    expect((await remove("boris", original)).status).toBe(204);
    expect((await role("alice", "vera", "member")).status).toBe(204);
    expect((await get("boris", `${base}/members?q=vera`)).body.items).toEqual([
      expect.objectContaining({ username: "vera", role: "member" }),
    ]);
    expect((await call("boris", "delete", `${base}/members/${ids.get("vera")}`)).status).toBe(204);
    expect((await get("vera", base)).body).toMatchObject({ memberCount: 2, myRole: null });
    expect((await call("vera", "post", `${base}/join`)).status).toBe(204);
    expect((await get("vera", base)).body.myRole).toBe("member");
  });

  it("keeps exactly one owner when a member leaves during transfer and supports legacy owner rows", async () => {
    const slug = "handover";
    const base = `/api/communities/${slug}`;
    const community = await Community.create({ name: "Передача группы", slug, creator: ids.get("alice"), memberCount: 3 });
    await Membership.create(["alice", "boris", "vera"].map((person) => ({
      community: community._id, user: ids.get(person as Person), role: person === "alice" ? "owner" : "member",
    })));
    const transfer = (person: Person) => api.post(`${base}/transfer`).set(auth("alice"))
      .send({ userId: String(ids.get(person)), confirmation: slug });
    const [handover, leave] = await Promise.all([
      transfer("boris"),
      api.delete(`${base}/join`).set(auth("boris")),
    ]);
    const roles = await Promise.all(users.map(async (person) => (await get(person, `/communities/${slug}`)).body.myRole));
    expect(roles.filter((value) => value === "owner")).toHaveLength(1);
    if (handover.status === 200) {
      expect(roles).toEqual(["member", "owner", "member"]);
      expect([400, 409]).toContain(leave.status);
      expect((await api.delete(`${base}/join`).set(auth("boris"))).status).toBe(400);
      expect((await transfer("vera")).status).toBe(403);
      expect((await api.delete(`${base}/join`).set(auth("alice"))).status).toBe(204);
    } else {
      expect([404, 409]).toContain(handover.status);
      expect(leave.status).toBe(204);
      expect(roles).toEqual(["owner", null, "member"]);
      expect((await transfer("vera")).status).toBe(200);
    }
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

  it("persists replies and deduplicates comment likes by viewer", async () => {
    const post = await newPost("alice", "Обсуждение");
    const unrelated = await newPost("alice", "Другая запись");
    const add = (postId: string, person: Person, body: object) =>
      api.post(`/api/posts/${postId}/comments`).set(auth(person)).send(body);
    const parent = await add(post, "alice", { content: "Комментарий" });
    const reply = await add(post, "boris", { content: "Ответ", parentId: parent.body.id });
    expect(reply.status).toBe(201);
    expect(reply.body.parentId).toBe(parent.body.id);
    const mentioned = await add(post, "boris", { content: "alice, привет", parentId: parent.body.id, mention: "alice" });
    expect(mentioned.body.mention).toEqual({ name: "alice", username: "alice" });
    const withoutMention = await add(post, "boris", { content: "Привет без обращения", parentId: parent.body.id });
    expect(withoutMention.body.parentId).toBe(parent.body.id);
    expect(withoutMention.body.mention).toBeUndefined();
    expect((await add(unrelated, "boris", { content: "Другой пост", parentId: parent.body.id })).status).toBe(404);
    const url = `/api/posts/${post}/comments/${reply.body.id}/like`;
    const reactions = await Promise.all([api.put(url).set(auth("vera")), api.put(url).set(auth("vera"))]);
    expect(reactions.map((result) => result.status)).toEqual([204, 204]);
    expect((await get("vera", `/posts/${post}/comments`)).body).toMatchObject([
      { id: parent.body.id, replyCount: 3 },
      { id: reply.body.id, likeCount: 1, likedByMe: true },
      { id: mentioned.body.id, mention: { name: "alice", username: "alice" } },
      { id: withoutMention.body.id, parentId: parent.body.id },
    ]);
    expect((await get("boris", `/posts/${post}/comments`)).body[1]).toMatchObject({ likeCount: 1, likedByMe: false });
    expect((await api.delete(url).set(auth("vera"))).status).toBe(204);
    expect((await get("vera", `/posts/${post}/comments`)).body[1]).toMatchObject({ likeCount: 0, likedByMe: false });
  });

  it("accepts one report per comment and rejects self reports and unrelated posts", async () => {
    const post = await newPost("alice", "Обсуждение для жалобы");
    const other = await newPost("alice", "Другая запись");
    const comment = await api.post(`/api/posts/${post}/comments`).set(auth("boris")).send({ content: "Комментарий" });
    const url = (id: string) => `/api/posts/${id}/comments/${comment.body.id}/report`;
    expect((await api.post(url(post)).set(auth("boris")).send({ reason: "spam" })).status).toBe(400);
    expect((await api.post(url(other)).set(auth("vera")).send({ reason: "spam" })).status).toBe(404);
    expect((await api.post(url(post)).set(auth("vera")).send({ reason: "spam" })).status).toBe(201);
    expect((await api.post(url(post)).set(auth("vera")).send({ reason: "spam" })).status).toBe(409);
    expect(await CommentReport.countDocuments({ comment: comment.body.id })).toBe(1);
  });

  it("updates both conversation previews after authorized edits and deletion", async () => {
    const opened = await api.post("/api/messages/with/boris").set(auth("alice")).send({ text: "Первое сообщение" });
    expect(opened.status).toBe(201);
    const { conversationId } = opened.body;
    const thread = `/messages/${conversationId}`;
    const sent = await api.post(`/api${thread}`).set(auth("alice")).send({ text: "Следующее сообщение" });
    const item = `/api${thread}/items/${sent.body.id}`;
    expect((await api.patch(item).set(auth("boris")).send({ text: "Чужая правка" })).status).toBe(404);
    expect((await api.delete(item).set(auth("vera"))).status).toBe(404);
    expect((await api.patch(item).set(auth("alice")).send({ text: "Правка автора" })).status).toBe(204);
    for (const person of ["alice", "boris"] as const) {
      const { body } = await get(person, thread);
      expect(body.items.at(-1)).toMatchObject({ text: "Правка автора", editedAt: expect.any(String) });
      expect((await get(person, "/messages")).body).toEqual(expect.arrayContaining([expect.objectContaining({
        id: conversationId, lastMessage: expect.objectContaining({ text: "Правка автора" }),
      })]));
    }
    expect((await api.delete(item).set(auth("alice"))).status).toBe(204);
    const { body } = await get("boris", thread);
    expect(body.items.some((message: { id: string }) => message.id === sent.body.id)).toBe(false);
    expect((await get("boris", "/messages")).body).toEqual(expect.arrayContaining([expect.objectContaining({
      id: conversationId, lastMessage: expect.objectContaining({ text: "Первое сообщение" }),
    })]));
  });

  it("applies community limits to create and edit without changing the personal limit", async () => {
    const community = "limitscheck";
    await Community.create({ name: "Лимит публикаций", slug: community, creator: ids.get("alice") });
    const id = await newPost("alice", "Старая запись", { community });
    for (const length of [1999, 2000, 2001]) {
      const content = "a".repeat(length);
      const create = await api.post("/api/posts").set(auth("alice")).send({ content, community });
      const edit = await api.patch(`/api/posts/${id}`).set(auth("alice")).send({ content });
      expect(create.status).toBe(length > 2000 ? 400 : 201);
      expect(edit.status).toBe(length > 2000 ? 400 : 200);
    }
    await newPost("alice", "a".repeat(500));
    expect((await api.post("/api/posts").set(auth("alice")).send({ content: "a".repeat(2000) })).status).toBe(201);
    expect((await api.post("/api/posts").set(auth("alice")).send({ content: "a".repeat(2001) })).status).toBe(400);
  });
});
