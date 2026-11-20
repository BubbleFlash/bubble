import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import type { Duplex } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect, type BrowserContext } from "@playwright/test";
import { build, preview } from "vite";

const port = Number(process.env.BUBBLE_TAB_CHECK_PORT ?? 4185);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid browser fixture port");
const origin = `http://bubble.localhost:${port}`;
const root = fileURLToPath(new URL("../../apps/web", import.meta.url));
const output = process.env.BUBBLE_TAB_CHECK_REPORT ?? "test-results/site-tabs.json";
const browsers = (process.env.BUBBLE_TAB_CHECK_BROWSERS ?? "chrome").split(",");
const verify = process.env.BUBBLE_TAB_CHECK_ASSERT === "1";
const expectExpiry = process.env.BUBBLE_TAB_CHECK_EXPIRE === "1";
const feed = /^Fixture post /;

type Sample = { route: string; status?: number; bytes?: number };
type Fixtures = {
  kind: "ready";
  api: string;
  sockets: string;
  sessions: { cookie: string; username: string }[];
  posts: { id: string; content: string }[];
};
type Tab = Awaited<ReturnType<typeof observe>>;

async function observe(context: BrowserContext) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const requests = new Map<string, Sample>();
  let handshakes = 0;
  let connected = 0;
  let authenticated = 0;
  let peakSockets = 0;
  const sockets = new Set<string>();
  await cdp.send("Network.enable");
  await cdp.send("Page.enable");
  cdp.on("Page.frameNavigated", ({ frame }) => {
    if (!frame.parentId) sockets.clear();
  });
  cdp.on("Network.requestWillBeSent", ({ request, requestId }) => {
    const url = new URL(request.url);
    if (url.origin === origin && url.pathname.startsWith("/api/")) {
      requests.set(requestId, { route: `${request.method} ${url.pathname}` });
    }
  });
  cdp.on("Network.responseReceived", ({ response, requestId }) => {
    const sample = requests.get(requestId);
    if (sample) sample.status = response.status;
  });
  cdp.on("Network.loadingFinished", ({ requestId, encodedDataLength }) => {
    const sample = requests.get(requestId);
    if (sample) sample.bytes = encodedDataLength;
  });
  cdp.on("Network.webSocketHandshakeResponseReceived", ({ requestId, response }) => {
    handshakes++;
    if (response.status !== 101) return;
    sockets.add(requestId);
    connected++;
    peakSockets = Math.max(peakSockets, sockets.size);
  });
  cdp.on("Network.webSocketFrameReceived", ({ requestId, response }) => {
    if (sockets.has(requestId) && response.payloadData.startsWith("40{")) authenticated++;
  });
  cdp.on("Network.webSocketClosed", ({ requestId }) => {
    sockets.delete(requestId);
  });
  return {
    page,
    requests,
    socketStats: () => ({
      handshakes,
      connected,
      authenticated,
      peakSockets,
      active: sockets.size,
    }),
  };
}

async function openFeed(tab: Tab) {
  const start = performance.now();
  await tab.page.goto(origin, { waitUntil: "domcontentloaded" });
  const all = tab.page.getByRole("tab", { name: "Все записи" });
  try {
    await all.click({ timeout: 6000 });
    await tab.page.getByText(feed).first().waitFor({ timeout: 6000 });
    return { readyMs: Math.round(performance.now() - start), authorized: true };
  } catch {
    return { authorized: false };
  }
}

function report(tab: Tab) {
  const endpoints: Record<
    string,
    { requests: number; bytes: number; statuses: Record<string, number> }
  > = {};
  for (const { route, bytes, status } of tab.requests.values()) {
    const row = (endpoints[route] ??= { requests: 0, bytes: 0, statuses: {} });
    row.requests++;
    row.bytes += bytes ?? 0;
    const outcome = status ?? "no-response";
    row.statuses[outcome] = (row.statuses[outcome] ?? 0) + 1;
  }
  return { endpoints, ...tab.socketStats() };
}

async function checkRealtime(
  fixture: Fixtures,
  receiver: string,
  tab: Tab,
  peer: Tab,
  interrupt: (paused: boolean) => void,
) {
  const sender = fixture.sessions.at(-1)!;
  const refreshed = await fetch(`${fixture.api}/api/auth/refresh`, {
    method: "POST",
    headers: { Cookie: sender.cookie, Origin: origin },
  });
  if (!refreshed.ok) throw new Error(`Fixture sender refresh failed: ${refreshed.status}`);
  const { accessToken } = (await refreshed.json()) as { accessToken: string };
  // Keep the rotated cookie for the next browser's fixture sender.
  sender.cookie = refreshed.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("commune_rt="))!
    .split(";")[0]!;
  const send = async (path: string, body: object, method = "POST") => {
    const response = await fetch(`${fixture.api}/api${path}`, {
      method,
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Origin: origin,
      },
    });
    if (!response.ok) throw new Error(`Local event fixture ${path} failed: ${response.status}`);
    return response.status === 204 ? undefined : await response.json();
  };
  const { page } = tab;
  const post = fixture.posts.find((post) => post.content === `Fixture post 0 by ${receiver}`)!;
  await page.bringToFront();
  await page.goto(`${origin}/notifications`);
  await page.getByText("Уведомлений пока нет.").waitFor({ timeout: 10_000 });
  await send(`/posts/${post.id}/comments`, { content: "Fixture notification" });
  const unread = page
    .locator(".notification-list .notification.unread")
    .filter({ hasText: sender.username });
  await unread.waitFor({ timeout: 10_000 });
  const bell = peer.page.getByRole("button", { name: "Уведомления", exact: true });
  await peer.page.bringToFront();
  await bell.click();
  await peer.page
    .locator(".notification-popup .notification.unread")
    .filter({ hasText: sender.username })
    .waitFor();
  await Promise.all([
    peer.page.waitForResponse(
      (res) => new URL(res.url()).pathname === "/api/notifications/read" && res.ok(),
    ),
    bell.click(),
  ]);
  await page.bringToFront();
  await unread.waitFor({ state: "hidden", timeout: 10_000 });

  const { conversationId } = await send(`/messages/with/${receiver}`, {
    text: "Fixture initial message",
  });
  const path = `/messages/${conversationId}`;
  await page.goto(`${origin}${path}`);
  const messages = page.locator(".chat-messages");
  await messages.getByText("Fixture initial message", { exact: true }).waitFor();
  const { id } = await send(path, { text: "Fixture live message" });
  await messages.getByText("Fixture live message", { exact: true }).waitFor({ timeout: 8000 });
  await send(`${path}/items/${id}`, { text: "Fixture edited message" }, "PATCH");
  const edited = messages.getByText("Fixture edited message", { exact: true });
  await edited.waitFor({ timeout: 8000 });
  await send(`${path}/items/${id}`, {}, "DELETE");
  await edited.waitFor({ timeout: 8000, state: "hidden" });
  const connections = tab.socketStats().authenticated;
  interrupt(true);
  try {
    await expect
      .poll(() => tab.socketStats().active, {
        timeout: 5000,
        message: "Browser received the transport close",
      })
      .toBe(0);
    await send(path, { text: "Fixture message during disconnect" });
  } finally {
    interrupt(false);
  }
  await expect
    .poll(() => tab.socketStats().authenticated, {
      timeout: 10_000,
      message: "Socket.IO reconnected",
    })
    .toBeGreaterThan(connections);
  await page.bringToFront();
  try {
    await messages
      .getByText("Fixture message during disconnect", { exact: true })
      .waitFor({ timeout: 10_000 });
  } catch (error) {
    throw new Error(
      `Missed message did not recover (visibility=${await page.evaluate(() => document.visibilityState)}, thread reads=${report(tab).endpoints[`GET /api${path}`]?.requests})`,
      { cause: error },
    );
  }
}

await build({ root, logLevel: "warn" });
const service = fork(fileURLToPath(new URL("../load-check/service.mts", import.meta.url)), ["20"], {
  env: { ...process.env, BUBBLE_TAB_CHECK_PORT: String(port), COOKIE_SECURE: "false" },
  execArgv: ["--import", "tsx"],
  stdio: ["ignore", "ignore", "inherit", "ipc"],
});
const exited = once(service, "exit");
let web: Awaited<ReturnType<typeof preview>> | undefined;
try {
  const fixture = await Promise.race([
    once(service, "message").then(([message]) => message as Fixtures),
    exited.then(() => {
      throw new Error("Local fixture exited before startup");
    }),
  ]);
  if (![fixture.api, fixture.sockets].every((url) => /^http:\/\/127\.0\.0\.1:\d+$/.test(url))) {
    throw new Error("Expected loopback fixtures");
  }
  const transports = new Set<Duplex>();
  const track = (socket: Duplex) => {
    transports.add(socket);
    socket.once("close", () => transports.delete(socket));
  };
  let socketsPaused = false;
  const interrupt = (paused: boolean) => {
    socketsPaused = paused;
    if (paused) for (const socket of transports) socket.destroy();
  };
  web = await preview({
    root,
    preview: {
      host: "127.0.0.1",
      port,
      strictPort: true,
      proxy: {
        "/api": fixture.api,
        "/socket.io": {
          target: fixture.sockets,
          ws: true,
          bypass: () => (socketsPaused ? false : undefined),
          configure(proxy) {
            proxy.on("proxyReqWs", (request, _incoming, socket: Duplex) => {
              track(socket);
              request.once("upgrade", (_response, upstream) => track(upstream));
            });
          },
        },
      },
    },
  });
  const samples = [];
  for (let i = 0; i < browsers.length; i++) {
    const channel = browsers[i]!;
    const browser = await chromium.launch({ channel });
    try {
      for (const [caseIndex, count] of [1, 2, 5].entries()) {
        const context = await browser.newContext({ serviceWorkers: "block" });
        try {
          const session = fixture.sessions[i * 3 + caseIndex];
          if (!session) throw new Error("Too many browser fixtures requested");
          await context.addCookies([
            {
              name: "commune_rt",
              value: session.cookie.slice("commune_rt=".length),
              domain: "bubble.localhost",
              path: "/api/auth",
              httpOnly: true,
              sameSite: "Lax",
            },
          ]);
          // Keep external widgets and analytics out of the local test. CDP measures API bytes only.
          await context.route("**/*", async (route) => {
            const url = new URL(route.request().url());
            if (url.origin !== origin) return route.abort();
            if (url.pathname === "/api/server-fundraiser")
              return route.fulfill({
                json: {
                  title: "Fixture",
                  currency: "RUB",
                  current: 0,
                  target: 1,
                  updatedAt: "2026-01-01T00:00:00Z",
                },
              });
            return route.continue();
          });
          const first = await observe(context);
          const initial = await openFeed(first);
          if (!initial.authorized) throw new Error(`Cold authorized load in ${channel} failed`);
          await sleep(300);
          const tabs = await Promise.all(Array.from({ length: count }, () => observe(context)));
          const outcomes = await Promise.all(tabs.map(openFeed));
          await sleep(500);
          samples.push({
            channel,
            simultaneousNewTabs: count,
            initial: { ...initial, ...report(first) },
            tabs: outcomes.map((outcome, j) => ({ ...outcome, ...report(tabs[j]!) })),
          });
          if (verify) {
            for (const [index, outcome] of outcomes.entries()) {
              const tab = tabs[index]!;
              const refresh = report(tab).endpoints["POST /api/auth/refresh"];
              if (
                !outcome.authorized ||
                refresh?.statuses["401"] ||
                tab.socketStats().authenticated !== 1
              )
                throw new Error(`Tab ${index + 1}/${count} did not keep the authenticated session`);
            }
            const requests = tabs.flatMap((tab) => [...tab.requests.values()]);
            if (requests.some(({ status }) => status === 429 || (status ?? 0) >= 500))
              throw new Error("New tabs received a rate limit or server error");
            const badgeReads = requests.filter(({ route }) => route.endsWith("/unread-count"));
            if (badgeReads.length !== 0)
              throw new Error("Warm tabs reloaded fresh shared counters");
            if (requests.filter(({ route }) => route === "GET /api/posts").length > 2)
              throw new Error("Warm tabs issued duplicate feed reads");
            if (count === 5) {
              if (expectExpiry) {
                for (const tab of [first, ...tabs]) {
                  await expect
                    .poll(
                      () => report(tab).endpoints["POST /api/auth/refresh"]?.statuses["200"] ?? 0,
                      {
                        timeout: 22_000,
                        message: "Tab refreshed its expired access token",
                      },
                    )
                    .toBeGreaterThan(1);
                  if (report(tab).endpoints["POST /api/auth/refresh"]?.statuses["401"])
                    throw new Error("Expiring access token invalidated a concurrent session");
                  await expect.poll(() => tab.socketStats().authenticated).toBeGreaterThan(1);
                }
              }
              await checkRealtime(fixture, session.username, first, tabs[0]!, interrupt);
              await first.page.goto(origin);
              first.page.once("dialog", (dialog) => dialog.accept());
              await first.page.getByRole("button", { name: "Выйти", exact: true }).click();
              await Promise.all(
                [first, ...tabs].map(({ page }) =>
                  page
                    .getByRole("heading", { name: "Ваше место для общения" })
                    .waitFor({ timeout: 15_000 }),
                ),
              );
              const newAccount = `tabs_new_${i}`;
              const restored = tabs.map(({ page }) =>
                page.waitForResponse(
                  (response) =>
                    new URL(response.url()).pathname === "/api/auth/refresh" &&
                    response.status() === 200,
                ),
              );
              void Promise.allSettled(restored);
              await first.page.goto(`${origin}/register`);
              await first.page.getByLabel("ID профиля").fill(newAccount);
              await first.page.getByLabel(/почт/i).fill(`${newAccount}@example.invalid`);
              await first.page.getByLabel("Пароль").fill("Fixture-password-3201");
              await first.page.getByRole("button", { name: "Создать аккаунт" }).click();
              for (const response of await Promise.all(restored)) {
                if (
                  ((await response.json()) as { user: { username: string } }).user.username !==
                  newAccount
                )
                  throw new Error("A tab restored the previous account");
              }
              await Promise.all(
                tabs.map(({ page }) => page.getByRole("tab", { name: "Все записи" }).waitFor()),
              );
            }
          }
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
  await mkdir("test-results", { recursive: true });
  await writeFile(output, JSON.stringify({ samples }, null, 2) + "\n");
  process.stdout.write(`${output}\n`);
} finally {
  if (service.connected) service.send("stop");
  await exited;
  await web?.close();
}
