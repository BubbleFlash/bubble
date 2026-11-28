/* eslint no-console: "off" */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CreateBucketCommand, DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import mongoose from "mongoose";
import sharp from "sharp";
import request from "supertest";

const endpoint = new URL(process.env.BUBBLE_SMOKE_S3_ENDPOINT ?? "http://127.0.0.1:9000");
const mongo = new URL(process.env.BUBBLE_SMOKE_MONGO ?? "mongodb://127.0.0.1:27017");
assert.equal(endpoint.hostname, "127.0.0.1");
assert.equal(mongo.hostname, "127.0.0.1");
assert.equal(mongo.protocol, "mongodb:");
assert.ok(mongo.pathname === "" || mongo.pathname === "/", "Provide a server address without a database");
const id = randomUUID().replaceAll("-", "");
const dbName = "bubble_media_test_" + id;
const bucket = "bubble-media-test-" + id;
const credentials = {
  accessKeyId: process.env.BUBBLE_SMOKE_S3_ACCESS_KEY,
  secretAccessKey: process.env.BUBBLE_SMOKE_S3_SECRET_KEY,
};
assert.ok(credentials.accessKeyId && credentials.secretAccessKey);
mongo.pathname = "/" + dbName;
Object.assign(process.env, {
  NODE_ENV: "test", MONGODB_URI: mongo.href, CLIENT_ORIGIN: "http://127.0.0.1:5173",
  JWT_ACCESS_SECRET: randomUUID(), REQUIRE_VERIFIED_EMAIL: "false",
  S3_ENDPOINT: endpoint.origin, S3_PUBLIC_ENDPOINT: endpoint.origin, S3_REGION: "us-east-1",
  S3_BUCKET: bucket, S3_ACCESS_KEY: credentials.accessKeyId, S3_SECRET_KEY: credentials.secretAccessKey,
  S3_FORCE_PATH_STYLE: "true", S3_DIRECT_IMAGES: "false",
});

const { createApp } = await import("../../apps/api/src/app.ts");
const { env } = await import("../../apps/api/src/config/env.ts");
const { User } = await import("../../apps/api/src/models/User.ts");
const { Post } = await import("../../apps/api/src/models/Post.ts");
const { signAccessToken } = await import("../../apps/api/src/utils/tokens.ts");
const { s3Client } = await import("../../apps/api/src/services/s3Client.ts");
const { deleteUploadIfUnused } = await import("../../apps/api/src/services/uploadService.ts");
const { imagePreviewKey } = await import("../../apps/api/src/services/imagePreviews.ts");
const app = request(createApp());
let ownsBucket = false;
let ownsDatabase = false;

try {
  await s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
  ownsBucket = true;
  await mongoose.connect(mongo.href, { serverSelectionTimeoutMS: 3000, autoCreate: false, autoIndex: false });
  assert.equal(mongoose.connection.name, dbName);
  assert.equal((await mongoose.connection.db.listCollections().toArray()).length, 0);
  ownsDatabase = true;
  const user = await User.create({ username: "media-smoke", email: "media-smoke@example.invalid", passwordHash: "fixture" });
  const auth = { Authorization: "Bearer " + signAccessToken(String(user._id)) };
  const body = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: "#37658a" } }).jpeg({ quality: 100 }).toBuffer();
  const legacy = await app.post("/api/uploads").set(auth).attach("file", body, "photo.jpg").expect(201);
  const fresh = await app.post("/api/uploads?preview=post").set(auth).attach("file", body, "photo.jpg").expect(201);
  assert.match(legacy.body.url, /\/uploads\/[a-f0-9]{32}\.jpg$/);
  const url = fresh.body.url;
  assert.match(url, /-p3-1600\.jpg$/);
  const original = await app.get(url).expect(200);
  assert.deepEqual(original.body, body);
  assert.deepEqual((await app.get(legacy.body.url).expect(200)).body, body);

  const preview = await app.get(url + "?w=640").expect(200).expect("Content-Type", /image\/webp/);
  assert.equal((await sharp(preview.body).metadata()).width, 640);
  assert.ok(preview.body.length < body.length);
  assert.ok(preview.headers.etag);
  await app.get(url + "?w=640").set("If-None-Match", preview.headers.etag).expect(304);

  env.S3_DIRECT_IMAGES = true;
  const direct = await app.get(url + "?direct=1").expect(302);
  const signed = await fetch(direct.headers.location);
  assert.equal(signed.status, 200);
  assert.deepEqual(Buffer.from(await signed.arrayBuffer()), body);
  await app.get(url + "?w=640&direct=1").expect(200).expect("Content-Type", /image\/webp/);

  const hidden = await Post.collection.insertOne({ author: user._id, imageUrls: [url], moderationState: "hidden" });
  await app.get(url + "?w=640").set("If-None-Match", preview.headers.etag).expect(404);
  await app.get(url + "?direct=1").expect(404);
  await Post.collection.deleteOne({ _id: hidden.insertedId });

  const before = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket }));
  const file = url.split("/").at(-1);
  for (const width of [640, 1280]) assert.ok(before.Contents.some(x => x.Key === imagePreviewKey(file, width)));
  await deleteUploadIfUnused(url, true);
  const after = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket }));
  assert.deepEqual(after.Contents.map(x => x.Key), [legacy.body.url.slice(1)]);
  console.log(JSON.stringify({ status: "PASS", legacy: true, originalBytes: body.length, previewBytes: preview.body.length,
    conditional304: true, signedOriginal: true, moderationBefore304: true, deletePreview: true }));
} finally {
  try {
    if (ownsDatabase) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  } finally {
    if (ownsBucket) {
      const objects = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket }));
      if (objects.Contents?.length) await s3Client.send(new DeleteObjectsCommand({
        Bucket: bucket, Delete: { Objects: objects.Contents.map(({ Key }) => ({ Key })) },
      }));
      await s3Client.send(new DeleteBucketCommand({ Bucket: bucket }));
    }
    s3Client.destroy();
  }
}
