/* global document, window, scrollY, innerHeight */
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

export async function continuousGesture(cdp, kind, direction) {
  if (kind === "paced-touch") {
    const touch = (type, y) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: y === undefined ? [] : [{ x: 35, y }],
      });
    const first = direction > 0 ? 710 : 160;
    await touch("touchStart", first);
    const pending = [];
    for (let step = 1; step <= 30; step++) {
      pending.push(touch("touchMove", first - direction * step * 16));
      await delay(16);
    }
    await Promise.all(pending);
    await delay(90);
    await touch("touchEnd");
  } else {
    await cdp.send("Input.synthesizeScrollGesture", {
      x: 100,
      y: 440,
      yDistance: -direction * 500,
      speed: 750,
      preventFling: true,
      gestureSourceType: "mouse",
    });
  }
  await delay(120);
}

// Keep the OS, Chromium context, throttling and viewport for the no-application control.
export async function measureCadence({
  page,
  cdp,
  profile,
  variant,
  run,
  trace,
  traceFile,
  mark,
  legacy,
  save,
  saveCPU,
}) {
  if (variant === "no-clip")
    await page.addStyleTag({ content: ".aero-window > .shell {clip-path:none!important}" });
  if (variant === "freeze-text")
    await page.evaluate(() => {
      window.perfFreezeText = true;
    });
  if (variant === "repeat-text")
    await page.evaluate(() => {
      window.perfRepeatText = true;
    });
  if (variant === "static") {
    const snapshot = await page.evaluate(() => {
      const doc = document.documentElement.cloneNode(true);
      doc.querySelectorAll("script,link[rel=modulepreload]").forEach((el) => el.remove());
      const base = document.createElement("base");
      base.href = document.baseURI;
      doc.querySelector("head").prepend(base);
      return { html: doc.outerHTML, y: scrollY };
    });
    const url = new URL("/__perf_static", page.url()).href;
    await page.route(url, (route) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html>" + snapshot.html }),
    );
    await page.goto(url);
    await page.evaluate(async (y) => {
      await document.fonts.ready;
      window.scrollTo(0, y);
    }, snapshot.y);
  }
  if (variant === "control") {
    await page.goto("about:blank");
    await page.setContent(
      '<meta name="viewport" content="width=device-width,initial-scale=1"><body style="height:14000px;background:repeating-linear-gradient(#eee,#999 140px,#ddd 300px)">',
    );
    await page.evaluate(() => window.scrollTo(0, 4000));
  }
  await page.evaluate(() => {
    window.diag = { events: [], mounts: [], phase: "" };
    for (const type of ["scroll", "wheel", "touchmove"]) {
      document.addEventListener(
        type,
        (event) => {
          window.diag.events.push([
            window.diag.phase,
            type,
            event.timeStamp,
            performance.now(),
            scrollY,
          ]);
        },
        { passive: true, capture: true },
      );
    }
    new window.MutationObserver((changes) => {
      for (const change of changes)
        for (const key of ["addedNodes", "removedNodes"])
          for (const node of change[key])
            if (node.matches?.(".feed-window-row"))
              window.diag.mounts.push([
                window.diag.phase,
                key,
                node.dataset.feedRow,
                performance.now(),
              ]);
    }).observe(document.body, { childList: true, subtree: true });
  });
  const y = await page.evaluate(() => scrollY);
  const rows = [];
  async function phase(kind, direction, traced) {
    const name = [kind, direction === 1 ? "forward" : "back", traced ? "trace" : "bare"].join("-");
    await page.evaluate((name) => {
      window.diag.phase = name;
    }, name);
    const start = await page.evaluate(() => scrollY);
    await mark(page, name, async () => {
      if (kind === "idle") return delay(600);
      if (kind === "legacy") return legacy(direction);
      await continuousGesture(cdp, kind, direction);
    });
    const end = await page.evaluate(() => scrollY);
    rows.push({ name, start, end });
    if (kind !== "idle") assert.ok((end - start) * direction > 150, JSON.stringify(rows.at(-1)));
  }
  const blocks = run % 2 ? [false, true] : [true, false];
  for (const traced of blocks) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
    await delay(350);
    const block = async () => {
      await phase("idle", 1, traced);
      const inputs = ["legacy", "native-wheel", ...(profile === "desktop" ? [] : ["paced-touch"])];
      for (const kind of run % 2 ? inputs : inputs.reverse())
        for (const direction of [1, -1]) await phase(kind, direction, traced);
    };
    if (traced) await trace(cdp, traceFile, block);
    else await block();
    await save({
      rows,
      ...(await page.evaluate(() => ({
        events: window.diag.events,
        mounts: window.diag.mounts,
        frames: window.perfProbe.frames,
        loaf: window.perfProbe.loaf,
        timeOrigin: performance.timeOrigin,
        viewport: innerHeight,
      }))),
    });
  }
  if (process.env.BUBBLE_PERF_CPU === "1") {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.start");
    try {
      await phase("native-wheel", 1, false);
      await phase("native-wheel", -1, false);
    } finally {
      await saveCPU((await cdp.send("Profiler.stop")).profile);
      await cdp.send("Profiler.disable");
    }
  }
}
