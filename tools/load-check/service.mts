import { randomBytes, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import mongoose from "mongoose";

const port = Number(process.env.BUBBLE_LOAD_MONGO_PORT);
const total = Number(process.argv[2]);
if (
  !process.send ||
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535 ||
  ![20, 50, 100].includes(total)
) {
  throw new Error("Start this fixture from npm run check:load with a local MongoDB port");
}

const dbName = `bubble_load_${randomUUID().replaceAll("-", "")}`;
const local = "http://127.0.0.1";
const browserPort = process.env.BUBBLE_TAB_CHECK_PORT;
if (browserPort && (!/^\d{1,5}$/.test(browserPort) || +browserPort < 1 || +browserPort > 65535)) {
  throw new Error("Expected a local browser fixture port");
}
const clientOrigin = browserPort ? `http://bubble.localhost:${browserPort}` : local;
const jwtSecret = randomBytes(32).toString("hex");
const internalSecret = randomBytes(32).toString("hex");
Object.assign(process.env, {
  NODE_ENV: "production",
  MONGODB_URI: `mongodb://127.0.0.1:${port}/${dbName}?directConnection=true`,
  CLIENT_ORIGIN: clientOrigin,
  JWT_ACCESS_SECRET: jwtSecret,
  REALTIME_SECRET: internalSecret,
  REALTIME_URL: "",
  TRUST_PROXY: "0",
  ACCESS_TOKEN_TTL: browserPort && process.env.BUBBLE_TAB_CHECK_EXPIRE === "1" ? "12s" : "15m",
  RESEND_API_KEY: "",
  VAPID_PUBLIC_KEY: "",
  VAPID_PRIVATE_KEY: "",
  ALERT_EMAIL: "",
});

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a local TCP listener");
  return `${local}:${address.port}`;
}

const [
  { createApp },
  { createServer },
  { createRealtimeServer },
  { User },
  { Post },
  { Comment },
  { RefreshToken },
  { env },
  tokens,
] = await Promise.all([
  import("../../apps/api/src/app.js"),
  import("node:http"),
  import("../../apps/realtime/src/server.js"),
  import("../../apps/api/src/models/User.js"),
  import("../../apps/api/src/models/Post.js"),
  import("../../apps/api/src/models/Comment.js"),
  import("../../apps/api/src/models/RefreshToken.js"),
  import("../../apps/api/src/config/env.js"),
  import("../../apps/api/src/utils/tokens.js"),
]);

let server: Server | undefined;
let realtime: ReturnType<typeof createRealtimeServer> | undefined;
let ownsDatabase = false;
try {
  await mongoose.connect(process.env.MONGODB_URI!, {
    serverSelectionTimeoutMS: 5000,
    autoCreate: false,
    autoIndex: false,
  });
  if ((await mongoose.connection.db!.listCollections().toArray()).length)
    throw new Error("Expected a new fixture database");
  ownsDatabase = true;
  await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()));

  // Seed sessions directly so traffic from already signed-in users is measured separately from login.
  const users = await User.insertMany(
    Array.from({ length: total }, (_, index) => ({
      username: `load_user_${index}`,
      email: `load_user_${index}@example.invalid`,
      passwordHash: "fixture-only",
      emailVerified: true,
    })),
  );
  const posts = await Post.insertMany(
    users.flatMap((user) =>
      Array.from({ length: 3 }, (_, index) => ({
        author: user._id,
        content: `Fixture post ${index} by ${user.username}`,
        commentCount: 2,
      })),
    ),
  );
  await Comment.insertMany(
    posts.flatMap((post) =>
      [1, 2].map((index) => ({
        author: post.author,
        post: post._id,
        content: `Fixture comment ${index}`,
      })),
    ),
  );
  const sessions = users.map((user) => ({ user, ...tokens.generateRefreshToken() }));
  await RefreshToken.insertMany(
    sessions.map(({ user, hash }) => ({
      user: user._id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })),
  );

  server = createServer(createApp());
  const api = await listen(server);
  realtime = createRealtimeServer({
    port: 0,
    clientOrigin,
    jwtSecret,
    internalSecret,
    apiUrl: api,
    maxConnectionsPerUser: 8,
  });
  const sockets = await listen(realtime.httpServer);
  if (browserPort) env.REALTIME_URL = sockets;
  process.send({
    kind: "ready",
    api,
    sockets,
    ...(browserPort ? { posts: posts.map((post) => ({ id: post.id, content: post.content })) } : {}),
    sessions: sessions.map(({ user, token }) => ({
      username: user.username,
      cookie: `commune_rt=${token}`,
    })),
  });

  await new Promise<void>((resolve) => {
    process.on("disconnect", resolve);
    process.on("message", async (message) => {
      if (message === "stop") return resolve();
      if (message !== "sample") return;
      const cpu = process.cpuUsage();
      const mongo = await mongoose.connection
        .db!.admin()
        .serverStatus()
        .catch(() => null);
      process.send?.({
        kind: "sample",
        at: Date.now(),
        cpuMs: (cpu.user + cpu.system) / 1000,
        rssBytes: process.memoryUsage().rss,
        online: realtime!.onlineUsers(),
        mongoResidentMiB: mongo?.mem?.resident,
        mongoConnections: mongo?.connections?.current,
      });
    });
  });
} finally {
  await realtime?.close();
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  try {
    if (ownsDatabase && mongoose.connection.name === dbName)
      await mongoose.connection.dropDatabase();
  } finally {
    await mongoose.disconnect();
    if (process.connected) process.disconnect();
  }
}
