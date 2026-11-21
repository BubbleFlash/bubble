import { expect, test } from "@playwright/test";

test("open the deployed guest homepage and check the public feed API", async ({ page, baseURL }, info) => {
  const origin = new URL(baseURL!).origin;
  const endpoints = new Set(["/api/auth/refresh", "/api/site-content", "/api/public/posts", "/api/news"]);
  const responses: object[] = [];
  const failures: object[] = [];
  const errors: string[] = [];
  const started = performance.now();
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.origin !== origin ||
      !(response.request().isNavigationRequest() || endpoints.has(url.pathname))
    )
      return;
    const headers = response.headers();
    responses.push({
      path: url.pathname,
      status: response.status(),
      responseHeadersMs: Math.round(performance.now() - started),
      requestId: headers["x-request-id"],
      retryAfter: headers["retry-after"],
      rateLimit: headers.ratelimit,
      limiter: headers["x-ratelimit-limiter"],
      cloudflareRay: headers["cf-ray"],
    });
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    failures.push({
      host: url.host,
      kind: request.resourceType(),
      error: request.failure()?.errorText,
    });
  });
  page.on("pageerror", (error) => errors.push(error.name));

  try {
    // Observe the site's normal startup requests. A new context has no account cookies.
    const session = page.waitForResponse(
      (response) => response.url() === `${origin}/api/auth/refresh`,
    );
    const about = page.waitForResponse(
      (response) =>
        new URL(response.url()).origin === origin &&
        new URL(response.url()).pathname === "/api/site-content",
    );
    // If navigation fails, outstanding response observers will reject when Playwright closes the page.
    void Promise.allSettled([session, about]);
    const document = await page.goto("/", { waitUntil: "domcontentloaded", timeout: 20_000 });
    expect(document?.status(), "HTML response").toBe(200);
    expect((await session).status(), "Session check for a visitor without cookies").toBe(401);
    expect((await about).status(), "Project information response").toBe(200);
    await expect(page.getByRole("heading", { name: "Твой уголок интернета" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Почему Bubble?" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Войти", exact: true })).toBeVisible();
    const publicFeed = await page.evaluate(async () => {
      const response = await fetch("/api/public/posts");
      return { status: response.status, hasItems: response.ok && Array.isArray((await response.json()).items) };
    });
    expect(publicFeed.status, "Public feed response").toBe(200);
    expect(publicFeed.hasItems, "Public feed returned a list of posts").toBe(true);
    expect(errors, "Unhandled page errors").toEqual([]);
  } finally {
    const navigation = await page
      .evaluate(() => {
        const entry = window.performance.getEntriesByType("navigation")[0] as
          PerformanceNavigationTiming | undefined;
        return (
          entry && {
            ttfbMs: entry.responseStart,
            domContentLoadedMs: entry.domContentLoadedEventEnd,
          }
        );
      })
      .catch(() => undefined);
    await info.attach("site-diagnostics", {
      body: JSON.stringify({ navigation, responses, failures, errors }),
      contentType: "application/json",
    });
  }
});
