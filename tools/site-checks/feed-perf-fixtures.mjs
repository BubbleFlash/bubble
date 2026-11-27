/* global document */
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { Server } from "socket.io";
import { build, preview } from "vite";

const date = "2026-11-17T00:00:00Z";
const author = (index) => ({
  id: `author-${index}`,
  username: `author_${index}`,
  plus: false,
  online: index % 2 === 0,
  avatarUrl: `/perf-media/avatar/${index}.jpg`,
  ...(index % 4 === 0 ? { avatarFrame: { effect: "pulse", color: "#1177cc", intensity: 3 } } : {}),
});
const photos = (index) =>
  Array.from(
    { length: index % 5 === 3 ? 5 : 1 },
    (_, slide) => `/perf-media/photo/${index}-${slide}.jpg`,
  );
const post = (index) => ({
  id: `perf-${index}`,
  author: author(index % 48),
  createdAt: date,
  content:
    `Запись ${index + 1000}. ` +
    "Заметки о прогулке. На улице осень, деревья уже поменяли цвет. ".repeat((index % 20) + 1) +
    (index % 5 === 4 ? " https://example.test/story" : ""),
  imageUrl: null,
  imageUrls: index % 5 === 0 || index % 5 === 3 ? photos(index) : [],
  likeCount: 0,
  likedByMe: false,
  repostCount: 0,
  commentCount: 3,
  community: null,
  musicAttachments:
    index % 10 === 7
      ? [
          {
            id: `track-${index}`,
            artist: "Исполнитель",
            title: "Тестовая запись",
            duration: 120,
            unavailable: false,
          },
        ]
      : [],
});

export async function makeMedia(browser) {
  const page = await browser.newPage();
  try {
    const pictures = await page.evaluate(() => {
      const sizes = [
        [1200, 800],
        [800, 1200],
        [1600, 900],
        [1280, 960],
        [900, 900],
        [256, 256],
      ];
      const colors = [
        [170, 83, 54],
        [42, 115, 89],
        [73, 99, 161],
        [136, 51, 115],
        [150, 125, 63],
      ];
      return sizes.map(([width, height], variant) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        const data = ctx.createImageData(width, height);
        const color = colors[variant % colors.length];
        let seed = 234;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            const variation = (seed >>> 27) - 16 + 24 * Math.sin(x / 40) * Math.cos(y / 63);
            const i = (y * width + x) * 4;
            for (let c = 0; c < 3; c++) data.data[i + c] = color[c] + variation;
            data.data[i + 3] = 255;
          }
        }
        ctx.putImageData(data, 0, 0);
        return { width, height, bytes: canvas.toDataURL("image/jpeg", 0.9).split(",")[1] };
      });
    });
    return pictures.map((item) => ({ ...item, bytes: Buffer.from(item.bytes, "base64") }));
  } finally {
    await page.close();
  }
}

// Injected into a dedicated production build. The Query result and original rows are unchanged.
const addMountControl = {
  name: "feed-performance-mount-control",
  enforce: "pre",
  transform(source, id) {
    if (!id.replaceAll("\\", "/").endsWith("/src/components/PostList.tsx")) return;
    if (!source.includes(": posts.map((post) => ("))
      throw new Error("Update the diagnostic transform for PostList");
    return (
      'import { useEffect, useState } from "react";\n' +
      source
        .replace(
          "  const posts = ",
          `  const [trim, setTrim] = useState({ count: 0, height: 0 });
  useEffect(() => {
    const change = (event: Event) => setTrim((event as CustomEvent).detail);
    window.addEventListener("perf-mount-control", change);
    return () => window.removeEventListener("perf-mount-control", change);
  }, []);
  const posts = `,
        )
        .replace(
          ": posts.map((post) => (",
          `: <>{trim.count > 0 && <div aria-hidden="true" data-perf-spacer style={{ height: trim.height }} />}
      {posts.slice(trim.count).map((post) => (`,
        )
        .replace("))}\n      {isFetchingNextPage", "))}</>}\n      {isFetchingNextPage")
    );
  },
};

export async function startFeedFixture(media, count, directory, instrumented, windowed = false) {
  const root = resolve("apps/web");
  const outDir = resolve(
    directory,
    "build",
    windowed ? "window" : instrumented ? "mount" : "control",
  );
  const posts = Array.from({ length: count }, (_, i) => post(i));
  const fixtureHash = createHash("sha256").update(JSON.stringify(posts)).digest("hex");
  const requests = [];
  const fixtures = {
    name: "feed-performance-http",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url, "http://localhost");
        const { pathname } = url;
        if (pathname.startsWith("/perf-media/")) {
          const avatar = pathname.startsWith("/perf-media/avatar/");
          const slide = Number(pathname.match(/-(\d+)\.jpg$/)?.[1] ?? 0);
          const { bytes } = media[avatar ? 5 : slide];
          requests.push({ path: pathname, bytes: bytes.length, at: Date.now() });
          res.writeHead(200, {
            "Content-Type": "image/jpeg",
            "Cache-Control": "public, max-age=86400",
            "Content-Length": bytes.length,
          });
          res.end(bytes);
          return;
        }
        if (!pathname.startsWith("/api/")) return next();
        const cursor = Number(url.searchParams.get("cursor") ?? 0);
        let body = {};
        if (pathname === "/api/auth/refresh") {
          body = {
            accessToken: "synthetic-fixture",
            user: {
              id: "viewer",
              username: "viewer",
              role: "user",
              emailVerified: true,
              avatarUrl: null,
            },
          };
        } else if (pathname === "/api/posts") {
          body = {
            items: posts.slice(cursor, cursor + 20),
            nextCursor: cursor + 20 < count ? String(cursor + 20) : null,
          };
        } else if (pathname.endsWith("/comments")) {
          body = Array.from({ length: 3 }, (_, i) => ({
            id: `comment-${i}`,
            postId: pathname.split("/")[3],
            author: author(i),
            createdAt: date,
            content: "Короткий тестовый комментарий к записи.",
            likeCount: 0,
            likedByMe: false,
            replyCount: 0,
          }));
        } else if (pathname.endsWith("/like")) {
          const id = Number(pathname.split("/")[3].split("-")[1]);
          const liked = req.method === "PUT";
          body = { ...posts[id], likedByMe: liked, likeCount: Number(liked) };
        } else if (/\/unread/.test(pathname)) body = { count: 0 };
        else if (/\/moderation\/notices/.test(pathname)) body = { warnings: [], publishing: null };
        else if (/\/music\/library\/status/.test(pathname)) body = { ids: [] };
        else if (/\/link-preview/.test(pathname)) body = { preview: null };
        else if (/\/news$/.test(pathname)) body = [];
        else if (/\/public\/posts$/.test(pathname)) body = { items: [], nextCursor: null };
        requests.push({ path: pathname, cursor, at: Date.now() });
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify(body));
      });
    },
  };
  const isolatedHtml = {
    name: "feed-performance-local-html",
    transformIndexHtml: (html) =>
      html
        .replace(/<script\b[^>]+src="https:\/\/[^"]+"[^>]*>\s*<\/script>/g, "")
        .replace(/<link\b[^>]+href="https:\/\/fonts\.googleapis\.com[^"]+"[^>]*>/g, ""),
  };
  await build({
    root,
    logLevel: "error",
    build: { outDir, emptyOutDir: false },
    define: { "import.meta.env.VITE_FEED_WINDOW": JSON.stringify(windowed ? "1" : "0") },
    plugins: [isolatedHtml, ...(instrumented ? [addMountControl] : [])],
  });
  const server = await preview({
    root,
    build: { outDir },
    preview: { host: "127.0.0.1", port: 0, strictPort: true },
    plugins: [fixtures],
  });
  const socket = new Server(server.httpServer, { serveClient: false });
  return {
    origin: `http://127.0.0.1:${server.httpServer.address().port}`,
    requests,
    fixtureHash,
    async close() {
      socket.engine.close();
      await server.close();
    },
  };
}
