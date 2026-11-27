import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { DEFAULT_COMMUNITY_PERMISSIONS, rateLimitDefaults, type RateLimitSettingsDTO } from "@commune/shared";
import type { AccountUser, ClientNetworkEvent, CommentDTO, CreateCommentInput, MetricsReport, NetworkReport, PostDTO } from "@commune/shared";

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
  firstRefresh?: "offline" | "rate-limited" | "unavailable",
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
      if (refreshes === 1 && firstRefresh === "unavailable") return route.fulfill({ status: 503, json: {} });
      if (refreshes === 1 && firstRefresh === "rate-limited") {
        return route.fulfill({ status: 429, headers: { "Retry-After": "3", "X-RateLimit-Limiter": "refresh-account",
          "CF-Ray": "0123456789abcdef-FRA", "X-Request-Id": "54" } });
      }
      return route.fulfill({ json: { accessToken: "fixture", user: viewer } });
    }
    if (path === "/client-network") {
      events?.push(...route.request().postDataJSON().events as ClientNetworkEvent[]);
      return route.fulfill({ status: 204 });
    }
    if (path === "/posts") return route.fulfill({ json: { items: posts, nextCursor: null } });
    if (path === "/public/posts") return route.fulfill({ json: { items: [], nextCursor: null } });
    if (path === "/profile-presence") return route.fulfill({ json: { online: ["author"] } });
    if (path === "/site-content") return route.fulfill({ json: {
      about: "Bubble — независимая социальная сеть.", benefits: "", principles: "", rules: "",
    } });
    if (path === "/site-team") return route.fulfill({ json: { groups: {
      developers: [], artists: [], testers: [], moderators: [], administrators: [],
    } } });
    if (path === "/music/picker") return route.fulfill({ json: { tracks: [], nextCursor: null } });
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

async function moveCaretToEnd(field: Locator) {
  await field.evaluate((element: HTMLTextAreaElement) => {
    element.setSelectionRange(element.value.length, element.value.length);
  });
}

test("one chime across tabs for each realtime delivery", async ({ context }) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  const tabs = await Promise.all([context.newPage(), context.newPage(), context.newPage()]);
  const send: Array<(packet: string) => void> = [];
  for (const [index, tab] of tabs.entries()) {
    await installFixtures(tab, origin);
    await tab.addInitScript(() => {
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        start.apply(this, args);
        document.documentElement.dataset.chimes = String(Number(document.documentElement.dataset.chimes ?? 0) + 1);
      };
    });
    let deliver: ((packet: string) => void) | undefined;
    await tab.routeWebSocket("**/socket.io/**", (socket) => {
        socket.onMessage((data) => {
          if (String(data).startsWith("40")) {
            socket.send('40{"sid":"fixture"}');
            deliver = packet => socket.send(packet);
          }
        });
        socket.send('0{"sid":"fixture","upgrades":[],"pingInterval":60000,"pingTimeout":60000,"maxPayload":100000}');
    });
    await tab.goto(origin);
    await expect(tab.getByRole("tablist")).toBeVisible();
    if (index > 0) await tab.keyboard.press("Shift");
    await expect.poll(() => Boolean(deliver)).toBe(true);
    send.push(deliver!);
  }
  const counts = () => Promise.all(tabs.filter(tab => !tab.isClosed()).map(tab =>
    tab.evaluate(() => Number(document.documentElement.dataset.chimes ?? 0))));
  const total = async () => (await counts()).reduce((a, b) => a + b, 0);
  const notification = '42' + JSON.stringify(["notification:new", { notification: {
    id: "shared-like", createdAt, type: "like", actor: posts[0]!.author, postId: posts[0]!.id,
  } }]);
  send.forEach(deliver => deliver(notification));
  await expect.poll(total).toBe(1);
  const played = await counts();
  expect(played[0]).toBe(0);
  const winner = played.indexOf(1);
  await tabs[winner]!.close();
  const survivor = winner === 1 ? 2 : 1;
  await tabs[survivor]!.waitForTimeout(1000);
  send[survivor]!(notification);
  const message = '42' + JSON.stringify(["message:new", { message: {
    id: "shared-message", conversationId: "chat", senderId: "sender", createdAt,
  } }]);
  await tabs[survivor]!.waitForTimeout(1000);
  expect(await total()).toBe(0);
  send[0]!(message);
  send[survivor]!(message);
  await expect.poll(total).toBe(1);
});

test("post like follows rapid taps, reconciles failed writes and keeps the feed in place", async ({ page }) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  const received: string[] = [];
  const release: Array<(status: number) => void> = [];
  await page.route("**/api/posts/fixture-0/like", async route => {
    const method = route.request().method();
    received.push(method);
    const status = await new Promise<number>(resolve => release.push(resolve));
    await route.fulfill({ status, json: status === 200
      ? { ...posts[0], likeCount: Number(method === "PUT"), likedByMe: method === "PUT" }
      : { error: "Отказ" } });
  });
  await page.goto(origin);
  const card = page.locator('[data-post-id="fixture-0"]');
  const heart = card.locator(".post-actions button[aria-pressed]").first();
  await heart.click();
  await expect(heart).toHaveAttribute("aria-label", "Нравится · 1");
  await expect.poll(() => received.length).toBe(1);
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  expect(received).toEqual(["PUT"]);
  release[0]!(200);
  await expect.poll(() => received.length).toBe(2);
  await expect(heart).toHaveAttribute("aria-label", "Нравится · 0");
  release[1]!(403);
  await expect(card.getByRole("alert")).toBeVisible();
  await expect(heart).toHaveAttribute("aria-label", "Нравится · 1");
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  expect(received).toEqual(["PUT", "DELETE"]);
});

test("a touch like shows its pressed color without leaving a hover highlight", async ({ page }, info) => {
  test.skip(!info.project.use.hasTouch);
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  await page.route("**/api/posts/fixture-0/like", route => route.fulfill({
    json: { ...posts[0], likedByMe: true, likeCount: 1 },
  }));
  await page.goto(origin);
  const button = page.locator('[data-post-id="fixture-0"] .post-actions button[aria-pressed]').first();
  const idle = await button.evaluate(el => getComputedStyle(el).backgroundColor);
  await button.tap();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(button.locator("svg")).toHaveCSS("color", "rgb(177, 36, 64)");
  await expect(button).toHaveCSS("background-color", idle);
  await expect(button).toHaveCSS("background-image", "none");
});

test("feed gallery preserves its height while preparing the next slide", async ({ page }) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  const photos = Array.from({ length: 5 }, (_, index) => `/fixture-gallery/${index}.svg`);
  const requested: string[] = [];
  let releaseNext = () => {};
  const nextPhoto = new Promise<void>(resolve => { releaseNext = resolve; });
  await page.route("**/fixture-gallery/*.svg", async route => {
    const path = new URL(route.request().url()).pathname;
    requested.push(path);
    if (path === photos[1]) await nextPhoto;
    if (path === photos[2]) return route.fulfill({ status: 404 });
    const height = path === photos[1] ? 480 : 180;
    return route.fulfill({
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="${height}"><rect width="100%" height="100%" fill="teal"/></svg>`,
    });
  });
  await page.route("**/api/posts?*", route => route.fulfill({
    json: { items: [{ ...posts[0], imageUrls: photos }], nextCursor: null },
  }));
  await page.goto(origin);
  const gallery = page.locator('[data-post-id="fixture-0"] .image-gallery--carousel');
  const active = gallery.locator(".image-gallery__item:not([hidden]) img");
  await expect.poll(() => active.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(480);
  const size = await active.boundingBox();
  expect(size!.height / size!.width).toBeCloseTo(180 / 480, 2);
  await expect.poll(() => new Set(requested).size).toBe(3);
  expect(new Set(requested)).toEqual(new Set([photos[0], photos[1], photos[4]]));
  try {
    await gallery.getByRole("button", { name: "Следующее фото" }).click();
    await expect(gallery.getByRole("status", { name: "Загрузка изображения" })).toBeVisible();
    await expect(active).toHaveAttribute("src", photos[0]!);
    expect((await active.boundingBox())!.height).toBeCloseTo(size!.height, 0);
    await gallery.getByRole("button", { name: "Предыдущее фото" }).click();
    await expect(gallery.getByRole("status", { name: "Загрузка изображения" })).toBeHidden();
    await gallery.getByRole("button", { name: "Следующее фото" }).click();
  } finally {
    releaseNext();
  }
  await expect.poll(() => active.evaluate((image: HTMLImageElement) => image.naturalHeight)).toBe(480);
  await expect(gallery.locator(".image-gallery__count")).toHaveText("2 / 5");
  await gallery.getByRole("button", { name: "Открыть изображение 2 из 5" }).click();
  await expect(page.getByRole("dialog", { name: "Просмотр изображения" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Просмотр изображения" })).toBeHidden();
  await gallery.getByRole("button", { name: "Следующее фото" }).click();
  await expect(gallery.getByRole("status").filter({ hasText: "Не удалось загрузить изображение" })).toBeVisible();
  await expect(active).toHaveAttribute("src", photos[1]!);
  await gallery.getByRole("button", { name: "Следующее фото" }).click();
  await expect(gallery.locator(".image-gallery__count")).toHaveText("4 / 5");
});

for (const platform of ["desktop", "Android", "iPhone", "iPadOS"] as const) {
  test(`edit and submit posts, comments and messages with the ${platform} keyboard`, async ({ page }) => {
    const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
    if (platform !== "desktop") {
      await page.addInitScript((platform) => {
        if (platform === "Android") {
          Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (Linux; Android 15) Mobile" });
        } else if (platform === "iPhone") {
          Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile" });
        } else {
          Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" });
          Object.defineProperty(navigator, "platform", { value: "MacIntel" });
          Object.defineProperty(navigator, "maxTouchPoints", { value: 5 });
        }
      }, platform);
    }
    await installFixtures(page, origin);
    const published: string[] = [];
    await page.route(/\/api\/posts(?:\?.*)?$/, (route) => {
      if (route.request().method() === "GET") return route.fallback();
      const { content } = route.request().postDataJSON();
      published.push(content);
      return route.fulfill({ status: 201, json: { ...posts[0], content } });
    });
    const comments: CommentDTO[] = [];
    const commentWrites: string[] = [];
    await page.route("**/api/posts/fixture-0/comments", (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: comments });
      const { content, parentId }: CreateCommentInput = route.request().postDataJSON();
      commentWrites.push(content);
      const comment: CommentDTO = {
        id: `comment-${comments.length}`, postId: "fixture-0", author: viewer, createdAt,
        content, parentId: parentId ?? null, likeCount: 0, likedByMe: false, replyCount: 0,
      };
      comments.push(comment);
      return route.fulfill({ status: 201, json: comment });
    });
    const sent: string[] = [];
    const conversation = { id: "thread", other: posts[0]!.author, lastMessage: null, lastMessageAt: createdAt, unread: 0, seenByOther: true };
    await page.route("**/api/messages", (route) => route.fulfill({ json: [conversation] }));
    await page.route("**/api/messages/thread", (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: { conversation, items: [], nextCursor: null } });
      const { text, clientMessageId } = route.request().postDataJSON();
      sent.push(text);
      return route.fulfill({ status: 201, json: { id: "message", conversationId: "thread", senderId: viewer.id, text, clientMessageId, createdAt } });
    });

    async function checkDraft(field: Locator, submit: Locator, writes: string[], prefix = "") {
      const previousWrites = writes.length;
      await field.click();
      await expect(field).toBeFocused();
      if (prefix) await moveCaretToEnd(field);
      await field.pressSequentially("first line");
      const firstLine = `${prefix}first line`;
      await expect(field).toHaveValue(firstLine);
      await field.press(platform === "desktop" ? "Shift+Enter" : "Enter");
      await expect(field).toHaveValue(`${firstLine}\n`);
      await field.pressSequentially("second line");
      const multiline = `${firstLine}\nsecond line`;
      await expect(field).toHaveValue(multiline);
      expect(writes).toHaveLength(previousWrites);
      if (platform === "desktop") await field.press("Enter");
      else await submit.click();
      await expect(field).toHaveValue("");
      expect(writes.slice(previousWrites)).toEqual([multiline]);
    }

    await page.goto(origin);
    const card = page.locator(".feed-post").first();
    await expect(card).toBeVisible();
    await checkDraft(page.getByRole("textbox", { name: "Написать запись" }), page.getByRole("button", { name: "Опубликовать" }), published);
    await card.getByRole("button", { name: "0 комментариев" }).click();
    const comment = card.getByRole("textbox", { name: "Написать комментарий" });
    const sendComment = card.getByRole("button", { name: "Отправить", exact: true });
    await expect(comment).toHaveAttribute("enterkeyhint", platform === "desktop" ? "send" : "enter");
    await checkDraft(comment, sendComment, commentWrites);
    await card.getByRole("button", { name: "Ответить", exact: true }).click();
    const replyField = card.getByRole("textbox", { name: /^Написать (ответ|комментарий)$/ });
    await expect(replyField).toHaveAccessibleName("Написать ответ");
    await checkDraft(replyField, sendComment, commentWrites, `${viewer.username}, `);
    await expect(replyField).toHaveAccessibleName("Написать комментарий");
    expect(comments[1]?.parentId).toBe(comments[0]?.id);
    await page.goto(`${origin}/messages/thread`);
    await checkDraft(page.getByRole("textbox", { name: "Сообщение" }), page.getByRole("button", { name: "Отправить", exact: true }), sent);
  });
}

test("publish a multiline comment and retry a pasted photo in a multiline reply", async ({ page }) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  const comments: CommentDTO[] = [];
  const published: CreateCommentInput[] = [];
  await page.route("**/api/posts/fixture-0/comments", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: comments });
    const input: CreateCommentInput = route.request().postDataJSON();
    published.push(input);
    const comment: CommentDTO = {
      id: `comment-${comments.length}`, postId: "fixture-0", author: viewer, createdAt,
      content: input.content, imageUrls: input.imageUrls, parentId: input.parentId ?? null,
      likeCount: 0, likedByMe: false, replyCount: 0,
    };
    comments.push(comment);
    return route.fulfill({ status: 201, json: comment });
  });
  const photo = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  const url = `/uploads/${"a".repeat(32)}.gif`;
  let attempts = 0;
  await page.route("**/api/uploads", (route) => ++attempts === 1
    ? route.fulfill({ status: 503, json: { error: "Service unavailable" } })
    : route.fulfill({ status: 201, json: { url } }));
  await page.route(`**${url}*`, (route) => route.fulfill({ contentType: "image/gif", body: Buffer.from(photo, "base64") }));

  await page.goto(origin);
  const card = page.locator(".feed-post").first();
  await card.getByRole("button", { name: "0 комментариев" }).click();
  const draft = card.getByRole("textbox", { name: "Написать комментарий" });
  await draft.fill("Комментарий");
  await moveCaretToEnd(draft);
  await draft.press("Shift+Enter");
  await draft.pressSequentially("second line");
  await expect(draft).toHaveValue("Комментарий\nsecond line");
  expect(published).toHaveLength(0);
  await draft.press("Enter");
  const comment = card.locator(".inline-comment p");
  await expect(comment).toHaveJSProperty("textContent", "Комментарий\nsecond line");
  await expect(comment).toHaveCSS("white-space", "pre-wrap");

  await page.goto(`${origin}/posts/fixture-0`);
  await page.getByRole("button", { name: "Ответить", exact: true }).click();
  const reply = page.getByRole("textbox", { name: "Написать ответ" });
  await expect(reply).toBeFocused();
  await reply.fill("Ответ");
  await moveCaretToEnd(reply);
  await reply.press("Shift+Enter");
  await reply.pressSequentially("with photo");
  await reply.evaluate((field, photo) => {
    const data = new DataTransfer();
    const bytes = Uint8Array.from(atob(photo), (character) => character.charCodeAt(0));
    data.items.add(new File([bytes], "photo.gif", { type: "image/gif" }));
    field.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, photo);
  const preview = page.getByRole("img", { name: "Предпросмотр вложения" });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveJSProperty("naturalWidth", 1);
  await expect(page.getByRole("alert")).toContainText("Не удалось выполнить запрос (код 503).");
  const send = page.getByRole("button", { name: "Отправить", exact: true });
  await expect(send).toBeDisabled();
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(send).toBeEnabled();
  await expect(reply).toHaveValue("Ответ\nwith photo");
  await send.click();

  const replyRow = page.locator(".inline-comment--reply");
  await expect(replyRow.locator("p").first()).toHaveJSProperty("textContent", "Ответ\nwith photo");
  await expect(replyRow.getByRole("img", { name: /Изображение комментария/ })).toBeVisible();
  await expect(preview).toHaveCount(0);
  expect(attempts).toBe(2);
  expect(published).toEqual([
    expect.objectContaining({ content: "Комментарий\nsecond line" }),
    expect.objectContaining({ content: "Ответ\nwith photo", parentId: comments[0]!.id, imageUrls: [url] }),
  ]);
});

test("grow post and comment drafts and restore their initial height", async ({ page }) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  await page.goto(origin);
  const card = page.locator(".feed-post").first();
  await expect(card).toBeVisible();
  const post = page.getByRole("textbox", { name: "Написать запись" });
  const height = async (field: Locator) => (await field.boundingBox())!.height;
  const postHeight = await height(post);
  const text = Array.from({ length: 8 }, (_, index) => `Line ${index + 1}`).join("\n");
  await post.click();
  await post.fill(text);
  await expect.poll(() => height(post)).toBeGreaterThan(postHeight);
  await post.fill("");
  await expect.poll(() => height(post)).toBe(postHeight);

  await card.getByRole("button", { name: "0 комментариев" }).click();
  const comment = card.getByRole("textbox", { name: "Написать комментарий" });
  const send = card.getByRole("button", { name: "Отправить", exact: true });
  await expect(send).toHaveCSS("height", "44px");
  const commentHeight = await height(send);
  await expect.poll(() => height(comment)).toBe(commentHeight);
  await expect(comment).toHaveCSS("resize", "none");
  await expect(send.locator("svg path")).toHaveAttribute("d", "M2.01 21 23 12 2.01 3 2 10l15 2-15 2z");
  await comment.click();
  await comment.pressSequentially("Line 1");
  await comment.press("Shift+Enter");
  await expect.poll(() => height(comment)).toBeGreaterThan(commentHeight);
  await comment.fill(text.repeat(5));
  await expect.poll(() => comment.evaluate((field) => field.scrollHeight > field.clientHeight)).toBe(true);
  await comment.fill("");
  await expect.poll(() => height(comment)).toBe(commentHeight);
  await expect(send).toBeDisabled();
});

test("keep long group names within search results, group headers and reposts", async ({ page }) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  const name = "Ш".repeat(48);
  const group = { id: "long-group", slug: "long-group", name, createdAt, description: "",
    memberCount: 1, joinedByMe: true, myRole: "owner", permissions: DEFAULT_COMMUNITY_PERMISSIONS,
    actions: { publish: true, editAppearance: true, manageMembers: true } };
  const post: PostDTO = { ...posts[0]!, community: group, musicAttachments: [], repost: {
    kind: "post", postId: "original", community: group, author: posts[0]!.author,
    content: "Исходная запись", imageUrls: [], musicAttachments: [], createdAt,
  } };
  const pageOfPosts = { items: [post], nextCursor: null };
  await installFixtures(page, origin);
  await page.route(/\/api\/communities(\?.*)?$/, (route) => route.fulfill({ json: [group] }));
  await page.route("**/api/communities/long-group", (route) => route.fulfill({ json: group }));
  await page.route("**/api/communities/long-group/team", (route) => route.fulfill({ json: { items: [], nextCursor: null } }));
  await page.route("**/api/communities/long-group/posts", (route) => route.fulfill({ json: pageOfPosts }));
  await page.route(/\/api\/posts(\?.*)?$/, (route) => route.fulfill({ json: pageOfPosts }));
  await page.route("**/api/posts/fixture-0", (route) => route.fulfill({ json: post }));
  const conversation = { id: "thread", other: { ...post.author, bio: "" }, lastMessage: null, lastMessageAt: createdAt, unread: 0, seenByOther: true };
  await page.route("**/api/messages", (route) => route.fulfill({ json: [conversation] }));
  await page.route("**/api/messages/thread", (route) => route.fulfill({ json: {
    conversation, nextCursor: null, items: [{ id: "message", conversationId: "thread", senderId: post.author.id,
      text: "", repost: post.repost, createdAt }],
  } }));

  async function expectNameToFit(container: Locator) {
    const title = container.getByText(name, { exact: true });
    await expect(title).toBeVisible();
    expect(await title.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const bounds = element.closest(".community-result, .community-head, .community-management__summary, .post-meta, .repost-card__header, button, article")!.getBoundingClientRect();
      return Array.from(range.getClientRects()).every((line) => line.left >= bounds.left - 1 && line.right <= bounds.right + 1);
    })).toBe(true);
  }

  await page.goto(`${origin}/communities`);
  await page.getByRole("tab", { name: "Все группы" }).click();
  await page.getByRole("searchbox", { name: "Найти группу" }).fill(name.slice(0, 10));
  await expectNameToFit(page.locator(".community-result"));

  await page.locator(".community-result").click();
  await expectNameToFit(page.locator(".community-head"));
  const actionButtons = page.locator(".community-head__actions button");
  await expect(actionButtons).toHaveCount(2);
  expect((await actionButtons.nth(0).boundingBox())?.y).toBe((await actionButtons.nth(1).boundingBox())?.y);
  await page.getByRole("button", { name: "Управление группой", exact: true }).click();
  await expectNameToFit(page.locator(".community-management__summary"));

  await page.goto(origin);
  await expectNameToFit(page.locator(".feed-post .post-meta"));
  await page.goto(`${origin}/posts/fixture-0`);
  await expectNameToFit(page.locator(".post-meta"));
  await expectNameToFit(page.locator(".repost-card__header"));
  await page.getByRole("button", { name: /^Поделиться записью/ }).click();
  await page.getByRole("radio", { name: "Группа", exact: true }).check();
  const groupPicker = page.getByRole("button", { name: "Группа", exact: true });
  await groupPicker.click();
  const option = page.getByRole("option", { name, exact: true });
  await expectNameToFit(option);
  await option.click();
  await expectNameToFit(page.locator(".repost-select__control"));

  await page.goto(`${origin}/messages/thread`);
  await expectNameToFit(page.locator(".chat .repost-card__header"));

  await page.route("**/api/auth/refresh", (route) => route.fulfill({ status: 401, json: { error: "No session" } }));
  await page.route("**/api/public/posts/fixture-0", (route) => route.fulfill({ json: { ...post, repost: undefined } }));
  await page.goto(`${origin}/posts/fixture-0`);
  await expectNameToFit(page.locator("article.post"));
});

test("refresh the registration captcha after rejection and keep the form fields", async ({ page }) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ status: 401, json: { error: "No session" } }));
  let issued = 0;
  await page.route("**/api/auth/register/captcha", (route) => {
    const id = (++issued).toString(16).padStart(48, "0");
    const image = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="64"/>').toString("base64");
    return route.fulfill({ json: { required: true, id, image } });
  });
  await page.route("**/api/auth/register", async (route) => {
    expect(route.request().postDataJSON().captcha).toEqual({ id: "2".padStart(48, "0"), answer: "123456" });
    await route.fulfill({ status: 400, json: { error: "Invalid or expired captcha" } });
  });
  await page.goto(`${origin}/register`);
  const account = page.getByLabel("ID профиля");
  const email = page.getByLabel("Электронная почта");
  const password = page.getByLabel("Пароль", { exact: true });
  const code = page.getByLabel("Код с картинки");
  await expect(page.getByRole("img", { name: "Картинка с проверочным кодом" })).toBeVisible();
  await account.fill("bubble_tester");
  await email.fill("bubble_tester@example.invalid");
  await password.fill("fixture-password");
  await code.fill("555555");
  await page.getByRole("button", { name: "Обновить картинку" }).click();
  await expect(code).toHaveValue("");
  await code.fill("123456");
  await page.getByRole("button", { name: "Создать аккаунт", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Код неверный или устарел" })).toBeVisible();
  await expect(code).toHaveValue("");
  await expect(account).toHaveValue("bubble_tester");
  await expect(email).toHaveValue("bubble_tester@example.invalid");
  await expect(password).toHaveValue("fixture-password");
  expect(issued).toBe(3);
});

test("show confirmation instructions after registration from the guest tab", async ({ page }) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ status: 401, json: { error: "No session" } }));
  await page.route("**/api/auth/register/captcha", (route) => route.fulfill({ json: {
    required: true, id: "a".repeat(48), image: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
  } }));
  await page.route("**/api/auth/register", (route) => route.fulfill({ status: 201, json: { verificationRequired: true } }));
  await page.goto(`${origin}/login`);
  await page.getByRole("tab", { name: "Регистрация" }).click();
  await page.getByLabel("ID профиля").fill("bubble_tester");
  await page.getByLabel("Электронная почта").fill("test@example.invalid");
  await page.getByLabel("Пароль", { exact: true }).fill("fixture-password");
  await page.getByLabel("Код с картинки").fill("123456");
  const picture = page.getByRole("img", { name: "Картинка с проверочным кодом" });
  const button = page.getByRole("button", { name: "Обновить картинку" });
  const pictureBox = await picture.boundingBox();
  const buttonBox = await button.boundingBox();
  expect(buttonBox!.x).toBeGreaterThanOrEqual(pictureBox!.x + pictureBox!.width);
  await page.getByRole("button", { name: "Создать аккаунт", exact: true }).click();
  await expect(page.getByText("Проверьте почту")).toBeVisible();
  await expect(page.getByText("test@example.invalid")).toBeVisible();
  await expect(page.getByText(/перейдите по ссылке/)).toBeVisible();
  await expect(page.getByText("test@example.invalid")).toHaveCSS("display", "inline");
  await expect(page.getByRole("link", { name: "Перейти ко входу" })).toHaveCount(0);
});

test("keep the publication draft and display Retry-After on a 429", async ({ page }) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  await page.route("**/api/posts", (route) => route.request().method() === "POST"
    ? route.fulfill({ status: 429, headers: { "Retry-After": "90042" }, json: { error: "Too many requests, slow down." } })
    : route.fallback());
  await page.goto(origin);
  const draft = page.getByRole("textbox", { name: "Написать запись" });
  await draft.fill("Черновик публикации");
  await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
  await expect(page.getByText("Слишком много запросов. Повторите через 25 ч 42 с.")).toBeVisible();
  await expect(draft).toHaveValue("Черновик публикации");
});

test("save an account rule in hours and switch registration captcha independently", async ({ page }) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: { accessToken: "fixture", user: { ...viewer, role: "admin" } } }));
  const settings: RateLimitSettingsDTO = {
    enabled: false,
    captchaEnabled: false,
    rules: Object.fromEntries(Object.entries(rateLimitDefaults).map(([name, rule]) => [name, { ...rule, enabled: true }])) as RateLimitSettingsDTO["rules"],
  };
  await page.route("**/api/admin/rate-limits", (route) => route.fulfill({ json: settings }));
  await page.route("**/api/admin/rate-limits/post-create", (route) => {
    const rule = route.request().postDataJSON();
    expect(rule).toEqual({ enabled: false, limit: 7, windowSeconds: 7200 });
    settings.rules["post-create"] = rule;
    return route.fulfill({ json: rule });
  });
  await page.route("**/api/admin/rate-limits/captcha", (route) => {
    expect(route.request().postDataJSON()).toEqual({ enabled: true });
    settings.captchaEnabled = true;
    return route.fulfill({ json: { captchaEnabled: true } });
  });
  await page.goto(`${origin}/moderation`);
  await page.getByRole("button", { name: "Лимиты", exact: true }).click();
  await page.getByLabel("Использовать это правило").uncheck();
  await page.getByLabel("Действий за период").fill("7");
  await page.getByLabel("Единица периода").selectOption("hours");
  await page.getByLabel("Период", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Сохранить правило" }).click();
  await expect(page.getByText("Правило сохранено.")).toBeVisible();
  await page.getByRole("button", { name: "Включить капчу" }).click();
  await expect(page.getByText("Капча включена.")).toBeVisible();
  await expect(page.getByText("Общие лимиты API выключены.")).toBeVisible();
});

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
  const avatar = first.locator(".avatar-presence");
  const indicator = avatar.getByRole("img", { name: "Онлайн" });
  await expect(indicator).toBeVisible();
  await expect(indicator).toHaveCSS("position", "absolute");
  expect(await indicator.evaluate((dot) => {
    const parent = dot.parentElement!.getBoundingClientRect();
    const child = dot.getBoundingClientRect();
    return child.x > parent.x + parent.width / 2 && child.y > parent.y + parent.height / 2;
  })).toBe(true);
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
  if (info.project.name.startsWith("firefox")) {
    const chrome = page.locator(".aero-window-chrome");
    await expect(chrome).toHaveCSS("position", "sticky");
    expect(await chrome.evaluate((node) => {
      const bottom = node.getBoundingClientRect().bottom;
      const left = node.getBoundingClientRect().left;
      return node.contains(document.elementFromPoint(left + 2, bottom - 2));
    })).toBe(true);
    await expect(page.locator(".aero-window > .shell")).toHaveCSS("clip-path", "none");
  }
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

test("scroll deep in the feed without restyling the entire desktop shell", async ({ page }, info) => {
  test.skip(info.project.use.hasTouch);
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  await page.addInitScript(() => {
    const metrics = { textMeasurements: 0 };
    Object.assign(window, { deepFeedMetrics: metrics });
    const getRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      if (this.classList.contains("post-body")) metrics.textMeasurements++;
      return getRect.call(this);
    };
  });
  const longFeed = Array.from({ length: 240 }, (_, index) => ({
    ...posts[index % posts.length]!,
    id: `long-fixture-${index}`,
    author: {
      ...posts[0]!.author,
      avatarUrl: index % 2 ? "/bubble-logo.png" : null,
      avatarFrame: { effect: "pulse", color: "#1177cc", intensity: 3 },
    },
    content: index === 239 ? "Строка записи\n".repeat(15) + "Конец длинной записи" : `Тестовая запись ${index}`,
    musicAttachments: [],
  }));
  await page.route("**/api/posts?*", route => route.fulfill({
    json: { items: longFeed, nextCursor: null },
  }));
  await page.goto(origin);
  await expect(page.locator("article.feed-post")).toHaveCount(longFeed.length);
  const probe = await page.evaluate(async () => {
    const metrics = (window as Window & { deepFeedMetrics: { textMeasurements: number } }).deepFeedMetrics;
    const initialMeasurements = metrics.textMeasurements;
    const shell = document.querySelector<HTMLElement>(".aero-window > .shell")!;
    const tabs = document.querySelector<HTMLElement>(".feed-tabs")!;
    const chrome = document.querySelector<HTMLElement>(".aero-window-chrome")!;
    let writes = 0;
    const observer = new MutationObserver(records => { writes += records.length; });
    observer.observe(shell, { attributes: true, attributeFilter: ["style"] });
    const samples = [];
    try {
      for (const fraction of [0.1, 0.75]) {
        window.scrollTo(0, document.documentElement.scrollHeight * fraction);
        const initialY = window.scrollY;
        const intervals: number[] = [];
        await new Promise<void>(resolve => {
          let start = 0;
          let previous = 0;
          function step(now: number) {
            if (previous) intervals.push(now - previous);
            previous = now;
            start ||= now;
            window.scrollTo(0, initialY + (now - start) * 2);
            if (now - start < 1000) requestAnimationFrame(step);
            else resolve();
          }
          requestAnimationFrame(step);
        });
        intervals.sort((a, b) => a - b);
        samples.push({ y: window.scrollY, frames: intervals.length, p95: intervals[Math.ceil(intervals.length * 0.95) - 1] });
      }
      return {
        writes,
        samples,
        initialMeasurements,
        textMeasurements: metrics.textMeasurements,
        stuck: tabs.dataset.stuck,
        aligned: Math.abs(tabs.getBoundingClientRect().top - chrome.getBoundingClientRect().bottom) < 2,
      };
    } finally {
      observer.disconnect();
    }
  });
  await info.attach("deep-feed-timings", { body: JSON.stringify(probe), contentType: "application/json" });
  expect(probe.samples[1]!.y).toBeGreaterThan(probe.samples[0]!.y);
  expect(probe.samples[1]!.frames).toBeGreaterThan(20);
  expect(probe.writes).toBe(0);
  expect(probe.textMeasurements).toBeLessThan(longFeed.length / 2);
  expect(probe.textMeasurements).toBeGreaterThan(0);
  expect(probe.stuck).toBe("true");
  expect(probe.aligned).toBe(true);
  const last = page.locator("article.feed-post").last();
  await last.scrollIntoViewIfNeeded();
  // Drive the real pointer in both directions. The hover surface must fade while
  // the label, icon and hit target stay fully opaque.
  const hoverSamples = [];
  for (const control of [page.locator(".left-nav .side-link:not(.active)").first(),
    last.locator(".post-like"), last.locator(".post-actions button").nth(1)]) {
    await page.mouse.move(0, 0);
    for (const entering of [true, false]) {
      await control.evaluate((el, enter) => {
        el.removeAttribute("data-hover-sample");
        el.addEventListener(enter ? "pointerenter" : "pointerleave", () => {
          const values: number[] = [];
          const times: number[] = [];
          function sample(t: number) {
            times.push(t);
            values.push(Number(getComputedStyle(el, "::before").opacity));
            if (t - times[0]! < 240) requestAnimationFrame(sample);
            else el.setAttribute("data-hover-sample", JSON.stringify({ values, times }));
          }
          requestAnimationFrame(sample);
        }, { once: true });
      }, entering);
      if (entering) await control.hover();
      else await page.mouse.move(0, 0);
      await expect(control).toHaveAttribute("data-hover-sample", /values/);
      const sample = JSON.parse((await control.getAttribute("data-hover-sample"))!);
      hoverSamples.push(sample);
      expect(sample.values.some((v: number) => v > 0 && v < 1)).toBe(true);
      expect(sample.values.at(-1)).toBe(entering ? 1 : 0);
      await expect(control).toHaveCSS("opacity", "1");
    }
  }
  await info.attach("deep-hover", { body: JSON.stringify(hoverSamples), contentType: "application/json" });
  await expect(last.locator(".avatar-presence")).toHaveAttribute("data-pulse-halo", "true");
  await expect(page.locator("article.feed-post").first().locator(".avatar-presence")).not.toHaveAttribute("data-pulse-halo", "true");
  expect(await page.locator(".feed-post [data-pulse-halo]").count()).toBeLessThan(20);
  const halo = last.locator(".avatar-pulse");
  expect(await halo.evaluate(el => getComputedStyle(el, "::before").animationName)).toBe("avatar-glow-pulse");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await halo.evaluate(el => getComputedStyle(el, "::before").animationName)).toBe("none");
  expect(await last.locator(".post-like").evaluate(el => getComputedStyle(el, "::before").transitionDuration)).toBe("0s");
  await last.getByRole("button", { name: "Читать далее…" }).click();
  await expect(last.getByText("Конец длинной записи", { exact: false })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator("article.feed-post").first().locator(".avatar-presence")).toHaveAttribute("data-pulse-halo", "true");
  await expect(page.getByRole("tablist", { name: "Лента" })).not.toHaveAttribute("data-stuck", "true");
});

test("resize a post draft from its bottom corner on a touch device", async ({ page }) => {
  test.skip(page.viewportSize()!.width > 1100, "Touch viewport only");
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  await page.goto(origin);
  const field = page.getByRole("textbox", { name: "Написать запись" });
  const handle = page.getByRole("button", { name: "Изменить высоту поля записи" });
  await expect(page.locator(".feed-post").first()).toBeVisible();
  await expect(handle).toBeVisible();
  await field.click();
  await field.pressSequentially("Post draft");
  await expect(field).toHaveValue("Post draft");
  await handle.focus();
  const start = (await field.boundingBox())!.height;
  await handle.press("ArrowDown");
  await expect.poll(async () => (await field.boundingBox())!.height).toBeCloseTo(start + 20, 1);
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 48, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await field.boundingBox())!.height).toBeCloseTo(start + 68, 1);
  await expect(field).toHaveValue("Post draft");
  await field.fill("Line\n".repeat(12));
  await expect.poll(async () => (await field.boundingBox())!.height).toBeGreaterThan(start + 68);
  await field.fill("");
  await expect.poll(async () => (await field.boundingBox())!.height).toBeCloseTo(start + 68, 1);
});

test("notification actor and event have independent links and type icons", async ({ page, browserName }) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  await page.route("**/api/notifications?**", (route) => route.fulfill({ json: { items: [{ id: "event", type: "comment", actor: { id: "author", username: "author", displayName: "Автор" }, postId: "fixture-0", read: false, createdAt }], nextCursor: null } }));
  await page.goto(`${origin}/notifications`);
  const row = page.locator(".notification").first();
  await expect(row.getByRole("link", { name: "Автор", exact: true })).toHaveAttribute("href", "/u/author");
  await expect(row.locator(".notification-target")).toHaveAttribute("href", "/posts/fixture-0");
  await expect(row.locator(".notification-type--comment")).toBeVisible();

  const viewport = page.viewportSize()!;
  if (viewport.width <= 1100) {
    await page.setViewportSize({ ...viewport, width: 320 });
    const nav = page.getByRole("navigation", { name: "Вкладки" });
    const notificationLink = nav.getByRole("link", { name: "Уведомления", exact: true });
    await expect(notificationLink).toHaveAttribute("href", "/notifications");
    const notificationLabel = notificationLink.locator(".tab-label");
    await expect(notificationLabel).toHaveCSS("font-size", browserName === "firefox" ? "9px" : "10px");
    if (browserName === "firefox") {
      expect(await notificationLabel.evaluate((element) => {
        const text = document.createRange();
        text.selectNodeContents(element);
        return text.getClientRects().length;
      })).toBe(1);
      const boxes = await Promise.all([
        nav.getByRole("link", { name: "Сообщения", exact: true }).boundingBox(),
        notificationLink.boundingBox(),
        nav.getByRole("button", { name: "Открыть меню" }).boundingBox(),
      ]);
      const [messages, notifications, menu] = boxes;
      expect(boxes.every((box) => box !== null)).toBe(true);
      expect(await nav.locator(".tab-label").evaluateAll((labels) => labels.map((label) => getComputedStyle(label).fontSize)))
        .toEqual(Array(5).fill("9px"));
      const center = (box: NonNullable<typeof messages>) => box.x + box.width / 2;
      expect(center(notifications!)).toBeCloseTo((center(messages!) + center(menu!)) / 2, 1);
      expect(notifications!.height).toBeCloseTo(messages!.height, 1);
      expect(notifications!.height).toBeCloseTo(menu!.height, 1);
    }
    await expect.poll(() => nav.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
    await nav.getByRole("button", { name: "Открыть меню" }).click();
    await expect(page.locator(".drawer").getByRole("link", { name: "Уведомления", exact: true })).toHaveAttribute("href", "/notifications");
  } else {
    await expect(page.getByLabel("Основная навигация").getByRole("link", { name: "Уведомления", exact: true })).toHaveAttribute("href", "/notifications");
  }

  await page.goto(`${origin}/settings?tab=notifications`);
  const settingsTab = page.getByRole("tab", { name: "Уведомления", exact: true });
  await expect(settingsTab).toHaveAttribute("aria-selected", "true");
  expect(await settingsTab.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
});

test("post action menu stays above the next card", async ({ page }) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  await page.goto(origin);
  const card = page.locator("article.feed-post").first();
  await card.evaluate((element) => { element.style.overflow = "hidden"; });
  await card.getByRole("button", { name: "Действия с записью" }).click();
  const item = page.getByRole("menuitem", { name: "Скрыть публикации пользователя" });
  await expect(item).toBeVisible();
  expect(await item.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return node.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
  })).toBe(true);
  await page.keyboard.press("Escape");
  await expect(item).toHaveCount(0);
  for (let i = 0; i < 12; i++) {
    await card.getByRole("button", { name: "Действия с записью" }).click();
    await card.locator(".post-body").click({ position: { x: 5, y: 5 } });
    await expect(item).toHaveCount(0);
  }
  await expect(card.getByRole("button", { name: "Действия с записью" })).toBeVisible();
});

test("feed navigation jumps to the top and refreshes only the first page", async ({ page }) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  const requests: string[] = [];
  await page.route("**/api/posts?*", (route) => {
    const params = new URL(route.request().url()).searchParams;
    const cursor = params.get("cursor");
    requests.push(`${params.get("feed")}:${cursor ?? "first"}`);
    return route.fulfill({ json: cursor
      ? { items: posts.slice(12, 24), nextCursor: null }
      : { items: posts.slice(0, 12), nextCursor: "next" } });
  });
  await page.goto(origin);
  const tab = page.getByRole("tab", { name: "Все записи" });
  const cards = page.locator("article.feed-post");
  await tab.click();
  await expect(cards).toHaveCount(12);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(cards).toHaveCount(24);

  const feedLink = page.getByRole("link", { name: "Лента", exact: true }).filter({ visible: true });
  const requestCount = requests.length;
  expect(await feedLink.evaluate((link: HTMLAnchorElement) => {
    if (window.scrollY < 100) throw new Error("Expected a scrolled feed");
    link.click();
    return window.scrollY;
  })).toBe(0);
  await expect.poll(() => requests.slice(requestCount)).toEqual(["all:first"]);
  await expect(cards).toHaveCount(12);
  await expect(tab).toHaveAttribute("aria-selected", "true");

  expect(await tab.evaluate((button: HTMLButtonElement) => {
    window.scrollTo(0, 600);
    button.click();
    return window.scrollY;
  })).toBe(0);
  await expect.poll(() => requests.slice(requestCount)).toEqual(["all:first", "all:first"]);
});

test("the Aero title bar stays stable while the feed scrolls", async ({ page, browserName }, info) => {
  test.skip(browserName !== "firefox" && info.project.use.hasTouch);
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  await page.goto(origin);
  await expect(page.locator("article.feed-post").first()).toBeVisible();
  const chrome = page.locator(".aero-window-chrome");
  await expect(chrome).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const bar = (await chrome.locator(":scope > .aero-titlebar").boundingBox())!;
  // Sample the same viewport pixels inside the glass, away from its borders and buttons.
  const clip = {
    x: Math.ceil(bar.x) + 4,
    y: Math.ceil(bar.y) + 4,
    width: Math.floor(bar.width) - 114,
    height: Math.floor(bar.height) - 8,
  };
  // Firefox can round a locator screenshot's crop differently when sticky.
  // Read the same coordinates from the full viewport instead.
  const sampleGlass = async () => page.evaluate(async ({ png, clip }) => {
    const bytes = Uint8Array.from(atob(png), (char) => char.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(clip.width, clip.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, -clip.x, -clip.y);
    bitmap.close();
    return Array.from(context.getImageData(0, 0, clip.width, clip.height).data);
  }, { png: (await page.screenshot({ scale: "css" })).toString("base64"), clip });
  const atTop = await sampleGlass();

  await page.mouse.move(200, 400);
  for (const delta of [2400, -950, 1800]) {
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, delta);
    await expect.poll(async () => Math.abs(await page.evaluate(() => window.scrollY) - before)).toBeGreaterThan(200);
    const scrolled = await sampleGlass();
    const changed = scrolled.filter((channel, index) => Math.abs(channel - atTop[index]!) > 12);
    expect(changed.length / atTop.length, `title bar after scrolling ${delta}px`).toBeLessThan(0.01);
  }
  await info.attach("scrolled-header", { body: await page.screenshot(), contentType: "image/png" });
});

for (const failure of ["offline", "rate-limited", "unavailable"] as const) {
  test(`recover the session after a temporary ${failure} response`, async ({ page }) => {
    const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
    const events: ClientNetworkEvent[] = [];
    const refreshes = await installFixtures(page, origin, failure, events);
    let navigations = 0;
    const refreshTimes: number[] = [];
    page.on("request", (req) => {
      if (req.isNavigationRequest() && req.frame() === page.mainFrame()) navigations++;
      if (req.url() === `${origin}/api/auth/refresh`) refreshTimes.push(Date.now());
    });
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    if (failure === "rate-limited") {
      await expect(page.getByRole("button", { name: "Повторить" })).toBeDisabled();
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      expect(refreshes()).toBe(1);
    }
    await expect(page.getByRole("tab", { name: "Все записи" })).toBeVisible();
    expect(refreshes()).toBe(2);
    expect(navigations).toBe(1);
    if (failure === "rate-limited") expect(refreshTimes[1]! - refreshTimes[0]!).toBeGreaterThanOrEqual(3000);
    const expected = failure === "offline" ? { kind: "network" }
      : failure === "unavailable" ? { kind: "http", status: 503 }
      : { kind: "http", status: 429, limiter: "refresh-account", retryAfter: 3, requestId: "54", cfRay: "0123456789abcdef-FRA" };
    await expect.poll(() => events.find(({ route }) => route === "/auth/refresh")).toMatchObject({ method: "POST", ...expected });
  });
}

for (const status of [401, 403] as const) {
  test(`terminal session ${status} does not retry`, async ({ page }) => {
    const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
    await installFixtures(page, origin);
    await page.clock.install();
    let requests = 0;
    await page.route("**/api/auth/refresh", (route) => {
      requests++;
      return route.fulfill({ status, json: status === 401 ? { error: "Session expired" }
        : { restriction: { kind: "account", reason: "Тестовое ограничение", until: null } } });
    });
    await page.goto(origin);
    await expect(page.getByRole("heading", { name: status === 401 ? "Твой уголок интернета" : "Аккаунт заблокирован" })).toBeVisible();
    if (status === 401) {
      await expect(page.getByText("Bubble — независимая социальная сеть.", { exact: true })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Войти", exact: true })).toBeVisible();
    }
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.clock.fastForward(30_000);
    expect(requests).toBe(1);
  });
}

test("a second tab honors the same session cooldown", async ({ page, context }) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin, "rate-limited");
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Повторить" })).toBeDisabled();
  const until = await page.evaluate(() => JSON.parse(localStorage.getItem("bubble-refresh-cooldown")!).until as number);
  const second = await context.newPage();
  await installFixtures(second, origin);
  const requests: number[] = [];
  second.on("request", (request) => {
    if (request.url() === `${origin}/api/auth/refresh`) requests.push(Date.now());
  });
  await second.goto(origin, { waitUntil: "domcontentloaded" });
  await expect(second.getByRole("tab", { name: "Все записи" })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toBeGreaterThanOrEqual(until);
});

const musicChunk = /\/assets\/MusicPage-[^/]+\.js$/;

test("ordinary API failure stays on the page without reloading", async ({ page }) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  let requests = 0, navigations = 0;
  await page.route((url) => url.pathname === "/api/music/picker", (route) => {
    requests++;
    return route.fulfill({ status: 503, json: {} });
  });
  page.on("request", (req) => { if (req.isNavigationRequest() && req.url() === `${origin}/music`) navigations++; });
  await page.goto(`${origin}/music`);
  await expect(page.getByRole("heading", { name: "Музыка", exact: true })).toBeVisible();
  await expect.poll(() => requests).toBe(2);
  await expect(page.getByRole("tabpanel", { name: "Моя библиотека" }).getByRole("alert"))
    .toHaveText("Не удалось выполнить запрос (код 503).");
  expect(navigations).toBe(1);
});

function fixtureWav() {
  // The real audio element plays a fixture signal with no network or media dependencies.
  const frameCount = 8000 * 30;
  const wav = Buffer.alloc(44 + frameCount, 128);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + frameCount, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28);
  wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write("data", 36); wav.writeUInt32LE(frameCount, 40);
  return wav;
}

test("music upload shows background MP3 processing until the library is refreshed", async ({ page }) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  const id = "0123456789abcdef01234567";
  await page.route("**/api/music/uploads/sign", route => route.fulfill({ json: { uploadId: id, url: origin + "/fixture-upload" } }));
  await page.route("**/fixture-upload", route => route.fulfill({ status: 200, body: "" }));
  await page.route("**/api/music/uploads/complete", route => {
    expect(route.request().postDataJSON().background).toBe(true);
    return route.fulfill({ status: 202, json: { processing: true } });
  });
  let published = false;
  await page.route("**/api/music/uploads/" + id, route => route.fulfill({ json: published ? { trackId: id } : { processing: true } }));
  await page.goto(origin + "/music");
  await page.getByRole("button", { name: "Загрузить музыку", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Аудиофайл").setInputFiles({ name: "Artist - Song.wav", mimeType: "audio/wav", buffer: fixtureWav() });
  await dialog.getByRole("button", { name: "Загрузить", exact: true }).click();
  await expect(page.getByText("Song — подготовка MP3…")).toBeVisible();
  await expect(dialog).toBeHidden();
  const refreshed = page.waitForRequest(request => published && new URL(request.url()).pathname === "/api/music/picker");
  published = true;
  await refreshed;
  await expect(page.getByText("Song — подготовка MP3…")).toHaveCount(0);
});

async function installMusicFixture(page: Page, origin: string) {
  const wav = fixtureWav();
  await page.route(/\/api\/music\/track-[012]\/play$/, (route) => route.fulfill({ json: { url: `${origin}/fixture.wav` } }));
  await page.route(/\/api\/music\/track-[012]\/library$/, (route) => route.fulfill({ json: { added: false } }));
  await page.route("**/fixture.wav", (route) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? "");
    const headers = { "Accept-Ranges": "bytes" };
    if (!range) return route.fulfill({ contentType: "audio/wav", headers, body: wav });
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
    if (start > end) return route.fulfill({ status: 416, headers: { ...headers, "Content-Range": `bytes */${wav.length}` } });
    return route.fulfill({
      status: 206,
      contentType: "audio/wav",
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${wav.length}` },
      body: wav.subarray(start, end + 1),
    });
  });
}

test("keep the accented mini-player attached to the mobile navigation", async ({ page }) => {
  const viewport = page.viewportSize()!;
  test.skip(viewport.width > 1100, "Mobile navigation only");
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  await installMusicFixture(page, origin);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: {
    accessToken: "fixture", user: { ...viewer, appearance: { accentColor: "#ff6868" } },
  } }));
  const conversation = { id: "thread", other: { ...posts[0]!.author, bio: "" }, lastMessage: null, lastMessageAt: createdAt, unread: 0, seenByOther: true };
  await page.route("**/api/messages", (route) => route.fulfill({ json: [conversation] }));
  await page.route("**/api/messages/thread", (route) => route.fulfill({ json: { conversation, items: [], nextCursor: null } }));
  await page.goto(origin);
  await page.locator("article.feed-post").first().getByRole("button", { name: /^Воспроизвести Тестовый трек/ }).click();
  const player = page.getByRole("region", { name: "Музыкальный плеер" });
  const nav = page.getByRole("navigation", { name: "Вкладки" });
  const expand = player.getByRole("button", { name: "Развернуть плеер" });
  const icon = player.getByRole("button", { name: "Добавить в библиотеку" });
  await expect(icon).toHaveCSS("color", "rgb(255, 104, 104)");
  await expect(expand).toHaveCSS("color", "rgb(255, 104, 104)");
  await page.locator(".aero-home").evaluate((home) => home.style.setProperty("--aero-player-icon", "#66d9cc"));
  await expect(expand).toHaveCSS("color", "rgb(102, 217, 204)");

  const expectAttached = async () => {
    await expect.poll(async () => {
      const [playerBox, navBox] = await Promise.all([player.boundingBox(), nav.boundingBox()]);
      if (!playerBox || !navBox) return null;
      return [Math.round(playerBox.height), Math.round(navBox.y - playerBox.y - playerBox.height), Math.round(navBox.y + navBox.height)];
    }).toEqual([43, 0, page.viewportSize()!.height]);
  };
  await expectAttached();
  const lastPost = page.locator("article.feed-post").last();
  await lastPost.scrollIntoViewIfNeeded();
  await expect.poll(() => lastPost.evaluate((post) => {
    // Bringing off-screen posts into view can update the document height.
    const root = document.scrollingElement!;
    window.scrollTo({ top: root.scrollHeight, behavior: "instant" });
    const dock = document.querySelector(".aero-bottom-dock")!;
    return post.getBoundingClientRect().bottom - dock.getBoundingClientRect().top;
  })).toBeLessThanOrEqual(1);
  await expectAttached();
  await page.setViewportSize({ ...viewport, height: viewport.height - 80 });
  await expectAttached();
  await expand.click();
  await expect(player.getByRole("slider", { name: "Позиция воспроизведения" })).toBeVisible();
  await player.getByRole("button", { name: "Показать очередь" }).click();
  await expect(player.locator(".music-player__queue")).toBeVisible();
  await player.getByRole("button", { name: "Свернуть плеер" }).click();
  await expectAttached();
  await page.goto(`${origin}/messages/thread`);
  await expect(page.locator(".chat-open")).toBeVisible();
  await expect(nav).toBeHidden();
  await expect.poll(async () => {
    const box = await player.boundingBox();
    return box ? Math.round(box.y + box.height) : null;
  }).toBe(page.viewportSize()!.height);
});

test("keep the Android Firefox navigation stationary while the app scrolls", async ({ page, browserName }) => {
  test.skip(browserName !== "firefox" || page.viewportSize()!.width > 1100, "Mobile Firefox only");
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  await installMusicFixture(page, origin);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (Android 15; Mobile; rv:149.0) Gecko/149.0 Firefox/149.0" });
  });
  await page.goto(origin);
  const nav = page.getByRole("navigation", { name: "Вкладки" });
  const player = page.getByRole("region", { name: "Музыкальный плеер" });
  const expectNavBottom = () => expect.poll(async () => {
    const box = await nav.boundingBox();
    return box ? Math.round(box.y + box.height) : null;
  }).toBe(page.viewportSize()!.height);
  const pane = page.locator(".aero-window");
  const scrollPane = (top: number) => pane.evaluate((element, top) => element.scrollTo({ top, behavior: "instant" }), top);
  const paneTop = () => pane.evaluate((element) => element.scrollTop);
  await expectNavBottom();
  await scrollPane(800);
  await expect.poll(paneTop).toBeGreaterThan(480);
  await expectNavBottom();
  await page.getByRole("button", { name: "Вернуться к началу" }).click();
  await expect.poll(paneTop).toBe(0);
  await page.locator("article.feed-post").first().getByRole("button", { name: /^Воспроизвести Тестовый трек/ }).click();
  await expect(player).toBeVisible();
  await scrollPane(1200);
  await expect.poll(paneTop).toBeGreaterThan(480);
  await expectNavBottom();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect.poll(async () => {
    const [playerBox, navBox] = await Promise.all([player.boundingBox(), nav.boundingBox()]);
    return playerBox && navBox ? Math.round(navBox.y - playerBox.y - playerBox.height) : null;
  }).toBe(0);
  await nav.getByRole("link", { name: "Лента" }).click();
  await expect.poll(paneTop).toBe(0);
});

test("a failed route preserves the global player until an explicit reload", async ({ page }) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  await installMusicFixture(page, origin);
  await page.route(musicChunk, (route) => route.fulfill({ status: 404 }));
  await page.goto(origin);
  await page.locator("article.feed-post").first().getByRole("button", { name: /^Воспроизвести Тестовый трек/ }).click();
  const player = page.getByRole("region", { name: "Музыкальный плеер" });
  await expect(player.getByRole("button", { name: "Пауза", exact: true })).toBeVisible();
  // Navigate through the router on mobile too, where the link is inside the menu.
  if (!await page.getByRole("link", { name: "Музыка", exact: true }).first().isVisible()) {
    await page.getByRole("button", { name: "Открыть меню", exact: true }).filter({ visible: true }).first().click();
  }
  await page.getByRole("link", { name: "Музыка", exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByText("После обновления страницы плеер восстановит очередь.")).toBeVisible();
  await expect(player.getByRole("button", { name: "Пауза", exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("bubble_chunk_reloaded_at"))).toBeNull();
  await Promise.all([
    page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame()),
    page.getByRole("button", { name: "Обновить страницу" }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "Страница не загрузилась" })).toBeVisible();
  await expect(player.getByText("Исполнитель — Тестовый трек", { exact: true }).filter({ visible: true })).toBeVisible();
});

test("the player restores the queue and position after reload", async ({ page }) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  await installMusicFixture(page, origin);
  await page.addInitScript(() => {
    // Block only the first automatic play attempt in the restored document.
    if (sessionStorage.getItem("test-block-autoplay") !== "1") return;
    sessionStorage.removeItem("test-block-autoplay");
    const play = HTMLMediaElement.prototype.play;
    let firstAttempt = true;
    HTMLMediaElement.prototype.play = function () {
      if (!firstAttempt) return play.call(this);
      firstAttempt = false;
      return Promise.reject(new DOMException("Autoplay blocked", "NotAllowedError"));
    };
  });
  const attachments = posts.slice(0, 3).map((post, index) => ({
    ...post.musicAttachments[0]!, title: `Трек ${index + 1}`, duration: 30,
  }));
  await page.route("**/api/posts?*", (route) => route.fulfill({
    json: { items: [{ ...posts[0], musicAttachments: attachments }], nextCursor: null },
  }));
  await page.goto(origin);
  await page.getByRole("button", { name: "Воспроизвести Трек 2", exact: true }).click();
  const player = page.getByRole("region", { name: "Музыкальный плеер" });
  const pause = player.getByRole("button", { name: "Пауза", exact: true });
  const play = player.getByRole("button", { name: "Воспроизвести", exact: true });
  const position = player.getByRole("slider", { name: "Позиция воспроизведения" });
  const expand = player.getByRole("button", { name: "Развернуть плеер", exact: true });
  const thirdTrackTitle = player.getByText("Исполнитель — Трек 3", { exact: true }).filter({ visible: true });
  await expect(pause).toBeVisible();
  if (await expand.isVisible()) await expand.click();
  await expect.poll(() => position.inputValue().then(Number)).toBeGreaterThan(3);
  await player.getByRole("button", { name: "Перемешивание" }).click();
  await player.getByRole("button", { name: "Повтор выключен" }).click();
  await page.evaluate(() => sessionStorage.setItem("test-block-autoplay", "1"));
  const savedPosition = Number(await position.inputValue());

  const newUrl = page.waitForResponse("**/api/music/track-1/play");
  await page.reload();
  await newUrl;
  await expect(play).toBeEnabled();
  if (await expand.isVisible()) await expand.click();
  await expect(player.getByRole("alert")).toHaveCount(0);
  await expect.poll(async () => Math.abs(Number(await position.inputValue()) - savedPosition)).toBeLessThan(1);
  await expect(player.getByRole("button", { name: "Повтор всего списка" })).toBeVisible();
  await expect(player.getByRole("button", { name: "Перемешивание" })).toHaveAttribute("aria-pressed", "true");
  await player.getByRole("button", { name: "Показать очередь" }).click();
  const titles = player.locator(".music-player__queue-title");
  await expect(titles).toHaveCount(3);
  await expect(titles.first()).toHaveText("Исполнитель — Трек 2");
  await player.getByRole("button", { name: "Перемешивание" }).click();
  await expect(titles).toHaveText(["Исполнитель — Трек 1", "Исполнитель — Трек 2", "Исполнитель — Трек 3"]);
  await play.click();
  await expect(pause).toBeVisible();
  await player.getByRole("button", { name: "Следующий трек" }).click();
  await expect(player.locator(".music-player__title")).toHaveText("Исполнитель — Трек 3");
  await expect(pause).toBeVisible();
  await pause.click();
  await page.reload();
  await expect(thirdTrackTitle).toBeVisible();
  await expect(play).toBeEnabled();
  await player.getByRole("button", { name: "Закрыть плеер" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Воспроизвести Трек 2", exact: true })).toBeVisible();
  await expect(player).toHaveCount(0);
});

for (const persistent of [false, true]) {
  test(`missing module ${persistent ? "shows the recovery screen" : "recovers"} after one reload`, async ({ page }) => {
    const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
    await installFixtures(page, origin);
    let navigations = 0, attempts = 0;
    const errors: Array<{ category?: string; path?: string }> = [];
    page.on("request", (req) => {
      if (req.isNavigationRequest() && req.url() === `${origin}/music`) navigations++;
      if (req.url() === `${origin}/api/client-errors`) errors.push(req.postDataJSON());
    });
    await page.route(musicChunk, (route) => {
      attempts++;
      return persistent || attempts === 1 ? route.fulfill({ status: 404 }) : route.continue();
    });
    await page.goto(`${origin}/music`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => [attempts, navigations]).toEqual([2, 2]);
    await expect(page.getByRole("heading", { name: persistent ? "Страница не загрузилась" : "Музыка", exact: true })).toBeVisible();
    await expect.poll(() => errors).toContainEqual(expect.objectContaining({ category: "chunk", path: "/music" }));
    expect(attempts).toBe(2);
    expect(navigations).toBe(2);
    if (persistent) {
      await expect(page.getByRole("button", { name: "Обновить страницу" })).toBeVisible();
      await page.locator('[role="alert"]').getByRole("link", { name: "На главную" }).click();
      await expect(page.getByRole("tab", { name: "Все записи" })).toBeVisible();
      expect(navigations).toBe(2);
    }
  });
}

test.describe("installed service worker", () => {
  test.use({ serviceWorkers: "allow" });

  test("controls the page, passes Socket.IO through and serves the offline shell", async ({ page, context }) => {
    const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
    await installFixtures(page, origin);
    await page.goto(origin);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    const [authorized] = await Promise.all([
      page.waitForEvent("websocket", (candidate) => candidate.url().includes("transport=websocket"))
        .then((websocket) => websocket.waitForEvent("framereceived", (frame) => String(frame.payload).startsWith("40{"))),
      page.reload(),
    ]);
    expect(String(authorized.payload)).toMatch(/^40\{/);
    const resources = await page.evaluate(async () => {
      const socketResponse = await fetch("/socket.io/?EIO=4&transport=polling");
      const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!;
      const manifestData = await fetch(manifest.href).then((response) => response.json());
      const cacheNames = await caches.keys();
      const keys = (await Promise.all(cacheNames.map(async (name) => (await caches.open(name)).keys()))).flat();
      return {
        handshake: (await socketResponse.text()).startsWith("0{"),
        hasManifest: typeof manifestData.name === "string" && Array.isArray(manifestData.icons),
        hasOffline: Boolean(await caches.match("/offline.html")),
        cachedSocket: keys.some((request) => new URL(request.url).pathname.startsWith("/socket.io/")),
      };
    });
    expect(resources).toEqual({ handshake: true, hasManifest: true, hasOffline: true, cachedSocket: false });

    // A different script URL acts as a newer build under the same registration scope.
    await page.evaluate(() => navigator.serviceWorker.register("/sw.js?fixture-update=1").then(() => true));
    const update = page.getByRole("region", { name: "Состояние приложения" });
    await expect(update.getByText("Доступна новая версия Bubble.")).toBeVisible();
    const controllerChanged = page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame());
    await update.getByRole("button", { name: "Обновить", exact: true }).click();
    await controllerChanged;
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toContain("fixture-update=1");

    await context.setOffline(true);
    const offline = await page.goto(`${origin}/explore`, { waitUntil: "domcontentloaded" });
    expect(offline?.fromServiceWorker()).toBe(true);
    expect(offline?.ok()).toBe(true);
  });
});

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

test("download feedback from the selected group and show its last exported period", async ({ page }) => {
  const origin = process.env.BUBBLE_CHECK_PREVIEW_URL!;
  await installFixtures(page, origin);
  const period = { from: "2026-11-20", to: "2026-11-22" };
  const record = { ...period, exportedAt: createdAt };
  const posts = [{ id: "post", content: "Отзыв", comments: [{ content: "Ответ" }] }];
  const groups = [
    { id: "feedback-id", name: "Жалобы и предложения Bubble", slug: "feedback" },
    { id: "other-id", name: "Другая" + "Ш".repeat(42), slug: "other" },
  ];
  let exported = false;
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ json: { accessToken: "fixture", user: { ...viewer, role: "admin" } } }));
  await page.route("**/api/admin/feedback-export/groups", (route) => route.fulfill({ json: groups }));
  await page.route("**/api/admin/feedback-export/feedback-id", (route) => route.fulfill({
    body: "null", contentType: "application/json",
  }));
  await page.route("**/api/admin/feedback-export/other-id", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ body: JSON.stringify(exported ? record : null), contentType: "application/json" });
    expect(route.request().postDataJSON()).toEqual(period);
    exported = true;
    return route.fulfill({ json: { ...record, community: groups[1], posts } });
  });
  await page.goto(`${origin}/admin/errors?tab=feedback`);
  await expect(page.getByText("Выгрузок пока нет.")).toBeVisible();
  const group = page.getByRole("combobox", { name: "Группа", exact: true });
  await expect(group).toHaveValue("feedback-id");
  await page.getByLabel("Поиск группы").fill("Другая");
  await group.selectOption("other-id");
  expect(await group.evaluate((element) => {
    const toolbar = element.closest(".admin-monitor-toolbar")!.getBoundingClientRect();
    return element.getBoundingClientRect().right <= toolbar.right;
  })).toBe(true);
  await page.reload();
  await expect(group).toHaveValue("other-id");
  await page.getByLabel("С даты (UTC)").fill(period.from);
  await page.getByLabel("По дату включительно (UTC)").fill(period.to);
  const ready = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать JSON" }).click();
  const file = await ready;
  expect(file.suggestedFilename()).toBe("bubble-other-2026-11-20-2026-11-22.json");
  expect(JSON.parse(await readFile(await file.path(), "utf8")).posts).toEqual(posts);
  await expect(page.getByText(/Последняя выгрузка за 20\.11\.2026 — 22\.11\.2026/)).toBeVisible();
  await group.selectOption("feedback-id");
  await expect(page.getByText("Выгрузок пока нет.")).toBeVisible();
});
