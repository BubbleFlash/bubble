import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ deleteObject: vi.fn(), getObject: vi.fn(), uploadObject: vi.fn() }));
vi.mock("../services/storageService.js", () => storage);

import { createApp } from "../app.js";
import { User } from "../models/User.js";
import { Post } from "../models/Post.js";
import { Report } from "../models/Report.js";
import { CommentReport } from "../models/CommentReport.js";
import { Comment } from "../models/Comment.js";
import { Wallpaper, WallpaperReport } from "../models/Wallpaper.js";
import { signAccessToken } from "../utils/tokens.js";

const port = process.env.BUBBLE_MODERATION_TEST_MONGO_PORT;
const integration = port && /^\d{1,5}$/.test(port) ? describe : describe.skip;

integration("moderation on isolated MongoDB", () => {
  const dbName = "bubble_moderation_test_" + randomUUID().replaceAll("-", "");
  const app = request(createApp());
  const ids = { admin: new mongoose.Types.ObjectId(), moderator: new mongoose.Types.ObjectId(), user: new mongoose.Types.ObjectId(), reporter: new mongoose.Types.ObjectId() };
  const auth = (name: keyof typeof ids, version = 0) => ({ Authorization: "Bearer " + signAccessToken(String(ids[name]), version) });
  const post = (name: keyof typeof ids, path: string, body: object) => app.post("/api" + path).set(auth(name)).send(body);
  let ownsDatabase = false;

  beforeAll(async () => {
    await mongoose.connect("mongodb://127.0.0.1:" + port + "/" + dbName, {
      serverSelectionTimeoutMS: 3000,
      autoCreate: false,
      autoIndex: false,
    });
    if ((await mongoose.connection.db!.listCollections().toArray()).length) throw new Error("Expected a new test database");
    ownsDatabase = true;
    await Promise.all([User, Post, Report, CommentReport, Wallpaper, WallpaperReport].map((model) => model.createIndexes()));
    await User.create(Object.entries(ids).map(([username, _id]) => ({ _id, username, email: username + "@example.invalid", passwordHash: "test", role: username === "admin" || username === "moderator" ? username : "user" })));
  }, 60_000);
  beforeEach(() => {
    vi.restoreAllMocks();
    storage.deleteObject.mockReset().mockResolvedValue(undefined);
  });
  afterAll(async () => {
    if (ownsDatabase && mongoose.connection.readyState === 1 && mongoose.connection.name === dbName) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("enforces roles, warnings, timed restrictions and old sessions", async () => {
    expect((await app.get("/api/moderation/users").set(auth("user"))).status).toBe(403);
    expect((await app.get("/api/admin/errors").set(auth("moderator"))).status).toBe(403);
    expect((await app.patch("/api/moderation/users/" + ids.user + "/role").set(auth("moderator")).send({ role: "moderator", reason: "test" })).status).toBe(403);
    const path = "/moderation/users/" + ids.user;
    expect((await post("moderator", path + "/measures", { action: "warning", reason: "Первое" })).status).toBe(204);
    expect((await post("moderator", path + "/measures", { action: "warning", reason: "Второе" })).status).toBe(204);
    const profile = await app.get("/api" + path).set(auth("moderator"));
    const warning = profile.body.warnings[0]._id;
    expect((await post("user", path + "/warnings/" + warning + "/lift", { reason: "test" })).status).toBe(403);
    expect((await post("moderator", path + "/warnings/" + warning + "/lift", { reason: "Пересмотр" })).status).toBe(204);
    expect((await post("moderator", path + "/warnings/" + warning + "/lift", { reason: "Повтор" })).status).toBe(409);
    const notice = await app.get("/api/moderation/notices").set(auth("user"));
    expect(notice.body.warnings.map((item: { reason: string }) => item.reason)).toEqual(["Второе"]);
    const history = await app.get("/api/moderation/history?user=" + ids.user).set(auth("moderator"));
    expect(history.body.items.map((item: { event: { action: string } }) => item.event.action)).toEqual(expect.arrayContaining(["warning", "liftWarning"]));
    expect((await post("moderator", path + "/measures", { action: "publishing", reason: "Спам", minutes: 2 })).status).toBe(204);
    expect((await post("user", "/posts", { content: "Blocked" })).body.restriction.kind).toBe("publishing");
    expect((await post("moderator", path + "/measures", { action: "liftPublishing", reason: "Пересмотр" })).status).toBe(204);
    expect((await post("moderator", path + "/measures", { action: "permanent", reason: "test" })).status).toBe(403);
    expect((await post("moderator", path + "/measures", { action: "temporary", reason: "Нарушение", minutes: 2 })).status).toBe(204);
    expect((await app.get("/api/users/me").set(auth("user"))).body.restriction.reason).toBe("Нарушение");
    await User.updateOne({ _id: ids.user }, { $set: { "accountRestriction.until": new Date(0) } });
    expect((await app.get("/api/users/me").set(auth("user"))).status).toBe(401);
    expect((await app.get("/api/users/me").set(auth("user", 1))).status).toBe(200);
    await User.updateOne({ _id: ids.moderator }, { $set: { role: "user" } });
    expect((await app.get("/api/moderation/users").set(auth("moderator"))).status).toBe(403);
    await User.updateOne({ _id: ids.moderator }, { $set: { role: "moderator" } });
  });

  it("closes reports and prevents deleted content from being restored while retaining shared files", async () => {
    const image = "/uploads/" + randomUUID().replaceAll("-", "") + ".png";
    const source = await Post.create({ author: ids.user, content: "Запись", imageUrl: image });
    const shared = await Post.create({ author: ids.user, content: "Общая", imageUrl: image });
    await Report.create({ post: source._id, reporter: ids.reporter, reason: "spam", snapshot: { content: "Запись", author: ids.user } });
    const path = "/moderation/content/post/" + source._id;
    expect((await post("moderator", path, { state: "hidden", reason: "Спам" })).status).toBe(204);
    expect((await app.get("/api/posts/" + source._id).set(auth("reporter"))).status).toBe(404);
    expect((await app.get("/api/moderation/content/post/" + source._id + "/images/0").set(auth("reporter"))).status).toBe(403);
    expect((await app.get("/api/moderation/reports?kind=post&status=resolved").set(auth("moderator"))).body.items.some((item: { post: string }) => item.post === String(source._id))).toBe(true);
    expect((await post("moderator", path, { state: "published", reason: "Пересмотр" })).status).toBe(204);
    const results = await Promise.all([post("moderator", path, { state: "removed", reason: "Спам" }), post("admin", path, { state: "removed", reason: "Спам" })]);
    expect(results.some((result) => result.status === 204)).toBe(true);
    expect(results.every((result) => [204, 409].includes(result.status))).toBe(true);
    expect((await post("moderator", path, { state: "published", reason: "Пересмотр" })).status).toBe(409);
    const removed = await Post.findById(source._id).lean();
    expect(removed?.content).toBeUndefined();
    expect(removed?.moderationEvents?.filter((event) => event.action === "removed")).toHaveLength(1);
    expect((await Report.findOne({ post: source._id }).lean())?.snapshot?.content).toBeUndefined();
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(await Post.exists({ _id: shared._id })).toBeTruthy();
    const legacy = await Post.create({ author: ids.user, content: "Старое", moderationState: "removed" });
    expect((await post("moderator", "/moderation/content/post/" + legacy._id, { state: "published", reason: "test" })).status).toBe(409);
    expect((await Post.findById(legacy._id).lean())?.content).toBe("Старое");
    expect((await post("moderator", "/moderation/content/post/" + legacy._id, { state: "removed", reason: "test" })).status).toBe(204);
    expect((await Post.findById(legacy._id).lean())?.content).toBeUndefined();
  });

  it("keeps deletion pending after a storage failure and safely retries", async () => {
    const image = "/uploads/" + randomUUID().replaceAll("-", "") + ".png";
    const entry = await Wallpaper.create({ author: ids.user, name: "Фон", imageUrl: image });
    await WallpaperReport.create({ wallpaper: entry._id, reporter: ids.reporter, reason: "spam" });
    storage.deleteObject.mockRejectedValueOnce(new Error("storage unavailable"));
    const path = "/moderation/content/wallpaper/" + entry._id;
    expect((await post("admin", path, { state: "removed", reason: "Спам" })).status).toBe(500);
    const pending = await Wallpaper.findById(entry._id).lean();
    expect(pending?.deletionPending).toBe(true);
    expect(pending?.deletionPendingImages).toEqual([image]);
    expect((await request(createApp()).get(image)).status).toBe(404);
    expect((await post("admin", path, { state: "removed", reason: "Спам" })).status).toBe(204);
    const done = await Wallpaper.findById(entry._id).lean();
    expect(done?.deletionPending).toBeUndefined();
    expect(done?.name).toBeUndefined();
    expect(done?.moderationEvents?.filter((event) => event.action === "removed")).toHaveLength(1);
    expect(storage.deleteObject).toHaveBeenCalledTimes(2);
  });

  it("preserves historical accounts and closes comment and wallpaper reports", async () => {
    const legacyId = new mongoose.Types.ObjectId();
    await User.create({ _id: legacyId, username: "legacy", email: "legacy@example.invalid", passwordHash: "test", banned: true });
    await User.collection.updateOne({ _id: legacyId }, { $unset: { sessionVersion: "", accountRestriction: "", publishingRestriction: "", moderationEvents: "" } });
    const legacyAuth = { Authorization: "Bearer " + signAccessToken(String(legacyId)) };
    expect((await app.get("/api/users/me").set(legacyAuth)).status).toBe(403);
    await User.updateOne({ _id: legacyId }, { $set: { banned: false } });
    expect((await app.get("/api/users/me").set(legacyAuth)).status).toBe(200);
    const parent = await Post.create({ author: ids.user, content: "Parent" });
    const comment = await Comment.create({ author: ids.user, post: parent._id, content: "Comment" });
    const otherComment = await Comment.create({ author: ids.user, post: parent._id, content: "Existing report" });
    const earlierComment = await Comment.create({ author: ids.user, post: parent._id, content: "Earlier report" });
    // The upstream database may already have the uniqueness index from the original CMS model.
    await CommentReport.collection.createIndex({ reporter: 1, post: 1 }, { unique: true });
    const existingReport = await CommentReport.collection.insertOne({
      post: otherComment._id,
      reporter: ids.reporter,
      reason: "spam",
      status: "open",
      snapshot: { parent: parent._id, author: ids.user, content: otherComment.content },
      createdAt: new Date(),
    });
    const earlierReport = await CommentReport.create({
      post: parent._id,
      comment: earlierComment._id,
      reporter: ids.reporter,
      reason: "spam",
    });
    expect((await post("reporter", `/posts/${parent._id}/comments/${otherComment._id}/report`, { reason: "spam" })).status).toBe(409);
    expect((await post("reporter", `/posts/${parent._id}/comments/${earlierComment._id}/report`, { reason: "spam" })).status).toBe(409);
    expect((await post("reporter", `/posts/${parent._id}/comments/${comment._id}/report`, { reason: "spam" })).status).toBe(201);
    const report = (await CommentReport.findOne({ comment: comment._id }).lean())!;
    const queue = await app.get("/api/moderation/reports?kind=comment&status=open").set(auth("moderator"));
    expect(queue.status).toBe(200);
    expect(queue.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ _id: String(report._id), post: String(comment._id), kind: "comment", target: expect.objectContaining({ content: "Comment" }) }),
      expect.objectContaining({ _id: String(existingReport.insertedId), post: String(otherComment._id) }),
      expect.objectContaining({ _id: String(earlierReport._id), post: String(earlierComment._id) }),
    ]));
    expect((await post("moderator", `/moderation/content/comment/${otherComment._id}`, { state: "hidden", reason: "Спам", reportId: String(existingReport.insertedId) })).status).toBe(204);
    expect((await post("moderator", `/moderation/content/comment/${earlierComment._id}`, { state: "hidden", reason: "Спам", reportId: String(earlierReport._id) })).status).toBe(204);
    const path = "/moderation/content/comment/" + comment._id;
    expect((await post("moderator", path, { state: "hidden", reason: "Спам", reportId: String(report._id) })).status).toBe(204);
    expect((await CommentReport.findById(report._id).lean())?.status).toBe("resolved");
    expect((await app.get("/api/posts/" + parent._id + "/comments").set(auth("reporter"))).body).toEqual([]);
    expect((await post("moderator", path, { state: "published", reason: "Пересмотр" })).status).toBe(204);
    expect((await post("moderator", path, { state: "removed", reason: "Спам" })).status).toBe(204);
    expect((await Comment.findById(comment._id).lean())?.content).toBeUndefined();
    expect((await CommentReport.findById(report._id).lean())?.snapshot?.content).toBeUndefined();
    const wallpaper = await Wallpaper.create({ author: ids.user, name: "Фон", imageUrl: "/uploads/" + randomUUID().replaceAll("-", "") + ".png" });
    const wallpaperReport = await WallpaperReport.create({ wallpaper: wallpaper._id, reporter: ids.reporter, reason: "spam" });
    expect((await post("moderator", "/moderation/content/wallpaper/" + wallpaper._id, { state: "hidden", reason: "Спам", reportId: String(wallpaperReport._id) })).status).toBe(204);
    expect((await WallpaperReport.findById(wallpaperReport._id).lean())?.status).toBe("resolved");
    expect((await app.get("/api/wallpapers?view=new&page=1").set(auth("reporter"))).body.items.some((item: { id: string }) => item.id === String(wallpaper._id))).toBe(false);
    expect((await post("moderator", "/moderation/content/wallpaper/" + wallpaper._id, { state: "published", reason: "Пересмотр" })).status).toBe(204);
  });
});
