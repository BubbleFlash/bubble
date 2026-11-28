/* global document */
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { Server } from "socket.io";
import MagicString from "magic-string";
import sharp from "sharp";
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

// Test-build-only marks around the real event handler, render and layout effects.
const galleryMarks = {
  name: "gallery-timeline",
  enforce: "pre",
  transform(source, id) {
    if (id.replaceAll("\\", "/").endsWith("/lib/sound.ts")) {
      const at = "if (!ctx) ctx = new Ctor();";
      if (!source.includes(at)) throw new Error("Missing AudioContext construction");
      const marked = source.replace(
        at,
        `if ((window as any).perfSkipAudio) return;
        if (!ctx) { performance.mark("gallery:audio-create-start"); ctx = new Ctor();
        performance.mark("gallery:audio-create-end"); }`,
      );
      if (process.env.BUBBLE_PERF_AUDIO_PAIR !== "1") return marked;
      return marked.replace("  armed = true;", `  armed = true;
        if ((window as any).perfIdleAudio && Ctor) {
          window.requestIdleCallback(() => { if (!ctx) {
            performance.mark("gallery:audio-create-start"); ctx = new Ctor();
            performance.mark("gallery:audio-create-end");
          } });
          window.addEventListener("touchend", unlockAudio, { once: true, passive: true });
          return;
        }`);
    }
    if (!id.replaceAll("\\", "/").endsWith("/components/ImageGallery.tsx")) return;
    function insert(at, code) {
      if (!source.includes(at)) throw new Error("Missing gallery instrumentation point " + at);
      source = source.replace(at, at + "\n" + code);
    }
    const mark = (label) =>
      `if (images.includes((window as any).perfGalleryUrl)) performance.mark("gallery:${label}");`;
    insert("const moveSlide = (offset: number) => {", mark("handler"));
    insert(
      "const requestedUrl = images[requestedSlide];",
      mark("render") + "\nuseLayoutEffect(() => {" + mark("commit") + "});",
    );
    insert("if (loaded && requestedUrl) {", mark("ready-state"));
    return source;
  },
};

const textProbeControl = {
  name: "text-probe-control",
  enforce: "pre",
  transform(source, id) {
    if (!id.replaceAll("\\", "/").endsWith("/components/PostText.tsx")) return;
    const at = "const update = () => {";
    if (!source.includes(at)) throw new Error("Missing PostText measurement point");
    const code = new MagicString(source);
    code.appendLeft(source.indexOf(at) + at.length, " if ((window as any).perfFreezeText) return;");
    if (process.env.BUBBLE_PERF_CASES?.includes("repeat-text")) {
      const guard = "if (last?.text === text";
      const start = source.indexOf(guard);
      if (start < 0) throw new Error("Missing PostText cache guard");
      code.appendLeft(start + 4, "!(window as any).perfRepeatText && ");
    }
    return {
      code: code.toString(),
      map: code.generateMap({ source: id, hires: true, includeContent: true }),
    };
  },
};

const avatarControl = {
  name: "avatar-delivery-control",
  enforce: "pre",
  transform(source, id) {
    const file = id.replaceAll("\\", "/");
    if (file.endsWith("/lib/prefetch.ts")) {
      const at = "export function prefetchLikelyRoutes() {";
      if (!source.includes(at)) throw new Error("Missing route prefetch point");
      return source.replace(
        at,
        at + ' if ((window as any).perfAvatarVariant === "no-route-prefetch") return;',
      );
    }
    if (file.endsWith("/components/ImageGallery.tsx")) {
      const at = "const distance = Math.abs(i - requestedSlide);";
      if (!source.includes(at)) throw new Error("Missing carousel prefetch point");
      return source.replace(
        at,
        at +
          ' if ((window as any).perfAvatarVariant === "defer-neighbors" && carousel && i !== requestedSlide && i !== visibleSlide) return null;',
      );
    }
    if (file.endsWith("/components/Avatar.tsx")) {
      const at = 'loading="lazy"';
      if (!source.includes(at)) throw new Error("Missing avatar policy");
      return source.replace(
        at,
        at + ' fetchPriority={(window as any).perfAvatarVariant === "priority" ? "high" : "auto"}',
      );
    }
  },
};

const windowCounterProbe = {
  name: "window-counter-probe",
  enforce: "pre",
  transform(source, id) {
    if (!id.replaceAll("\\", "/").endsWith("/components/FeedWindow.tsx")) return;
    const at = "remember(nextAnchor);";
    if (!source.includes(at)) throw new Error("Missing session sampling point");
    return source.replace(
      at,
      at +
        " (window as any).perfWindowCounters = { states:session.cards.size, heights:measurement.heights.size, history:session.history.size };",
    );
  },
};

export async function startFeedFixture(
  media,
  count,
  directory,
  instrumented,
  windowed = false,
  galleryStudy = false,
  avatarStudy = false,
  sessionStudy = false,
  uploadSamples = null,
  delivery = false,
) {
  const root = resolve("apps/web");
  const outDir = resolve(
    directory,
    "build",
    windowed ? "window" : instrumented ? "mount" : "control",
  );
  const posts = Array.from({ length: count }, (_, i) => post(i));
  const canonicalPaths = new Map();
  const mediaRoutes = new Map();
  const responsive = new Map();
  if (delivery) {
    for (const [index, image] of media.entries()) {
      for (const width of index === 5 ? [96, 192] : [640, 1280]) {
        if (image.width <= width) continue;
        responsive.set(`${index}/${width}`, await sharp(image.bytes).resize({ width }).webp({ quality: 82 }).toBuffer());
      }
    }
    function canonical(path) {
      if (canonicalPaths.has(path)) return canonicalPaths.get(path);
      const avatar = path.includes("/avatar/");
      const index = avatar ? 5 : Number(path.match(/-(\d+)\.jpg$/)?.[1]);
      const widths = avatar ? [96, 192] : [640, 1280];
      const postIndex = Number(path.match(/\/(\d+)/)?.[1]);
      const legacy = delivery === "mixed" && postIndex % 2 === 0;
      const mask = legacy ? 0 : widths.reduce((bits, width, i) => bits | (responsive.has(`${index}/${width}`) ? 1 << i : 0), 0);
      const id = (canonicalPaths.size + 1).toString(16).padStart(32,"0");
      const url = `/uploads/${id}${mask ? `-${avatar ? "a" : "p"}${mask}-${media[index].width}` : ""}.jpg`;
      canonicalPaths.set(path,url);
      mediaRoutes.set(url,{ path,index });
      return url;
    }
    for (const post of posts) {
      post.author.avatarUrl = canonical(post.author.avatarUrl);
      post.imageUrls = post.imageUrls.map(canonical);
    }
  }
  const fixtureHash = createHash("sha256").update(JSON.stringify(posts)).digest("hex");
  const requests = [];
  const sampleGroups = { avatars: [], photos: [] };
  for (const variants of uploadSamples ?? []) {
    const stored = variants.find((v) => v.label === "stored");
    const preview = variants.find((v) => v.label === "preview" && v.mime === "image/webp");
    const key = stored.size[0] === stored.size[1] ? "avatars" : "photos";
    sampleGroups[key].push(
      Object.fromEntries(
        [stored, preview].map((v) => [
          v.label,
          { bytes: Buffer.from(v.data, "base64"), mime: v.mime },
        ]),
      ),
    );
  }
  if (uploadSamples && (!sampleGroups.avatars.length || !sampleGroups.photos.length))
    throw new Error("Delivery comparison needs both square and rectangular local images");
  const fixtures = {
    name: "feed-performance-http",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url, "http://localhost");
        const { pathname } = url;
        const deliveryImage = mediaRoutes.get(pathname);
        if (deliveryImage) {
          const {path,index} = deliveryImage;
          const width = url.searchParams.get("w");
          const preview = responsive.get(`${index}/${width}`);
          const bytes = preview ?? media[index].bytes;
          const etag = `"fixture-${index}-${preview ? width : "original"}"`;
          const status = req.headers["if-none-match"] === etag ? 304 : 200;
          requests.push({path, width, status, bytes:status === 304 ? 0 : bytes.length, at:Date.now()});
          res.setHeader("ETag",etag);
          res.setHeader("Cache-Control","private, no-cache");
          if (status === 304) { res.writeHead(304).end(); return; }
          res.writeHead(200,{ "Content-Type":preview ? "image/webp" : "image/jpeg", "Content-Length":bytes.length });
          res.end(bytes);
          return;
        }
        if (pathname.startsWith("/perf-media/")) {
          const avatar = pathname.startsWith("/perf-media/avatar/");
          const slide = Number(pathname.match(/-(\d+)\.jpg$/)?.[1] ?? 0);
          const id = Number(pathname.match(/\/(\d+)(?:-|\.jpg)/)?.[1] ?? 0);
          const group = avatar ? sampleGroups.avatars : sampleGroups.photos;
          const sample =
            uploadSamples && group[(id + slide) % group.length][req.headers["x-perf-image-size"]];
          const { bytes, mime = "image/jpeg" } = sample || media[avatar ? 5 : slide];
          requests.push({ path: pathname, bytes: bytes.length, at: Date.now() });
          res.writeHead(200, {
            "Content-Type": mime,
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
    build: { outDir, emptyOutDir: false, sourcemap: process.env.BUBBLE_PERF_CPU === "1" },
    define: { "import.meta.env.VITE_FEED_WINDOW": JSON.stringify(windowed ? "1" : "0") },
    plugins: [
      isolatedHtml,
      ...(instrumented ? [addMountControl] : []),
      ...(galleryStudy ? [galleryMarks] : []),
      ...(avatarStudy ? [avatarControl] : []),
      ...(delivery ? [{
        name:"media-delivery-control", enforce:"pre", transform(source,id) {
          if (!id.replaceAll("\\","/").endsWith("/components/AssetImage.tsx")) return;
          return source.replace("const variants = direct", "const variants = !(window as any).perfOriginalMedia && direct");
        },
      }] : []),
      ...(sessionStudy ? [windowCounterProbe] : []),
      ...(/freeze-text|repeat-text/.test(process.env.BUBBLE_PERF_CASES ?? "")
        ? [textProbeControl]
        : []),
    ],
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
    mediaPath: path => canonicalPaths.get(path) ?? path,
    async close() {
      socket.engine.close();
      await server.close();
    },
  };
}
