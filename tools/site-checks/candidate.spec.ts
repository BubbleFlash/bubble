import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { AccountUser, ClientNetworkEvent, MetricsReport, NetworkReport, PostDTO } from "@commune/shared";

const createdAt = "2026-11-17T00:00:00Z";
const viewer: AccountUser = {
  id: "viewer",
  username: "viewer",
  bio: "",
  avatarUrl: null,
  role: "user",
  plus: false,
  emailVerified: true,
  createdAt,
};
const posts: PostDTO[] = Array.from({ length: 60 }, (_, index) => ({
  id: `fixture-${index}`,
  author: { id: "author", username: "author", avatarUrl: null, plus: false },
  content: `Тестовая запись ${index} https://example.test/${index}`,
  createdAt,
  likeCount: 0,
  likedByMe: false,
  commentCount: 0,
  repostCount: 0,
  imageUrl: null,
  community: null,
  musicAttachments: [
    {
      id: `track-${index}`,
      title: "Тестовый трек",
      artist: "Исполнитель",
      duration: 120,
      unavailable: false,
    },
  ],
}));

async function installFixtures(
  page: Page,
  origin: string,
  firstRefresh?: "offline" | "rate-limited" | "unavailable",
  events?: ClientNetworkEvent[],
) {
  let refreshes = 0;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();

    const path = url.pathname.slice("/api".length);
    if (path === "/auth/refresh") {
      refreshes++;
      if (refreshes === 1 && firstRefresh === "offline") return route.abort("internetdisconnected");
      if (refreshes === 1 && firstRefresh === "unavailable") return route.fulfill({ status: 503, json: {} });
      if (refreshes === 1 && firstRefresh === "rate-limited") {
        return route.fulfill({ status: 429, headers: { "Retry-After": "3", "X-RateLimit-Limiter": "refresh-account",
          "CF-Ray": "0123456789abcdef-FRA", "X-Request-Id": "54" } });
      }
      return route.fulfill({ json: { accessToken: "fixture", user: viewer } });
    }
    if (path === "/client-network") {
      events?.push(...route.request().postDataJSON().events as ClientNetworkEvent[]);
      return route.fulfill({ status: 204 });
    }
    if (path === "/posts") return route.fulfill({ json: { items: posts, nextCursor: null } });
    if (path === "/public/posts") return route.fulfill({ json: { items: [], nextCursor: null } });
    if (path === "/site-content") return route.fulfill({ json: {
      about: "Bubble — независимая социальная сеть.", benefits: "", principles: "", rules: "",
    } });
    if (path === "/site-team") return route.fulfill({ json: { groups: {
      developers: [], artists: [], testers: [], moderators: [], administrators: [],
    } } });
    if (path === "/music/picker") return route.fulfill({ json: { tracks: [], nextCursor: null } });
    if (path === "/posts/fixture-0") return route.fulfill({ json: posts[0] });
    if (path === "/music/library/status") return route.fulfill({ json: { ids: [] } });
    if (path === "/link-preview") return route.fulfill({ json: { preview: null } });
    if (path === "/moderation/notices")
      return route.fulfill({ json: { warnings: [], publishing: null } });
    if (path.endsWith("/unread-count")) return route.fulfill({ json: { count: 0 } });
    if (path === "/news" || path === "/posts/fixture-0/comments")
      return route.fulfill({ json: [] });
    if (path === "/posts/fixture-0/view") return route.fulfill({ status: 204 });
    return route.fulfill({ status: 404, json: { error: "Missing local fixture" } });
  });
  return () => refreshes;
}

test("scroll the feed, open comments and follow a post link", async ({ page }, info) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  const started = performance.now();
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  const cards = page.locator("article.feed-post");
  await expect(cards).toHaveCount(posts.length);
  const first = cards.first();
  await expect(first).toBeVisible();
  const feedReadyMs = Math.round(performance.now() - started);

  const scroll = await page.evaluate(async () => {
    const intervals: number[] = [];
    const start = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
    let previous = start;
    const initialY = window.scrollY;
    await new Promise<void>((resolve) => {
      function frame(now: number) {
        intervals.push(now - previous);
        previous = now;
        window.scrollTo(0, initialY + Math.min(now - start, 1500) * 2);
        if (now - start < 1500) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
    intervals.sort((a, b) => a - b);
    return {
      distancePx: window.scrollY - initialY,
      frameCallbacks: intervals.length,
      p95FrameIntervalMs: intervals[Math.ceil(intervals.length * 0.95) - 1],
      worstFrameIntervalMs: intervals.at(-1),
    };
  });
  expect(scroll.distancePx).toBeGreaterThan(1000);
  await page.evaluate(() => window.scrollTo(0, 0));

  const commentsStarted = performance.now();
  await first.getByRole("button", { name: "0 комментариев" }).click();
  await expect(first.getByText("Комментариев пока нет.")).toBeVisible();
  const commentsReadyMs = Math.round(performance.now() - commentsStarted);

  const postStarted = performance.now();
  await first.getByRole("link", { name: /^Открыть публикацию/ }).click();
  await expect(page).toHaveURL(`${origin}/posts/fixture-0`);
  await expect(page.getByRole("link", { name: /Вернуться к ленте/ })).toBeVisible();
  await expect(page.getByText(/^Тестовая запись 0/)).toBeVisible();
  await info.attach("feed-timings", {
    body: JSON.stringify({
      feedReadyMs,
      scroll,
      commentsReadyMs,
      postReadyMs: Math.round(performance.now() - postStarted),
    }),
    contentType: "application/json",
  });
  expect(runtimeErrors).toEqual([]);
});

for (const failure of ["offline", "rate-limited", "unavailable"] as const) {
  test(`recover the session after a temporary ${failure} response`, async ({ page }) => {
    const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
    const events: ClientNetworkEvent[] = [];
    const refreshes = await installFixtures(page, origin, failure, events);
    let navigations = 0;
    const refreshTimes: number[] = [];
    page.on("request", (req) => {
      if (req.isNavigationRequest() && req.frame() === page.mainFrame()) navigations++;
      if (req.url() === `${origin}/api/auth/refresh`) refreshTimes.push(Date.now());
    });
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    if (failure === "rate-limited") {
      await expect(page.getByRole("button", { name: "Повторить" })).toBeDisabled();
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      expect(refreshes()).toBe(1);
    }
    await expect(page.getByRole("tab", { name: "Все записи" })).toBeVisible();
    expect(refreshes()).toBe(2);
    expect(navigations).toBe(1);
    if (failure === "rate-limited") expect(refreshTimes[1]! - refreshTimes[0]!).toBeGreaterThanOrEqual(3000);
    const expected = failure === "offline" ? { kind: "network" }
      : failure === "unavailable" ? { kind: "http", status: 503 }
      : { kind: "http", status: 429, limiter: "refresh-account", retryAfter: 3, requestId: "54", cfRay: "0123456789abcdef-FRA" };
    await expect.poll(() => events.find(({ route }) => route === "/auth/refresh")).toMatchObject({ method: "POST", ...expected });
  });
}

for (const status of [401, 403] as const) {
  test(`terminal session ${status} does not retry`, async ({ page }) => {
    const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
    await installFixtures(page, origin);
    await page.clock.install();
    let requests = 0;
    await page.route("**/api/auth/refresh", (route) => {
      requests++;
      return route.fulfill({ status, json: status === 401 ? { error: "Session expired" }
        : { restriction: { kind: "account", reason: "Тестовое ограничение", until: null } } });
    });
    await page.goto(origin);
    await expect(page.getByRole("heading", { name: status === 401 ? "Твой уголок интернета" : "Аккаунт заблокирован" })).toBeVisible();
    if (status === 401) {
      await expect(page.getByText("Bubble — независимая социальная сеть.", { exact: true })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Войти", exact: true })).toBeVisible();
    }
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.clock.fastForward(30_000);
    expect(requests).toBe(1);
  });
}

test("a second tab honors the same session cooldown", async ({ page, context }) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin, "rate-limited");
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Повторить" })).toBeDisabled();
  const until = await page.evaluate(() => JSON.parse(localStorage.getItem("bubble-refresh-cooldown")!).until as number);
  const second = await context.newPage();
  await installFixtures(second, origin);
  const requests: number[] = [];
  second.on("request", (request) => {
    if (request.url() === `${origin}/api/auth/refresh`) requests.push(Date.now());
  });
  await second.goto(origin, { waitUntil: "domcontentloaded" });
  await expect(second.getByRole("tab", { name: "Все записи" })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toBeGreaterThanOrEqual(until);
});

const musicChunk = /\/assets\/MusicPage-[^/]+\.js$/;

test("ordinary API failure stays on the page without reloading", async ({ page }) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  let requests = 0, navigations = 0;
  await page.route((url) => url.pathname === "/api/music/picker", (route) => {
    requests++;
    return route.fulfill({ status: 503, json: {} });
  });
  page.on("request", (req) => { if (req.isNavigationRequest() && req.url() === `${origin}/music`) navigations++; });
  await page.goto(`${origin}/music`);
  await expect(page.getByRole("heading", { name: "Музыка", exact: true })).toBeVisible();
  await expect.poll(() => requests).toBe(2);
  await expect(page.getByRole("tabpanel", { name: "Моя библиотека" }).getByRole("alert"))
    .toHaveText("Не удалось выполнить запрос (код 503).");
  expect(navigations).toBe(1);
});

test("a failed route preserves the global player until an explicit reload", async ({ page }) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  // The real audio element plays a fixture signal with no network or media dependencies.
  const frameCount = 8000 * 30;
  const wav = Buffer.alloc(44 + frameCount, 128);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + frameCount, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28);
  wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write("data", 36); wav.writeUInt32LE(frameCount, 40);
  await page.route("**/api/music/track-0/play", (route) => route.fulfill({ json: { url: `${origin}/fixture.wav` } }));
  await page.route("**/fixture.wav", (route) => route.fulfill({ contentType: "audio/wav", body: wav }));
  await page.route(musicChunk, (route) => route.fulfill({ status: 404 }));
  await page.goto(origin);
  await page.locator("article.feed-post").first().getByRole("button", { name: /^Воспроизвести Тестовый трек/ }).click();
  const player = page.getByRole("region", { name: "Музыкальный плеер" });
  await expect(player.getByRole("button", { name: "Пауза", exact: true })).toBeVisible();
  // Navigate through the router on mobile too, where the link is inside the menu.
  if (!await page.getByRole("link", { name: "Музыка", exact: true }).first().isVisible()) {
    await page.getByRole("button", { name: "Открыть меню", exact: true }).filter({ visible: true }).first().click();
  }
  await page.getByRole("link", { name: "Музыка", exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByText("Обновление страницы остановит плеер.")).toBeVisible();
  await expect(player.getByRole("button", { name: "Пауза", exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("bubble_chunk_reloaded_at"))).toBeNull();
  await Promise.all([
    page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame()),
    page.getByRole("button", { name: "Обновить страницу" }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "Страница не загрузилась" })).toBeVisible();
  await expect(player).toHaveCount(0);
});

for (const persistent of [false, true]) {
  test(`missing module ${persistent ? "shows the recovery screen" : "recovers"} after one reload`, async ({ page }) => {
    const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
    await installFixtures(page, origin);
    let navigations = 0, attempts = 0;
    const errors: Array<{ category?: string; path?: string }> = [];
    page.on("request", (req) => {
      if (req.isNavigationRequest() && req.url() === `${origin}/music`) navigations++;
      if (req.url() === `${origin}/api/client-errors`) errors.push(req.postDataJSON());
    });
    await page.route(musicChunk, (route) => {
      attempts++;
      return persistent || attempts === 1 ? route.fulfill({ status: 404 }) : route.continue();
    });
    await page.goto(`${origin}/music`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => [attempts, navigations]).toEqual([2, 2]);
    await expect(page.getByRole("heading", { name: persistent ? "Страница не загрузилась" : "Музыка", exact: true })).toBeVisible();
    await expect.poll(() => errors).toContainEqual(expect.objectContaining({ category: "chunk", path: "/music" }));
    expect(attempts).toBe(2);
    expect(navigations).toBe(2);
    if (persistent) {
      await expect(page.getByRole("button", { name: "Обновить страницу" })).toBeVisible();
      await page.locator('[role="alert"]').getByRole("link", { name: "На главную" }).click();
      await expect(page.getByRole("tab", { name: "Все записи" })).toBeVisible();
      expect(navigations).toBe(2);
    }
  });
}

test.describe("installed service worker", () => {
  test.use({ serviceWorkers: "allow" });

  test("controls the page, passes Socket.IO through and serves the offline shell", async ({ page, context }) => {
    const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
    await installFixtures(page, origin);
    await page.goto(origin);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    const [authorized] = await Promise.all([
      page.waitForEvent("websocket", (candidate) => candidate.url().includes("transport=websocket"))
        .then((websocket) => websocket.waitForEvent("framereceived", (frame) => String(frame.payload).startsWith("40{"))),
      page.reload(),
    ]);
    expect(String(authorized.payload)).toMatch(/^40\{/);
    const resources = await page.evaluate(async () => {
      const socketResponse = await fetch("/socket.io/?EIO=4&transport=polling");
      const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!;
      const manifestData = await fetch(manifest.href).then((response) => response.json());
      const cacheNames = await caches.keys();
      const keys = (await Promise.all(cacheNames.map(async (name) => (await caches.open(name)).keys()))).flat();
      return {
        handshake: (await socketResponse.text()).startsWith("0{"),
        hasManifest: typeof manifestData.name === "string" && Array.isArray(manifestData.icons),
        hasOffline: Boolean(await caches.match("/offline.html")),
        cachedSocket: keys.some((request) => new URL(request.url).pathname.startsWith("/socket.io/")),
      };
    });
    expect(resources).toEqual({ handshake: true, hasManifest: true, hasOffline: true, cachedSocket: false });

    // A different script URL acts as a newer build under the same registration scope.
    await page.evaluate(() => navigator.serviceWorker.register("/sw.js?fixture-update=1").then(() => true));
    const update = page.getByRole("region", { name: "Состояние приложения" });
    await expect(update.getByText("Доступна новая версия Bubble.")).toBeVisible();
    const controllerChanged = page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame());
    await update.getByRole("button", { name: "Обновить", exact: true }).click();
    await controllerChanged;
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toContain("fixture-update=1");

    await context.setOffline(true);
    const offline = await page.goto(`${origin}/explore`, { waitUntil: "domcontentloaded" });
    expect(offline?.fromServiceWorker()).toBe(true);
    expect(offline?.ok()).toBe(true);
  });
});

test("admin monitoring filters incidents and downloads the selected CSV", async ({ page }) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  const metric = { route: "/auth/login", method: "POST", count: 21, limited: 1, serverErrors: 0, clientErrors: 20, p95Ms: 50, p99Ms: 100 };
  const metrics: MetricsReport = { from: createdAt, until: createdAt, total: metric, rows: [metric] };
  const incident = { source: "api", kind: "http", method: "POST", route: "/auth/login", status: 429,
    limiter: "auth", limit: 20, windowSeconds: 900, retryAfter: 896, requestId: "54", cfRay: "0123456789abcdef-FRA",
    count: 1, firstSeen: createdAt, lastSeen: createdAt } as const;
  const network: NetworkReport = { from: createdAt, until: createdAt, rows: [incident,
    { ...incident, source: "web", kind: "offline", status: null, limiter: null, limit: null, windowSeconds: null, retryAfter: null },
  ] };
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/refresh") return route.fulfill({ json: { accessToken: "fixture", user: { ...viewer, role: "admin" } } });
    if (path === "/api/admin/telemetry/metrics") return route.fulfill({ json: metrics });
    if (path === "/api/admin/telemetry/network") return route.fulfill({ json: network });
    if (path === "/api/admin/errors") return route.fulfill({ json: [{ id: "fixture-error", source: "web", message: "private fixture", route: "/posts/private-fixture", status: null,
      count: 3, firstSeen: createdAt, lastSeen: createdAt, resolved: false, stack: "private stack" }] });
    return route.fallback();
  });

  await page.goto(`${origin}/admin/errors`);
  await expect(page.getByRole("heading", { name: "Мониторинг" })).toBeVisible();
  const csv = async () => {
    const ready = page.waitForEvent("download");
    await page.getByRole("button", { name: "Скачать CSV" }).click();
    return readFile(await (await ready).path(), "utf8");
  };
  await expect(page.getByText("private fixture", { exact: true })).toBeVisible();
  const errors = await csv();
  expect(errors).toContain("fixture-error");
  expect(errors).not.toMatch(/private fixture|private stack|private-fixture/);
  await page.getByRole("link", { name: "Метрики API" }).click();
  await expect(page.getByRole("row", { name: /POST \/auth\/login/ })).toBeVisible();
  expect(await csv()).toContain('"p95_upper_ms"');
  await page.getByRole("link", { name: "Сеть и 429" }).click();
  await expect(page.getByText("20 за 900 с")).toBeVisible();
  await page.getByRole("combobox", { name: "События", exact: true }).selectOption("429");
  await expect(page.getByText("Офлайн", { exact: true })).toHaveCount(0);
  const report = await csv();
  expect(report).toContain('"429","auth","20","900","896","54","0123456789abcdef-FRA"');
  expect(report).not.toContain('"offline"');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );
});
