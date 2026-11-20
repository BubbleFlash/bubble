import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { io } from "socket.io-client";

const { values } = parseArgs({
  options: { users: { type: "string" }, seconds: { type: "string", default: "1200" } },
});
const users = Number(values.users);
const seconds = Number(values.seconds);
const mongoPort = Number(process.env.BUBBLE_LOAD_MONGO_PORT);
if (
  ![20, 50, 100].includes(users) ||
  !Number.isSafeInteger(seconds) ||
  seconds < 15 ||
  !Number.isInteger(mongoPort) ||
  mongoPort < 1 ||
  mongoPort > 65535
) {
  throw new Error(
    "Set BUBBLE_LOAD_MONGO_PORT for local MongoDB and pass --users=20|50|100 [--seconds=1200]",
  );
}

type Session = { username: string; cookie: string };
type Ready = { kind: "ready"; api: string; sockets: string; sessions: Session[] };
type Sample = {
  kind: "sample";
  at: number;
  cpuMs: number;
  rssBytes: number;
  online: number;
  mongoResidentMiB?: number;
  mongoConnections?: number;
};
type Endpoint = {
  durations: number[];
  statuses: Record<string, number>;
  limits: Record<string, number>;
};
type Feed = { items: Array<{ id: string }>; nextCursor?: string };
const RENEWAL_MS = 14 * 60_000;

function summarize({ durations, statuses, limits }: Endpoint) {
  durations.sort((a, b) => a - b);
  const percentile = (p: number) => Math.round(durations[Math.ceil(durations.length * p) - 1] ?? 0);
  return {
    requests: durations.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    statuses,
    limits,
  };
}

const service = fork(fileURLToPath(new URL("service.mts", import.meta.url)), [String(users)], {
  execArgv: ["--import", "tsx"],
  stdio: ["ignore", "ignore", "inherit", "ipc"],
});
const exited = once(service, "exit");
const samples: Sample[] = [];
const ready = new Promise<Ready>((resolve, reject) => {
  service.on("message", (message: Ready | Sample) => {
    if (message.kind === "ready") resolve(message);
    if (message.kind === "sample") samples.push(message);
  });
  service.once("error", reject);
  service.once("exit", () => reject(new Error("Local fixture service exited before it was ready")));
});

try {
  const { api, sockets, sessions } = await ready;
  if (![api, sockets].every((url) => /^http:\/\/127\.0\.0\.1:\d+$/.test(url)))
    throw new Error("Fixture listeners must be loopback");
  const metrics = new Map<string, Endpoint>();
  const minutes = new Map<number, Map<string, Endpoint>>();
  let socketErrors = 0;
  let initialConnections = 0;
  let plannedReconnects = 0;
  let unexpectedReconnects = 0;
  let unexpectedDisconnects = 0;
  let restoredSessions = 0;
  let renewedSessions = 0;
  let controlToken = "";
  let failedIterations = 0;
  const started = performance.now();
  const deadline = started + seconds * 1000;

  async function call(name: string, path: string, options: RequestInit = {}, expected = 200) {
    const start = performance.now();
    const minute = Math.floor((start - started) / 60_000);
    let window = minutes.get(minute);
    if (!window) {
      window = new Map();
      minutes.set(minute, window);
    }
    let status: string = "network-error";
    let limiter: string | undefined;
    try {
      const response = await fetch(api + "/api" + path, {
        ...options,
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      status = String(response.status);
      const body = await response.text();
      if (response.status === 429) {
        limiter = response.headers.get("x-ratelimit-limiter") ?? "unidentified";
      }
      if (response.status !== expected) throw new Error(`${name} returned ${status}`);
      return { body, cookie: response.headers.get("set-cookie")?.split(";")[0] };
    } finally {
      const duration = performance.now() - start;
      for (const group of [metrics, window]) {
        const endpoint = group.get(name) ?? { durations: [], statuses: {}, limits: {} };
        group.set(name, endpoint);
        endpoint.statuses[status] = (endpoint.statuses[status] ?? 0) + 1;
        endpoint.durations.push(duration);
        if (limiter) endpoint.limits[limiter] = (endpoint.limits[limiter] ?? 0) + 1;
      }
    }
  }

  async function virtualUser(session: Session, index: number) {
    await sleep(index * 43);
    let token = "";
    let cookie = session.cookie;
    let refreshAt = 0;
    let planned: "initial" | "renewal" | undefined = "initial";
    let pendingSessionCheck: "initial" | "renewal" | undefined;
    const socket = io(sockets, { autoConnect: false, transports: ["websocket"] });
    socket.on("connect", () => {
      if (planned === "initial") initialConnections++;
      else if (planned === "renewal") plannedReconnects++;
      else unexpectedReconnects++;
      planned = undefined;
      socket.emit("visibility", { visible: true });
    });
    socket.on("disconnect", (reason) => {
      if (reason !== "io client disconnect") unexpectedDisconnects++;
    });
    socket.on("connect_error", () => {
      socketErrors++;
    });
    async function refresh() {
      const previousToken = token;
      const response = await call(previousToken ? "renewal" : "refresh", "/auth/refresh", {
        method: "POST",
        headers: { cookie },
      });
      const refreshed = JSON.parse(response.body) as {
        accessToken: string;
        user: { username: string };
      };
      token = refreshed.accessToken;
      if (!response.cookie || response.cookie === cookie || !token || token === previousToken)
        throw new Error("Expected a rotated fixture session");
      cookie = response.cookie;
      if (refreshed.user.username !== session.username)
        throw new Error("Restored the wrong account");
      pendingSessionCheck = previousToken ? "renewal" : "initial";
      planned = pendingSessionCheck;
      if (index === 0) controlToken = token;
      refreshAt = performance.now() + RENEWAL_MS;
      socket.auth = { token };
      socket.disconnect().connect();
    }
    const request = async (name: string, path: string, method = "GET", status = 200) => {
      const response = await call(
        name,
        path,
        { method, headers: { authorization: `Bearer ${token}` } },
        status,
      );
      // Confirm the token with the next normal protected request without charging an extra probe.
      if (pendingSessionCheck === "initial") restoredSessions++;
      if (pendingSessionCheck === "renewal") renewedSessions++;
      pendingSessionCheck = undefined;
      return response;
    };
    try {
      await refresh();
      let pollAt = 0;
      let navigateAt = 0;
      let visits = 0;
      while (performance.now() < deadline) {
        if (performance.now() >= refreshAt) await refresh();
        if (performance.now() >= pollAt) {
          await Promise.all([
            request("unread", "/notifications/unread-count"),
            request("notices", "/moderation/notices"),
            request("messages-unread", "/messages/unread-count"),
          ]);
          pollAt = performance.now() + 30_000;
        }
        if (performance.now() >= navigateAt) {
          const first = JSON.parse((await request("feed", "/posts?feed=all")).body) as Feed;
          const second = first.nextCursor
            ? (JSON.parse(
                (
                  await request(
                    "feed-next",
                    `/posts?feed=all&cursor=${encodeURIComponent(first.nextCursor)}`,
                  )
                ).body,
              ) as Feed)
            : first;
          const post = second.items[(index + visits) % second.items.length];
          if (!post) throw new Error("Expected a seeded post in the feed");
          await request("post", `/posts/${post.id}`);
          await Promise.all([
            request("comments", `/posts/${post.id}/comments`),
            request("post-view", `/posts/${post.id}/view`, "POST", 204),
          ]);
          const username = sessions[(index + visits + 1) % sessions.length]!.username;
          await Promise.all([
            request("profile", `/users/${username}`),
            request("profile-posts", `/users/${username}/posts`),
          ]);
          visits++;
          navigateAt = performance.now() + 30_000 + ((index + visits * 17) % 10000);
        }
        await sleep(
          Math.max(0, Math.min(pollAt, navigateAt, refreshAt, deadline) - performance.now()),
        );
      }
    } catch {
      failedIterations++;
    } finally {
      socket.disconnect();
    }
  }

  const sample = () => service.connected && service.send("sample");
  sample();
  const interval = setInterval(sample, 5000);
  const progress = setInterval(() => {
    const elapsed = Math.min(seconds, Math.floor((performance.now() - started) / 1000));
    process.stdout.write(
      `Load ${elapsed}/${seconds}s: ${samples.at(-1)?.online ?? 0} online, ${renewedSessions} renewed, ${failedIterations} failed workflows, ${socketErrors + unexpectedDisconnects} socket issues\n`,
    );
  }, 60_000);
  try {
    await Promise.all(sessions.map(virtualUser));
  } finally {
    clearInterval(interval);
    clearInterval(progress);
  }
  const elapsedSeconds = Math.round((performance.now() - started) / 1000);

  // A separate probe confirms protection is active. Its expected 429 is excluded from workload metrics.
  async function control(path: string, preceding: number, expectedLimiter: string, token?: string) {
    const headers = {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
    for (let i = 0; i <= preceding; i++) {
      const response = await fetch(api + "/api" + path, {
        method: "POST",
        headers,
        body: "{}",
        signal: AbortSignal.timeout(5000),
      });
      await response.text();
      if (i === preceding) {
        return (
          response.status === 429 &&
          response.headers.get("x-ratelimit-limiter") === expectedLimiter &&
          Number(response.headers.get("retry-after")) > 0
        );
      }
      if (response.status !== 400) return false;
    }
    return false;
  }
  const controls = {
    login: await control("/auth/login", 20, "auth"),
    registration: await control("/auth/register", 0, "auth"),
    upload: await control("/uploads", 30, "upload", controlToken),
  };
  const expected429 = Object.values(controls).every(Boolean);

  const endpoints = Object.fromEntries(
    [...metrics].map(([name, endpoint]) => [name, summarize(endpoint)]),
  );
  const timeline = Array.from(minutes, ([minute, window]) => ({
    minute: minute + 1,
    endpoints: Object.fromEntries(
      [...window].map(([name, endpoint]) => [name, summarize(endpoint)]),
    ),
  }));
  const first = samples[0];
  const last = samples.at(-1);
  const resources = {
    peakOnline: Math.max(0, ...samples.map((row) => row.online)),
    peakApiAndRealtimeRssMiB: Math.round(
      Math.max(0, ...samples.map((row) => row.rssBytes)) / 1024 ** 2,
    ),
    apiAndRealtimeCpuPercentOfOneCore:
      first && last && last.at > first.at
        ? Math.round(((last.cpuMs - first.cpuMs) / (last.at - first.at)) * 100)
        : null,
    peakMongoResidentMiB: Math.max(0, ...samples.map((row) => row.mongoResidentMiB ?? 0)) || null,
    peakMongoConnections: Math.max(0, ...samples.map((row) => row.mongoConnections ?? 0)) || null,
  };
  const unexpected429 = Object.values(endpoints).reduce(
    (sum, row) => sum + (row.statuses["429"] ?? 0),
    0,
  );
  const serverErrors = Object.values(endpoints)
    .flatMap((row) => Object.entries(row.statuses))
    .reduce((sum, [status, count]) => sum + (status.startsWith("5") ? count : 0), 0);
  const report = {
    users,
    seconds,
    elapsedSeconds,
    network: "shared IP (loopback)",
    unexpected429,
    serverErrors,
    expected429,
    controls,
    failedIterations,
    socketErrors,
    restoredSessions,
    renewedSessions,
    initialConnections,
    reconnects: plannedReconnects + unexpectedReconnects,
    plannedReconnects,
    unexpectedReconnects,
    unexpectedDisconnects,
    resources,
    endpoints,
    timeline,
    samples,
  };
  await mkdir("test-results", { recursive: true });
  const path = `test-results/load-bubble-${users}-${seconds}s.json`;
  await writeFile(path, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(
    JSON.stringify(
      {
        users,
        seconds,
        elapsedSeconds,
        unexpected429,
        serverErrors,
        expected429,
        controls,
        failedIterations,
        socketErrors,
        restoredSessions,
        renewedSessions,
        plannedReconnects,
        unexpectedReconnects,
        unexpectedDisconnects,
        resources,
        path,
      },
      null,
      2,
    ) + "\n",
  );
  if (
    unexpected429 ||
    serverErrors ||
    !expected429 ||
    failedIterations ||
    socketErrors ||
    unexpectedReconnects ||
    unexpectedDisconnects ||
    resources.peakOnline !== users ||
    initialConnections !== users ||
    restoredSessions !== users ||
    (seconds === 1200 && (renewedSessions !== users || plannedReconnects !== users))
  )
    process.exitCode = 1;
} finally {
  if (service.connected) service.send("stop");
  await exited;
}
