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
  firstRefresh?: "offline" | "rate-limited",
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
      if (refreshes === 1 && firstRefresh === "rate-limited") {
        return route.fulfill({ status: 429, headers: { "Retry-After": "1", "X-RateLimit-Limiter": "refresh-account",
          "CF-Ray": "0123456789abcdef-FRA", "X-Request-Id": "54" } });
      }
      return route.fulfill({ json: { accessToken: "fixture", user: viewer } });
    }
    if (path === "/client-network") {
      events?.push(...route.request().postDataJSON().events as ClientNetworkEvent[]);
      return route.fulfill({ status: 204 });
    }
    if (path === "/posts") return route.fulfill({ json: { items: posts, nextCursor: null } });
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

for (const failure of ["offline", "rate-limited"] as const) {
  test(`recover the session after a temporary ${failure} response`, async ({ page }) => {
    const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
    const events: ClientNetworkEvent[] = [];
    const refreshes = await installFixtures(page, origin, failure, events);
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("tab", { name: "Все записи" })).toBeVisible();
    expect(refreshes()).toBe(2);
    await expect(
      page.getByText("Не удалось проверить сеанс. Попробуйте ещё раз чуть позже."),
    ).toHaveCount(0);
    const expected = failure === "offline" ? { kind: "network" }
      : { kind: "http", status: 429, limiter: "refresh-account", retryAfter: 1, requestId: "54", cfRay: "0123456789abcdef-FRA" };
    await expect.poll(() => events.find(({ route }) => route === "/auth/refresh")).toMatchObject({ method: "POST", ...expected });
  });
}

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
