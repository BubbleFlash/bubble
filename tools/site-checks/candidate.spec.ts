import { expect, test, type Page } from "@playwright/test";
import type { AccountUser, PostDTO } from "@commune/shared";

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
        return route.fulfill({ status: 429, headers: { "Retry-After": "1" } });
      }
      return route.fulfill({ json: { accessToken: "fixture", user: viewer } });
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
    const refreshes = await installFixtures(page, origin, failure);
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("tab", { name: "Все записи" })).toBeVisible();
    expect(refreshes()).toBe(2);
    await expect(
      page.getByText("Не удалось проверить сеанс. Попробуйте ещё раз чуть позже."),
    ).toHaveCount(0);
  });
}
