import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { io } from "socket.io-client";

// This runner targets only the explicitly authorized test host.
const origin = "https://test.bubble-web.net";
const users = Number(process.env.BUBBLE_STAGING_USERS ?? 20);
const seconds = Number(process.env.BUBBLE_STAGING_SECONDS ?? 120);
if (![20, 50, 100].includes(users) || !Number.isInteger(seconds) || seconds < 30 || seconds > 1200)
  throw new Error("Set BUBBLE_STAGING_USERS=20|50|100 and BUBBLE_STAGING_SECONDS=30..1200");
const directory = "test-results";
const accountsPath = `${directory}/staging-test-accounts.json`;
type Account = { username: string; password: string; cookie?: string };
const accounts: Account[] = JSON.parse(await readFile(accountsPath, "utf8").catch(() => "[]"));
let accountWrite = Promise.resolve();
function saveAccounts() {
  accountWrite = accountWrite.then(async () => {
    const temporary = `${accountsPath}.tmp`;
    await writeFile(temporary, JSON.stringify(accounts, null, 2), { mode: 0o600 });
    await rename(temporary, accountsPath);
  });
  return accountWrite;
}
const stats: Record<string, { durations: number[]; statuses: Record<string, number>; limiters: Record<string, number> }> = {};
let networkErrors = 0;
async function call(label: string, path: string, options: RequestInit = {}) {
  const start = performance.now();
  const row = stats[label] ??= { durations: [], statuses: {}, limiters: {} };
  try {
    const response = await fetch(`${origin}/api${path}`, { ...options, redirect: "error", signal: AbortSignal.timeout(12000),
      headers: { Origin: origin, ...options.headers } });
    row.statuses[response.status] = (row.statuses[response.status] ?? 0) + 1;
    if (response.status === 429) {
      const limiter = response.headers.get("x-ratelimit-limiter") ?? "unknown";
      row.limiters[limiter] = (row.limiters[limiter] ?? 0) + 1;
    }
    return response;
  } catch (error) {
    networkErrors++;
    throw error;
  } finally { row.durations.push(performance.now() - start); }
}
await mkdir(directory, { recursive: true });
while (accounts.length < users) {
  const username = `loadtest_${randomBytes(5).toString("hex")}`;
  const password = randomBytes(24).toString("base64url");
  const response = await call("register", "/auth/register", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, email: `${username}@example.invalid`, password }) });
  if (response.status === 429) {
    const retry = Number(response.headers.get("retry-after"));
    if (!Number.isFinite(retry) || retry < 1 || retry > 3600) throw new Error("Registration limited without a usable Retry-After");
    console.log(`Registration limited; waiting ${retry}s, ${accounts.length}/${users} accounts ready`);
    await sleep((retry + 1) * 1000);
    continue;
  }
  if (response.status !== 201) throw new Error(`Registration returned ${response.status}; ${accounts.length} accounts saved`);
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith("commune_rt="))?.split(";")[0];
  if (!cookie) throw new Error("Registration did not return a refresh cookie");
  accounts.push({ username, password, cookie });
  await saveAccounts();
  console.log(`Created ${accounts.length}/${users} test accounts`);
  await sleep(1000);
}
// Registration and login share the auth limiter. Honor its cooldown instead of bypassing it.
let socketConnected = 0, socketErrors = 0, socketDisconnects = 0, active = 0, peakActive = 0;
const connectedTransports: Record<string, number> = {};
const socketErrorReasons: Record<string, number> = {};
let failedWorkflows = 0;
const sessions: Array<{ username: string; token: string; cookie: string }> = [];
for (const account of accounts.slice(0, users)) {
  if (account.cookie) continue;
  while (true) {
    const response = await call("login", "/auth/login", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `${account.username}@example.invalid`, password: account.password }) });
    if (response.status === 429) {
      const retry = Number(response.headers.get("retry-after"));
      if (!Number.isFinite(retry) || retry < 1 || retry > 3600) throw new Error("Login limited without a usable Retry-After");
      console.log(`Login limited; waiting ${retry}s, ${sessions.length}/${users} sessions ready`);
      await sleep((retry + 1) * 1000);
      continue;
    }
    if (!response.ok) throw new Error(`Login returned ${response.status}`);
    account.cookie = response.headers.getSetCookie().find((value) => value.startsWith("commune_rt="))?.split(";")[0];
    if (!account.cookie) throw new Error("Login did not return a refresh cookie");
    await saveAccounts();
    break;
  }
}
for (const account of accounts.slice(0, users)) {
  const response = await call("prepare-refresh", "/auth/refresh", { method: "POST", headers: { cookie: account.cookie! } });
  if (!response.ok) throw new Error(`Session preparation returned ${response.status} for ${account.username}`);
  const data = await response.json() as { accessToken: string; user: { username: string } };
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith("commune_rt="))?.split(";")[0];
  if (!cookie || data.user.username !== account.username) throw new Error("Session rotation failed");
  account.cookie = cookie;
  await saveAccounts();
  sessions.push({ username: account.username, token: data.accessToken, cookie });
}
const started = Date.now();
const deadline = started + seconds * 1000;
await Promise.all(sessions.map(async (session, index) => {
  await sleep(index * 100);
  const socket = io(origin, { transports: ["websocket", "polling"], tryAllTransports: true,
    extraHeaders: { Origin: origin }, auth: { token: session.token }, reconnection: true });
  socket.on("connect", () => {
    socketConnected++;
    active++;
    peakActive = Math.max(active, peakActive);
    const transport = socket.io.engine.transport.name;
    connectedTransports[transport] = (connectedTransports[transport] ?? 0) + 1;
  });
  socket.on("connect_error", (error) => {
    socketErrors++;
    const reason = ["websocket error", "xhr poll error", "unauthorized", "too_many_connections", "timeout"].includes(error.message)
      ? error.message : "other";
    socketErrorReasons[reason] = (socketErrorReasons[reason] ?? 0) + 1;
  });
  socket.on("disconnect", (reason) => {
    active--;
    if (reason !== "io client disconnect") socketDisconnects++;
  });
  try {
    let refreshAt = Date.now() + 13 * 60_000;
    let actions = 0;
    while (Date.now() < deadline) {
      if (Date.now() >= refreshAt) {
        const refreshed = await call("refresh", "/auth/refresh", { method: "POST", headers: { cookie: session.cookie } });
        if (!refreshed.ok) throw new Error(`Refresh failed: ${refreshed.status}`);
        const data = await refreshed.json() as { accessToken: string; user: { username: string } };
        const cookie = refreshed.headers.getSetCookie().find((value) => value.startsWith("commune_rt="))?.split(";")[0];
        if (!cookie || data.user.username !== session.username) throw new Error("Unexpected session");
        session.cookie = cookie;
        session.token = data.accessToken;
        const account = accounts.find((item) => item.username === session.username)!;
        account.cookie = cookie;
        // Concurrent writes are serialized below.
        await saveAccounts();
        socket.auth = { token: session.token };
        socket.disconnect().connect();
        refreshAt = Date.now() + 13 * 60_000;
      }
      const headers = { authorization: `Bearer ${session.token}` };
      const response = await call("feed", "/posts?feed=all", { headers });
      if (response.ok) {
        const feed = await response.json() as { items: Array<{ id: string }> };
        const post = feed.items[index % feed.items.length];
        if (post) await call("comments", `/posts/${encodeURIComponent(post.id)}/comments`, { headers });
      }
      await Promise.all([
        call("profile", `/users/${sessions[(index + 1) % sessions.length]!.username}`, { headers }),
        call("notifications", "/notifications/unread-count", { headers }),
        call("messages", "/messages/unread-count", { headers }),
      ]);
      if (actions === 0 && index < Math.min(5, sessions.length)) {
        const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a7sAAAAASUVORK5CYII=", "base64");
        const form = new FormData();
        form.append("file", new Blob([image], { type: "image/png" }), "load-test.png");
        const uploaded = await call("image-upload", "/uploads", { method: "POST", headers, body: form });
        const imageUrl = uploaded.ok ? (await uploaded.json() as { url: string }).url : undefined;
        const response = await call("create-post", "/posts", { method: "POST", headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ content: `Тестовая нагрузка Bubble ${new Date(started).toISOString()} ${session.username}`, imageUrl }) });
        if (response.ok) {
          const post = await response.json() as { id: string };
          await call("create-comment", `/posts/${post.id}/comments`, { method: "POST", headers: { ...headers, "content-type": "application/json" },
            body: JSON.stringify({ content: "Тестовый комментарий нагрузочного прогона" }) });
        }
        await call("send-message", `/messages/with/${sessions[(index + 1) % sessions.length]!.username}`, {
          method: "POST", headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ text: `Тестовое сообщение нагрузочного прогона ${new Date(started).toISOString()}` }),
        });
        if (index === 0) {
          const audio = Buffer.alloc(8044);
          audio.write("RIFF", 0); audio.writeUInt32LE(8036, 4); audio.write("WAVEfmt ", 8);
          audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
          audio.writeUInt32LE(8000, 24); audio.writeUInt32LE(8000, 28);
          audio.writeUInt16LE(1, 32); audio.writeUInt16LE(8, 34); audio.write("data", 36);
          audio.writeUInt32LE(8000, 40); audio.fill(128, 44);
          const ticket = await call("music-sign", "/music/uploads/sign", { method: "POST",
            headers: { ...headers, "content-type": "application/json" },
            body: JSON.stringify({ title: `Тест ${new Date(started).toISOString()}`, artist: "Bubble load test", mimeType: "audio/wav", size: audio.length }) });
          if (ticket.ok) {
            const { url, uploadId } = await ticket.json() as { url: string; uploadId: string };
            if (new URL(url).protocol !== "https:") throw new Error("Music upload URL must use HTTPS");
            const uploadStart = performance.now();
            const upload = await fetch(url, { method: "PUT", headers: { "content-type": "audio/wav" }, body: audio,
              redirect: "error", signal: AbortSignal.timeout(30_000) });
            const row = stats["music-storage-upload"] ??= { durations: [], statuses: {}, limiters: {} };
            row.durations.push(performance.now() - uploadStart);
            row.statuses[upload.status] = (row.statuses[upload.status] ?? 0) + 1;
            if (upload.ok) await call("music-complete", "/music/uploads/complete", { method: "POST",
              headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ uploadId, duration: 1 }) });
          }
        }
      }
      actions++;
      await sleep(30_000 + (index % 10) * 500);
    }
  } catch { failedWorkflows++; }
  finally { socket.disconnect(); }
}));
const endpoints = Object.fromEntries(Object.entries(stats).map(([name, row]) => {
  row.durations.sort((a, b) => a - b);
  const percentile = (p: number) => Math.round(row.durations[Math.ceil(row.durations.length * p) - 1] ?? 0);
  return [name, { requests: row.durations.length, p95Ms: percentile(.95), p99Ms: percentile(.99), statuses: row.statuses, limiters: row.limiters }];
}));
const report = { started: new Date(started).toISOString(), seconds, users, peakActive, socketConnected,
  connectedTransports, socketErrors, socketErrorReasons, socketDisconnects, networkErrors, failedWorkflows, endpoints };
const path = `${directory}/staging-load-${users}-${Date.now()}.json`;
await writeFile(path, JSON.stringify(report, null, 2));
const csv = [["endpoint", "requests", "p95_ms", "p99_ms", "statuses", "limiters"], ...Object.entries(endpoints).map(([name, row]) =>
  [name, row.requests, row.p95Ms, row.p99Ms, JSON.stringify(row.statuses), JSON.stringify(row.limiters)])]
  .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
await writeFile(path.replace(/\.json$/, ".csv"), `\uFEFF${csv}\r\n`);
console.log(JSON.stringify({ path, ...report }, null, 2));
if (peakActive < users || socketErrors || socketDisconnects || networkErrors || failedWorkflows ||
    Object.entries(endpoints).some(([name, row]) => !["register", "login"].includes(name) &&
      Object.entries(row.statuses).some(([status, count]) => count > 0 && (Number(status) === 429 || Number(status) >= 500)))) {
  process.exitCode = 1;
}
