/* global createImageBitmap */
/* eslint no-console: "off" */
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const corpus = JSON.parse(
  execFileSync(process.env.PYTHON ?? "python", ["tools/site-checks/feed-image-samples.py"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }),
);
const folder = join(
  "test-results",
  "feed-perf",
  new Date().toISOString().replaceAll(/[:.]/g, "-") + "-corpus",
);
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const rows = [];
  for (const [index, variants] of corpus.entries()) {
    for (const { data, ...variant } of variants) {
      const decodeMs = await page.evaluate(
        async ({ data, mime }) => {
          const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
          const values = [];
          for (let run = 0; run < 5; run++) {
            const blob = new Blob([bytes], { type: mime });
            const start = performance.now();
            const bitmap = await createImageBitmap(blob);
            values.push(performance.now() - start);
            bitmap.close();
          }
          return values;
        },
        { data, mime: variant.mime },
      );
      rows.push({ index, ...variant, decodeMs });
    }
  }
  await writeFile(
    join(folder, "samples.json"),
    JSON.stringify({ chrome: browser.version(), rate: 4, rows }, null, 2),
  );
  console.log(folder, rows.length, "measurements");
} finally {
  await browser.close();
}
