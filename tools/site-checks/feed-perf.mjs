/* global window, document, location, requestAnimationFrame */
/* eslint no-console: "off" */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { cpus, release, totalmem } from "node:os";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";
import { makeMedia, startFeedFixture } from "./feed-perf-fixtures.mjs";

const mode = process.argv[2] ?? "depth";
const repeats = Number(process.argv[3] ?? 3);
const profiles = (process.argv[4] ?? "desktop,mobile").split(",");
const cap = Number(process.argv[5] ?? 240);
const scrollOnly = process.env.BUBBLE_PERF_SCROLL_ONLY === "1";
const windowed = process.env.BUBBLE_PERF_WINDOW === "1";
const filmstrip = mode === "media" && process.env.BUBBLE_PERF_FILMSTRIP === "1";
const sessionMs = Number(process.env.BUBBLE_PERF_SESSION_MS ?? 600_000);
const output = join(
  "test-results",
  "feed-perf",
  new Date().toISOString().replaceAll(/[:.]/g, "-") + "-" + mode,
);
assert.ok(["depth", "mount", "effects", "media", "session"].includes(mode));
assert.ok(Number.isSafeInteger(repeats) && repeats >= 1 && repeats <= 12);
assert.ok(profiles.every((profile) => ["desktop", "mobile", "mobile6"].includes(profile)));
assert.ok(Number.isSafeInteger(cap) && cap >= 20 && cap <= 1000 && cap % 20 === 0);
assert.ok(Number.isSafeInteger(sessionMs) && sessionMs >= 0);
await mkdir(output, { recursive: true });
console.log(output);

const categories = [
  "blink.user_timing",
  "devtools.timeline",
  "v8",
  "cc",
  "gpu",
  "input",
  "benchmark",
  "latencyInfo",
  "disabled-by-default-devtools.timeline.frame",
].join(",");

const browser = await chromium.launch({
  channel: "chrome",
  headless: process.env.BUBBLE_PERF_HEADED !== "1",
});
let server;
try {
  const media = await makeMedia(browser);
  server = await startFeedFixture(media, cap, output, mode === "mount", windowed);
  const sha = execFileSync(
    "git",
    ["-c", "safe.directory=" + process.cwd().replaceAll("\\", "/"), "rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).trim();
  const browserCdp = await browser.newBrowserCDPSession();
  const system = await browserCdp.send("SystemInfo.getInfo").catch(() => null);
  await browserCdp.detach();
  await save("manifest.json", {
    schema: 1,
    mode,
    repeats,
    profiles,
    cap,
    scrollOnly,
    windowed,
    filmstrip,
    ...(mode === "session" && { sessionMs }),
    sha,
    chrome: browser.version(),
    node: process.version,
    os: release(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    gpu: system && {
      devices: system.gpu.devices,
      featureStatus: system.gpu.featureStatus,
      glRenderer: system.gpu.auxAttributes?.glRenderer,
    },
    ramBytes: totalmem(),
    headless: process.env.BUBBLE_PERF_HEADED !== "1",
    serviceWorkers: "block",
    fixtureHash: server.fixtureHash,
    runnerHash: createHash("sha256")
      .update(await readFile(new URL(import.meta.url)))
      .update(await readFile(new URL("./feed-perf-fixtures.mjs", import.meta.url)))
      .digest("hex"),
    media: media.map(({ width, height, bytes }) => ({
      width,
      height,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    })),
  });
  const cases =
    mode === "mount"
      ? ["full", "limited"]
      : mode === "effects"
        ? ["default", "reduced"]
        : ["default"];
  for (const profile of profiles) {
    for (let run = 1; run <= repeats; run++) {
      const order = run % 2 ? cases : [...cases].reverse();
      for (const variant of order) await runCase(profile, run, variant);
    }
  }
} finally {
  try {
    await browser.close();
  } finally {
    await server?.close();
  }
}

function save(name, data) {
  return writeFile(join(output, name), JSON.stringify(data, null, 2));
}

async function runCase(profile, run, variant) {
  const mobile = profile !== "desktop";
  const viewport = mobile ? { width: 390, height: 850 } : { width: 1280, height: 850 };
  const cpuRate = profile === "mobile6" ? 6 : mobile ? 4 : 1;
  const name = `${profile}-${windowed ? "window" : variant}-${run}`;
  const context = await browser.newContext({
    viewport,
    hasTouch: mobile,
    isMobile: mobile,
    deviceScaleFactor: mobile ? 2 : 1,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const card = (index) => page.locator(`article[data-post-id="perf-${index}"]`);
  const network = [];
  const depths = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const requestStart = server.requests.length;
  try {
    await cdp.send("Network.enable");
    await cdp.send("Performance.enable");
    for (const event of [
      "requestWillBeSent",
      "responseReceived",
      "loadingFinished",
      "loadingFailed",
      "requestServedFromCache",
      "resourceChangedPriority",
    ]) {
      cdp.on("Network." + event, (data) => {
        const {
          requestId,
          timestamp,
          type,
          request,
          response,
          initiator,
          encodedDataLength,
          newPriority,
          errorText,
        } = data;
        network.push({
          event,
          requestId,
          timestamp,
          type,
          url: (request ?? response)?.url,
          priority: request?.initialPriority ?? newPriority,
          initiator: initiator?.type,
          cache: response && {
            disk: response.fromDiskCache,
            serviceWorker: response.fromServiceWorker,
          },
          status: response?.status,
          timing: response?.timing,
          encodedDataLength,
          errorText,
        });
      });
    }
    if (mode === "media") {
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 100,
        downloadThroughput: 160000,
        uploadThroughput: 80000,
      });
    }
    await page.addInitScript(installProbe);
    if (mode === "media") await page.addInitScript(installAvatarProbe);
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });
    await card(0).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const navigation = await page.evaluate(() => ({
      firstCardObservedMs: performance.now(),
      timing: performance.getEntriesByType("navigation")[0]?.toJSON(),
      paints: performance.getEntriesByType("paint").map((entry) => entry.toJSON()),
    }));
    const stopDepths =
      mode === "mount"
        ? [cap]
        : mode === "effects" || mode === "session"
          ? [20]
          : mode === "media"
            ? [20, cap]
            : [20, 100, 240, 500, 1000].filter((n) => n <= cap && (cap !== 240 || n !== 100));
    for (const depth of new Set(stopDepths)) {
      const target = card(mode === "effects" ? 3 : depth - 7);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await advance(page, target, depth, viewport);
      if (variant === "limited") await limitMount(page, depth - 20);
      if (variant === "reduced") {
        await page.addStyleTag({
          content: `
          .aero-app, .aero-app *, .aero-app *::before, .aero-app *::after {
            box-shadow: none !important; text-shadow: none !important;
            backdrop-filter: none !important; animation: none !important;
          }`,
        });
      }
      await idle(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
      const browserMetrics = await cdp.send("Performance.getMetrics").catch(() => ({}));
      const structure = await page.evaluate(() => ({
        cards: document.querySelectorAll("article.feed-post").length,
        elements: document.getElementsByTagName("*").length,
        images: document.images.length,
        y: window.scrollY,
        screenDpr: window.devicePixelRatio,
      }));
      if (windowed)
        assert.ok(structure.cards > 0 && structure.cards <= 32, JSON.stringify(structure));
      else assert.equal(structure.cards, variant === "limited" ? 20 : depth);
      await page.evaluate(() => {
        for (const key of ["keys", "events", "longTasks", "loaf", "media"])
          window.perfProbe[key].length = 0;
        window.perfProbe.frames = {};
      });
      const traceFile = `${name}-${depth}.trace.json.gz`;
      const film = filmstrip ? await captureFilmstrip(cdp, name, depth) : null;
      const windows = await trace(cdp, traceFile, async () => {
        if (mode === "media") {
          await mediaActions(page, target, depth, mobile);
        } else {
          await mark(page, "idle", () => delay(650));
          if (mode === "effects" || mode === "depth" || mode === "mount" || mode === "session") {
            await mark(page, "scroll-forward", () => gesture(page, cdp, viewport, mobile, 1));
            await mark(page, "scroll-back", () => gesture(page, cdp, viewport, mobile, -1));
          }
          if (mode !== "effects" && !scrollOnly) await commentAndLike(page, target);
        }
        return page.evaluate(() => ({ ...window.perfProbe, timeOrigin: performance.timeOrigin }));
      }).finally(async () => {
        await film?.finish();
      });
      const stats = {
        depth,
        traceFile,
        structure,
        browserMetrics,
        windows,
        heap: await cdp.send("Runtime.getHeapUsage"),
        dom: await cdp.send("Memory.getDOMCounters"),
        ...(mode === "media" && { avatars: await page.evaluate(() => window.perfAvatars) }),
      };
      depths.push(stats);
      console.log(name, depth, structure.cards, "cards", structure.elements, "elements");
      await save(`${name}.json`, {
        profile,
        run,
        variant: windowed ? "window" : variant,
        viewport,
        cpuRate,
        navigation,
        errors,
        depths,
        network,
        serverRequests: server.requests.slice(requestStart),
      });
    }
    if (mode === "session") {
      await sessionMemory(page, cdp, name, cap, viewport, depths);
      await save(`${name}.json`, {
        profile,
        run,
        variant,
        viewport,
        cpuRate,
        navigation,
        errors,
        depths,
        network,
        serverRequests: server.requests.slice(requestStart),
      });
    }
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

function installProbe() {
  window.perfProbe = { keys: [], events: [], longTasks: [], loaf: [], media: [], frames: {} };
  for (const [type, target] of [
    ["event", "events"],
    ["longtask", "longTasks"],
    ["long-animation-frame", "loaf"],
  ]) {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
    new PerformanceObserver((list) => {
      window.perfProbe[target].push(...list.getEntries().map((entry) => entry.toJSON()));
    }).observe({ type, buffered: true, ...(type === "event" ? { durationThreshold: 16 } : {}) });
  }
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.target.tagName !== "TEXTAREA") return;
      const start = event.timeStamp;
      requestAnimationFrame((frame) =>
        window.perfProbe.keys.push({ key: event.key, start, frame, observed: performance.now() }),
      );
    },
    true,
  );
}

function installAvatarProbe() {
  window.perfAvatars = [];
  const entries = new WeakMap();
  const observer = new window.IntersectionObserver(
    (changes) => {
      for (const change of changes) {
        if (!change.isIntersecting) continue;
        const image = change.target;
        const entry = {
          path: new URL(image.currentSrc || image.src).pathname,
          at: change.time,
          loadedOnEntry: Boolean(image.complete && image.naturalWidth),
        };
        entries.set(image, entry);
        window.perfAvatars.push(entry);
        observer.unobserve(image);
      }
    },
    { threshold: 0.25 },
  );
  const seen = new WeakSet();
  const watch = (node) => {
    if (node.nodeType !== 1) return;
    const images = node.matches("img.avatar") ? [node] : node.querySelectorAll("img.avatar");
    for (const image of images) {
      if (seen.has(image)) continue;
      seen.add(image);
      observer.observe(image);
    }
  };
  new window.MutationObserver((records) => {
    for (const { addedNodes } of records) for (const node of addedNodes) watch(node);
  }).observe(document, { childList: true, subtree: true });
  document.addEventListener(
    "load",
    (event) => {
      const entry = entries.get(event.target);
      if (entry) entry.load = performance.now();
    },
    true,
  );
}

async function captureFilmstrip(cdp, name, depth) {
  const frames = [];
  const receive = ({ data, metadata, sessionId }) => {
    frames.push({ data, metadata });
    void cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  };
  cdp.on("Page.screencastFrame", receive);
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 60,
    maxWidth: 390,
    maxHeight: 850,
  });
  return {
    async finish() {
      await cdp.send("Page.stopScreencast");
      cdp.off("Page.screencastFrame", receive);
      await save(`${name}-${depth}.filmstrip.json`, frames);
    },
  };
}

async function idle(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await delay(220);
}

async function advance(page, target, depth, viewport) {
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  const rows = page.locator("article.feed-post");
  const loadedCount = () =>
    windowed
      ? page.locator(".feed-window").getAttribute("data-feed-count").then(Number)
      : rows.count();
  for (let loaded = await loadedCount(); loaded < depth; loaded = await loadedCount()) {
    // Advance in bounded jumps outside measured windows. The normal DOM sentinel still drives every request.
    for (const index of viewport.width <= 600
      ? [loaded - 2]
      : [loaded - 14, loaded - 8, loaded - 2]) {
      const row = windowed ? await seekWindow(page, index) : rows.nth(index);
      await row.evaluate((row) => row.scrollIntoView({ block: "center", behavior: "instant" }));
      await delay(85);
    }
    if (windowed)
      await page.waitForFunction(
        (previous) => Number(document.querySelector(".feed-window").dataset.feedCount) > previous,
        loaded,
        { timeout: 12000 },
      );
    else await rows.nth(loaded).waitFor({ state: "attached", timeout: 12000 });
    if (loaded % 100 === 0) console.log("Loaded cursor", loaded, "toward", depth);
  }
  if (windowed && !(await target.count())) await seekWindow(page, depth - 7);
  for (let attempt = 0; attempt < 5; attempt++) {
    await target.evaluate((row) =>
      window.scrollBy({ top: row.getBoundingClientRect().top - 180, behavior: "instant" }),
    );
    await idle(page);
    if (Math.abs(await target.evaluate((row) => row.getBoundingClientRect().top - 180)) < 50)
      return;
  }
  throw new Error(`Could not align the control card at depth ${depth}`);
}

async function seekWindow(page, index) {
  const target = page.locator(`article[data-post-id="perf-${index}"]`);
  for (let step = 0; step < 100; step++) {
    if (await target.count()) return target;
    const direction = await page.evaluate((index) => {
      const rows = [...document.querySelectorAll("[data-feed-row]")];
      const nearest = rows.reduce((a, b) =>
        Math.abs(a.getBoundingClientRect().top - 180) <=
        Math.abs(b.getBoundingClientRect().top - 180)
          ? a
          : b,
      );
      return Math.sign(index - Number(nearest.dataset.feedRow.slice(5)));
    }, index);
    await page.evaluate(
      (direction) =>
        window.scrollBy({ top: direction * window.innerHeight * 0.9, behavior: "instant" }),
      direction,
    );
    await page.waitForTimeout(45);
  }
  throw new Error("Window traversal never mounted post " + index);
}

async function limitMount(page, count) {
  const anchor = await page.evaluate((count) => {
    const first = document.querySelector("article.feed-post");
    const keep = document.querySelector(`article[data-post-id="perf-${count}"]`);
    const visible = [...document.querySelectorAll("article.feed-post")].find(
      (row) => row.getBoundingClientRect().top >= 160,
    );
    const snapshot = {
      top: visible.getBoundingClientRect().top,
      id: visible.id || visible.dataset.postId,
    };
    const height = keep.getBoundingClientRect().top - first.getBoundingClientRect().top;
    window.dispatchEvent(new CustomEvent("perf-mount-control", { detail: { count, height } }));
    return snapshot;
  }, count);
  await page.waitForFunction(() => document.querySelectorAll("article.feed-post").length === 20);
  await page.evaluate(({ id, top }) => {
    const row = document.querySelector(`article[data-post-id="${id}"]`);
    const delta = row.getBoundingClientRect().top - top;
    window.scrollBy(0, delta);
  }, anchor);
  const error = await page.evaluate(({ id, top }) => {
    const row = document.querySelector(`article[data-post-id="${id}"]`);
    return row.getBoundingClientRect().top - top;
  }, anchor);
  assert.ok(Math.abs(error) < 24, `Spacer shifted anchor by ${error}px after correction`);
}

async function mark(page, name, action) {
  await page.evaluate((name) => {
    let previous = performance.now();
    const samples = [];
    let id = requestAnimationFrame(function frame(timestamp) {
      samples.push(timestamp - previous);
      previous = timestamp;
      id = requestAnimationFrame(frame);
    });
    window.perfFinish = () => {
      window.cancelAnimationFrame(id);
      window.perfProbe.frames[name] = samples.slice(1);
      performance.mark("bubble:end:" + name);
    };
    performance.mark("bubble:start:" + name);
  }, name);
  await action();
  await page.evaluate(() => window.perfFinish());
}

async function gesture(page, cdp, viewport, mobile, direction) {
  const start = await page.evaluate(() => window.scrollY);
  if (mobile) {
    const startY = direction > 0 ? 710 : 160;
    const touch = (type, y) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: y === undefined ? [] : [{ x: 35, y }],
      });
    await touch("touchStart", startY);
    for (let step = 1; step <= 20; step++) {
      await touch("touchMove", startY - direction * step * 26);
      await delay(30);
    }
    await delay(90);
    await touch("touchEnd");
  } else {
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    for (let i = 0; i < 25; i++) {
      await page.mouse.wheel(0, direction * 31);
      await delay(24);
    }
  }
  await delay(100);
  const moved = (await page.evaluate(() => window.scrollY)) - start;
  assert.ok(moved * direction > 150, `No measured scroll: ${moved}`);
}

async function commentAndLike(page, target) {
  await target.getByRole("button", { name: "3 комментария" }).click();
  const field = target.getByRole("textbox", { name: "Написать комментарий" });
  await field.click();
  await idle(page);
  await mark(page, "typing", async () => {
    await field.pressSequentially("A comment typed one character at a time. ".repeat(3), {
      delay: 20,
    });
    await field.press("Shift+Enter");
    await field.pressSequentially("New line.", { delay: 20 });
    await delay(140);
  });
  assert.match(await field.inputValue(), /New line/);
  const like = target.locator(".post-like");
  await mark(page, "like", async () => {
    await like.click();
    await page.waitForFunction(() => document.querySelector(".post-like[aria-pressed=true]"));
    await delay(120);
  });
}

async function mediaActions(page, target, depth, mobile) {
  const gallery = target.locator(".image-gallery--carousel");
  await gallery.scrollIntoViewIfNeeded();
  await gallery.locator(".image-gallery__item[hidden] img").first().waitFor({ state: "attached" });
  const second = `/perf-media/photo/${depth - 7}-1.jpg`;
  const third = `/perf-media/photo/${depth - 7}-2.jpg`;
  await page.waitForFunction((path) => {
    const photo = [...document.images].find((img) => img.src.endsWith(path));
    return photo?.complete && photo.naturalWidth > 0;
  }, second);
  assert.equal(
    await page.evaluate(
      (path) => performance.getEntriesByName(location.origin + path).length,
      third,
    ),
    0,
  );
  for (const [label, path, direction] of [
    ["prepared", second, "next"],
    ["cold", third, "next"],
    ["return", second, "previous"],
    ["cached", third, "next"],
  ]) {
    if (label === "cached") {
      await gallery.locator(".image-gallery__zone--previous").click();
      await page.waitForFunction(
        (path) => ![...document.images].some((img) => img.src.endsWith(path)),
        third,
      );
      await gallery.locator(".image-gallery__zone--next").click();
      await page.waitForFunction(
        (path) =>
          [...document.images].some(
            (img) => img.src.endsWith(path) && img.complete && img.naturalWidth,
          ),
        third,
      );
    }
    await mark(page, "media-" + label, async () => {
      const control = gallery.locator(`.image-gallery__zone--${direction}`);
      await control.scrollIntoViewIfNeeded();
      const imageBox = await gallery
        .locator(".image-gallery__item:not([hidden]) img")
        .boundingBox();
      await control.evaluate((button, path) => {
        button.addEventListener(
          "click",
          (event) => {
            const image = [...document.images].find((img) => img.src.endsWith(path));
            window.perfMediaClick = {
              time: event.timeStamp,
              loaded: Boolean(image?.complete && image.naturalWidth),
            };
          },
          { once: true, capture: true },
        );
      }, path);
      if (mobile) await control.tap();
      else await control.click();
      await page.waitForFunction(
        (path) =>
          [...document.images].some(
            (img) =>
              img.src.endsWith(path) &&
              img.naturalWidth &&
              img.closest("button")?.hidden === false &&
              !img.closest(".gallery-image--waiting"),
          ),
        path,
      );
      await page.evaluate(
        ({ label, path, imageBox }) => {
          window.perfProbe.media.push({
            label,
            path,
            imageBox,
            click: window.perfMediaClick,
            ready: performance.now(),
            resources: performance
              .getEntriesByName(location.origin + path)
              .map((entry) => entry.toJSON()),
          });
        },
        { label, path, imageBox },
      );
      await delay(140);
    });
  }
}

async function trace(cdp, file, action) {
  const complete = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve));
  await cdp.send("Tracing.start", {
    categories: categories + (mode === "media" ? ",disabled-by-default-devtools.screenshot" : ""),
    transferMode: "ReturnAsStream",
    streamCompression: "gzip",
  });
  try {
    return await action();
  } finally {
    await cdp.send("Tracing.end");
    const { stream } = await complete;
    const pieces = [];
    let eof = false;
    while (!eof) {
      const chunk = await cdp.send("IO.read", { handle: stream, size: 1048576 });
      pieces.push(Buffer.from(chunk.data, chunk.base64Encoded ? "base64" : "utf8"));
      eof = chunk.eof;
    }
    await cdp.send("IO.close", { handle: stream });
    const data = Buffer.concat(pieces);
    await writeFile(join(output, file), data[0] === 31 ? data : gzipSync(data));
  }
}

async function sessionMemory(page, cdp, name, cap, viewport, depths) {
  const start = Date.now();
  const samples = [];
  await advance(page, page.locator('article[data-post-id="perf-13"]'), 20, viewport);
  await snapshot("start");
  await advance(page, page.locator(`article[data-post-id="perf-${cap - 7}"]`), cap, viewport);
  await snapshot("deep");
  let direction = -1;
  while (Date.now() - start < sessionMs) {
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    for (let i = 0; i < 35; i++) {
      await page.mouse.wheel(0, 850 * direction);
      await delay(400);
    }
    direction *= -1;
    samples.push({
      elapsed: Date.now() - start,
      heap: await cdp.send("Runtime.getHeapUsage"),
      dom: await cdp.send("Memory.getDOMCounters"),
    });
    await save(`${name}-session.json`, samples);
  }
  await advance(page, page.locator('article[data-post-id="perf-13"]'), 20, viewport);
  await snapshot("return");
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  await page
    .locator('a[href="/about"]')
    .first()
    .evaluate((link) => link.click());
  await page.waitForURL("**/about");
  await page.locator("article.feed-post").first().waitFor({ state: "detached" });
  assert.equal(
    await page.evaluate(() => performance.timeOrigin),
    timeOrigin,
    "Expected SPA navigation",
  );
  await snapshot("away");
  await cdp.send("HeapProfiler.collectGarbage");
  await snapshot("away-gc");
  depths.push({ sessionElapsedMs: Date.now() - start, samples });

  async function snapshot(label) {
    const sample = {
      label,
      elapsed: Date.now() - start,
      heap: await cdp.send("Runtime.getHeapUsage"),
      dom: await cdp.send("Memory.getDOMCounters"),
    };
    samples.push(sample);
    await save(`${name}-session.json`, samples);
    const chunks = [];
    const receive = ({ chunk }) => chunks.push(chunk);
    cdp.on("HeapProfiler.addHeapSnapshotChunk", receive);
    try {
      await cdp.send("HeapProfiler.takeHeapSnapshot");
      await writeFile(join(output, `${name}-${label}.heapsnapshot.gz`), gzipSync(chunks.join("")));
    } finally {
      cdp.off("HeapProfiler.addHeapSnapshotChunk", receive);
    }
  }
}
