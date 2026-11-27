// Local, deterministic UI workload; no production API or user data.
// Start Vite, then: node tools/measure-feed.mjs [output.json]
// PERF_VERIFY=1 also checks comments, playback, image fallback and image formats.
/* global process, Buffer, URL, console, performance, File, window, document, localStorage, EventTarget, Event, PerformanceObserver, requestAnimationFrame, createImageBitmap, setTimeout */
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const origin = process.env.PERF_ORIGIN ?? "http://127.0.0.1:5173";
const samples = [];
for (const channel of (process.env.PERF_CHANNELS ?? "chrome,msedge").split(",")) {
  const browser = await chromium.launch({ channel, headless: true });
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      const requests = { previews: 0, statuses: 0 };
      const images = { direct: 0, proxy: 0 };
      let photoRequests = 0;
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.startsWith("/__perf_photos/")) {
          photoRequests++;
          return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320"><rect width="640" height="320" fill="teal"/></svg>' });
        }
        if (url.pathname.startsWith("/uploads/")) {
          if (url.searchParams.has("direct")) {
            images.direct++;
            return route.fulfill({
              status: 302,
              headers: { location: "https://unreachable.storage.example/test.png" },
            });
          }
          images.proxy++;
          return route.fulfill({
            contentType: "image/png",
            body: Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBasAAAAASUVORK5CYII=",
              "base64",
            ),
          });
        }
        if (url.pathname.startsWith("/api/")) {
          let body = {};
          if (url.pathname === "/api/posts/0/like") {
            await new Promise((resolve) => setTimeout(resolve, 800));
            const liked = route.request().method() === "PUT";
            body = { id: "0", likeCount: Number(liked), likedByMe: liked };
          }
          if (url.pathname.endsWith("/auth/refresh"))
            body = {
              accessToken: "fixture",
              user: { id: "viewer", username: "viewer", role: "user", plus: false },
            };
          if (url.pathname.endsWith("/link-preview")) {
            requests.previews++;
            body = { preview: null };
          }
          if (url.pathname.endsWith("/music/library/status")) {
            requests.statuses++;
            body = { ids: [] };
          }
          if (url.pathname.endsWith("/comments")) body = [];
          if (url.pathname.endsWith("/play")) body = { url: `${origin}/fixture.mp3` };
          return route.fulfill({
            json: body,
            headers: {
              "access-control-allow-origin": origin,
              "access-control-allow-credentials": "true",
            },
          });
        }
        if (url.origin !== origin) return route.abort();
        if (url.pathname === "/__feed_perf")
          return route.fulfill({
            contentType: "text/html",
            body: `<!doctype html><html><head><script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
</script></head><body><div id="root"></div><script type="module" src="/perf-harness.jsx"></script></body></html>`,
          });
        return route.continue();
      });
      await page.addInitScript(() => {
        localStorage.setItem("commune_session", "1");
        window.Audio = class extends EventTarget {
          currentTime = 0;
          duration = 120;
          volume = 1;
          paused = true;
          readyState = 4;
          constructor() {
            super();
            window.__audio = this;
          }
          play() {
            this.paused = false;
            this.dispatchEvent(new Event("canplay"));
            this.dispatchEvent(new Event("play"));
            return Promise.resolve();
          }
          pause() {
            this.paused = true;
            this.dispatchEvent(new Event("pause"));
          }
          load() {}
          src = "fixture.mp3";
          getAttribute(name) { return name === "src" ? this.src : null; }
          removeAttribute(name) { if (name === "src") this.src = ""; }
        };
      });
      const errors = [];
      page.on("pageerror", (error) => {
        errors.push(error.message);
        console.error(error.message);
      });
      page.on("console", (message) => {
        if (message.type() === "error") console.error(message.text());
      });
      await page.goto(`${origin}/__feed_perf`);
      await page
        .locator(".post")
        .first()
        .waitFor()
        .catch((error) => {
          throw new Error(errors.join("\n") || error.message);
        });
      await page.waitForTimeout(1000);
      const initial = { mounted: await page.locator(".post").count(), photoRequests, ...requests };
      const heart = page.locator(".post").first().locator(".post-actions button[aria-pressed]").first();
      const like = await heart.evaluate(async (button) => {
        const start = performance.now();
        button.click();
        return new Promise((resolve, reject) => {
          function check() {
            if (button.getAttribute("aria-pressed") === "true") resolve(Math.round(performance.now() - start));
            else if (performance.now() - start > 4000) reject(new Error("Like did not appear"));
            else requestAnimationFrame(check);
          }
          requestAnimationFrame(check);
        });
      });
      await page.waitForTimeout(900);
      await page.evaluate(() => {
        window.__commits = [];
      });
      for (let i = 1; i <= 20; i++) {
        await page.evaluate((time) => {
          window.__audio.currentTime = time;
          window.__audio.dispatchEvent(new Event("timeupdate"));
        }, i);
        await page.waitForTimeout(20);
      }
      const ticking = await page.evaluate(() => ({
        commits: window.__commits.length,
        renderMs: window.__commits.reduce((sum, x) => sum + x.duration, 0),
      }));
      const scroll = await page.evaluate(async () => {
        const tasks = [];
        const observer = new PerformanceObserver((list) =>
          tasks.push(...list.getEntries().map((x) => x.duration)),
        );
        observer.observe({ type: "longtask", buffered: false });
        const intervals = [];
        let previous = performance.now();
        const start = previous;
        await new Promise((resolve) => {
          function frame(now) {
            intervals.push(now - previous);
            previous = now;
            window.scrollTo(0, (now - start) * 2);
            if (now - start < 1800) requestAnimationFrame(frame);
            else resolve();
          }
          requestAnimationFrame(frame);
        });
        observer.disconnect();
        return {
          fps: (1000 * intervals.length) / (previous - start),
          longTasks: tasks.length,
          longTaskMs: tasks.reduce((a, b) => a + b, 0),
        };
      });
      if (process.env.PERF_VERIFY === "1") {
        assert.equal(ticking.commits, 0, "Playback time must not update feed consumers");
        assert.ok(
          initial.previews < 60 && initial.statuses < 60,
          "Optional requests should wait for the viewport",
        );
        assert.equal(
          await page.locator("#clock-probe").textContent(),
          "20",
          "Player time must keep updating",
        );
        await page.evaluate(() => window.scrollTo(0, 0));
        const first = page.locator(".post").first();
        const comments = first.getByRole("button", { name: /0 комментариев/ });
        await comments.click();
        const field = first.locator(".inline-comments textarea");
        await field.fill("Несохранённый ответ");
        await comments.click();
        await comments.click();
        assert.equal(await field.inputValue(), "Несохранённый ответ");
        await first
          .getByRole("button", { name: "Воспроизвести Тестовый трек", exact: true })
          .click();
        await first.getByRole("button", { name: "Пауза Тестовый трек", exact: true }).waitFor();
        await first.getByRole("button", { name: "Пауза Тестовый трек", exact: true }).click();
        await first
          .getByRole("button", { name: "Воспроизвести Тестовый трек", exact: true })
          .waitFor();
        await page.evaluate(() => window.showImage("/uploads/" + "a".repeat(32) + ".png"));
        await page.waitForFunction(
          () => document.querySelector("#image-check img")?.naturalWidth > 0,
        );
        assert.deepEqual(
          images,
          { direct: 1, proxy: 1 },
          "Unreachable storage must fall back once to the API",
        );
        const formats = await page.evaluate(async () => {
          const gif = new File([new Uint8Array([71, 73, 70, 56, 57, 97])], "animation.gif", {
            type: "image/gif",
          });
          const sameGif = (await window.prepareImage(gif, window.photoOptions.avatar)) === gif;
          const canvas = document.createElement("canvas");
          canvas.width = 32;
          canvas.height = 32;
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
          const file = new File([blob], "transparent.png", { type: "image/png" });
          const output = await window.prepareImage(file, window.photoOptions.avatar);
          const bitmap = await createImageBitmap(output);
          canvas.getContext("2d").drawImage(bitmap, 0, 0);
          bitmap.close();
          return { sameGif, alpha: canvas.getContext("2d").getImageData(0, 0, 1, 1).data[3] };
        });
        assert.deepEqual(formats, { sameGif: true, alpha: 0 });
        await page.screenshot({ path: `.env.perf-${channel}-${width}.png`, fullPage: false });
      }
      // Real browser encoders, identical seeded photo-like pixels on every run.
      const compression = await page.evaluate(async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 1200;
        canvas.height = 900;
        const ctx = canvas.getContext("2d");
        const data = ctx.createImageData(1200, 900);
        let seed = 13;
        for (let i = 0; i < data.data.length; i += 4) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          const n = seed >>> 24;
          data.data[i] = n;
          data.data[i + 1] = n;
          data.data[i + 2] = n;
          data.data[i + 3] = 255;
        }
        ctx.putImageData(data, 0, 0);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.75));
        const file = new File([blob], "source.jpg", { type: blob.type });
        const result = { source: file.size };
        for (const [name, options] of Object.entries(window.photoOptions)) {
          const output = await window.prepareImage(file, options);
          const bitmap = await createImageBitmap(output);
          result[name] = { bytes: output.size, width: bitmap.width, height: bitmap.height };
          bitmap.close();
        }
        return result;
      });
      if (errors.length) throw new Error(errors.join("\n"));
      samples.push({ channel, width, initial, likeMs: like, ticking, scroll, compression });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
const output = JSON.stringify(samples, null, 2);
process.stdout.write(output + "\n");
if (process.argv[2]) await writeFile(process.argv[2], output + "\n");
