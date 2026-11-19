import { defineConfig, type PlaywrightWorkerOptions } from "@playwright/test";

const target = process.env.BUBBLE_CHECK_URL;
const network = process.env.BUBBLE_CHECK_NETWORK ?? "current route";
const proxy = process.env.BUBBLE_CHECK_PROXY;
const channels = (process.env.BUBBLE_CHECK_BROWSERS ?? "chrome,msedge").split(",");
const mode = target ? "reachability" : "candidate";
const browserOptions: Record<string, Partial<PlaywrightWorkerOptions>> = {
  chrome: { browserName: "chromium", channel: "chrome" },
  msedge: { browserName: "chromium", channel: "msedge" },
  chromium: { browserName: "chromium" },
  firefox: { browserName: "firefox" },
  webkit: { browserName: "webkit" },
};

export default defineConfig({
  testDir: "tools/site-checks",
  testMatch: `${mode}.spec.ts`,
  globalSetup: target ? undefined : "./tools/site-checks/preview.ts",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  metadata: {
    target: target ?? "local production build",
    network: target ? network : "local API fixtures",
  },
  outputDir: `test-results/site-${mode}`,
  reporter: [["list"], ["json", { outputFile: `test-results/site-${mode}.json` }]],
  use: {
    baseURL: target,
    serviceWorkers: "block",
    ...(target && proxy ? { proxy: { server: proxy } } : {}),
  },
  projects: channels.flatMap((entry) => {
    const name = entry.trim();
    const operaPath = process.env.BUBBLE_OPERA_GX;
    const browser =
      name === "opera-gx" && operaPath
        ? { browserName: "chromium" as const, launchOptions: { executablePath: operaPath } }
        : Object.hasOwn(browserOptions, name) && browserOptions[name];
    if (!browser) throw new Error(`Unsupported browser ${name}; for opera-gx set BUBBLE_OPERA_GX`);

    return target
      ? [{ name, use: { ...browser, viewport: { width: 1280, height: 850 } } }]
      : [1280, 390].map((width) => ({
          name: `${name}-${width}`,
          use: { ...browser, viewport: { width, height: 850 }, hasTouch: width === 390 },
        }));
  }),
});
