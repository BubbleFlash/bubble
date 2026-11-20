import type { AuthResponse } from "@commune/shared";
import { assertSessionGeneration, SessionChanged, sessionGeneration, withSessionCookie } from "./browserSession";
import { observeFetch, retrySeconds } from "./networkTelemetry";

// Production builds always call the same origin ("/api"), which Vercel forwards to the API
// (see apps/web/vercel.json). That keeps the login cookie first-party. VITE_API_URL is only
// used in development, so a stray value in the hosting dashboard can't break a deployed site.
const BASE = import.meta.env.PROD
  ? "/api"
  : (import.meta.env.VITE_API_URL ?? "http://localhost:4000/api");
// Uploaded files are served from the API origin, e.g. http://localhost:4000/uploads/abc.png.
// With a relative VITE_API_URL such as "/api" this is "", so "/uploads/..." stays relative.
const ORIGIN = BASE.replace(/\/api\/?$/, "");

let accessToken: { value: string; generation: string } | null = null;
let refreshing: { generation: string; promise: Promise<AuthResponse | null> } | null = null;

export function getAccessToken(): string | null {
  return accessToken?.generation === sessionGeneration() ? accessToken.value : null;
}

export function setAccessToken(token: string | null) {
  accessToken = token ? { value: token, generation: sessionGeneration() } : null;
}

// ---- Session hint: lets the app skip, or start earlier, the "am I logged in?" round trip ----
// "1" = this browser has a session, "guest" = confirmed guest, unknown = ask the server once.
// The hint is never trusted for access; the server still checks every request.
const HINT_KEY = "commune_session";
export type SessionHint = "1" | "guest" | null;

export function readSessionHint(): SessionHint {
  try {
    const v = localStorage.getItem(HINT_KEY);
    // Older clients also wrote "0" on network errors. Recheck those browsers once.
    return v === "guest" || v === "1" ? v : null;
  } catch {
    return null;
  }
}

export function writeSessionHint(hint: Exclude<SessionHint, null>) {
  try {
    localStorage.setItem(HINT_KEY, hint);
  } catch {
    /* private mode or blocked storage: the app just works without the shortcut */
  }
}

// Take over public requests started by index.html before the application bundle loaded.
type EarlyMap = Record<string, Promise<Response> | undefined>;
function takeEarly(path: string): Promise<Response> | undefined {
  const map = (window as unknown as { __early?: EarlyMap }).__early;
  const hit = map?.[path];
  if (map) delete map[path];
  return hit;
}

export type Restriction = { kind: "account" | "publishing"; reason: string; until: string | null };
export const restrictionText = ({ reason, until }: Restriction) => reason + (until ? " · до " + new Date(until).toLocaleString("ru-RU") : " · бессрочно");

export class SessionRestoreError extends Error {
  constructor(public readonly retryAt?: number) {
    super(retryAt
      ? `Сервер попросил сделать паузу. Повторите через ${Math.max(1, Math.ceil((retryAt - Date.now()) / 1000))} с.`
      : "Не удалось проверить сеанс. Проверьте соединение и попробуйте ещё раз.");
  }
}

const REFRESH_COOLDOWN_KEY = "bubble-refresh-cooldown";
let refreshCooldown: { generation: string; until: number } | undefined;

function refreshRetryAt(generation: string) {
  let until = refreshCooldown?.generation === generation ? refreshCooldown.until : 0;
  try {
    const stored = JSON.parse(localStorage.getItem(REFRESH_COOLDOWN_KEY) ?? "null");
    if (stored?.generation === generation && Number.isFinite(stored.until)) until = Math.max(until, stored.until);
  } catch { /* Recovery can still use the tab's cooldown. */ }
  return until;
}

async function refreshSession(): Promise<AuthResponse | null> {
  const generation = sessionGeneration();
  if (refreshing?.generation === generation) return refreshing.promise;
  const promise = withSessionCookie(async () => {
      assertSessionGeneration(generation);
      const retryAt = refreshRetryAt(generation);
      if (retryAt > Date.now()) throw new SessionRestoreError(retryAt);
      const request = () => {
        assertSessionGeneration(generation);
        return observeFetch(BASE, "/auth/refresh", {
          method: "POST", credentials: "include", signal: AbortSignal.timeout(10_000),
        });
      };
      let res = await request();
      if (res.status === 401 && !navigator.locks && readSessionHint() === "1") {
        // A browser without locks can receive a stale-cookie response while a peer rotates it.
        for (const delay of [120, 400]) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, delay));
          res = await request();
          if (res.status !== 401) break;
        }
      }
      assertSessionGeneration(generation);
      if (res.status === 401 || res.status === 403) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; restriction?: Restriction };
        assertSessionGeneration(generation);
        if (res.status === 401 && (body.error === "No session" || body.error === "Session expired")) return null;
        if (body.restriction) throw new ApiError(403, restrictionText(body.restriction), undefined, body.restriction);
      }
      if (!res.ok) {
        const seconds = retrySeconds(res);
        if (res.status !== 429 && !seconds) throw new SessionRestoreError();
        const until = Date.now() + Math.max(1, seconds ?? 15) * 1000;
        refreshCooldown = { generation, until };
        try { localStorage.setItem(REFRESH_COOLDOWN_KEY, JSON.stringify(refreshCooldown)); } catch { /* Storage is optional. */ }
        throw new SessionRestoreError(until);
      }
      const data = (await res.json()) as AuthResponse;
      assertSessionGeneration(generation);
      setAccessToken(data.accessToken);
      return data;
    })
    .catch((error: unknown) => {
      if (error instanceof SessionChanged || error instanceof SessionRestoreError || error instanceof ApiError) throw error;
      throw new SessionRestoreError();
    })
    .finally(() => {
      if (refreshing?.promise === promise) refreshing = null;
    });
  refreshing = { generation, promise };
  return promise;
}

async function refresh(): Promise<boolean> {
  if (accessToken && accessToken.generation !== sessionGeneration()) return false;
  return (await refreshSession().catch(() => null)) !== null;
}

// Starts at page load (not after React renders) unless this browser is a known guest.
const boot = readSessionHint() === "guest" ? Promise.resolve(null) : refreshSession();
// The eager request can fail before React mounts. AuthProvider handles its original rejection.
void boot.catch(() => undefined);
export const bootSession = (retry = false) => retry ? refreshSession() : boot;

/** Turns a stored upload path like "/uploads/x.png" into a URL the browser can load. */
export function assetUrl(path: string | null | undefined): string | undefined {
  return path ? `${ORIGIN}${path}` : undefined;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public readonly serverMessage?: string,
    public readonly restriction?: Restriction,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal; keepalive?: boolean } = {},
  retry = true,
): Promise<T> {
  const generation = sessionGeneration();
  if (accessToken && accessToken.generation !== generation) throw new SessionChanged();
  const isForm = options.body instanceof FormData;
  // Requests that need a login wait for the session restore that is already in flight, instead
  // of going out without a token, failing with 401 and being repeated.
  if (refreshing?.generation === generation && !getAccessToken() && !path.startsWith("/auth/")) await refreshing.promise;
  assertSessionGeneration(generation);
  const token = getAccessToken();

  const send = () =>
    observeFetch(BASE, path, {
      method: options.method ?? "GET",
      signal: options.signal,
      keepalive: options.keepalive,
      credentials: "include",
      headers: {
        // For FormData the browser sets the multipart Content-Type (with boundary) itself.
        ...(options.body && !isForm ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body
        ? isForm
          ? (options.body as FormData)
          : JSON.stringify(options.body)
        : undefined,
    }).catch((error: unknown) => {
      throw new Error("Не удалось подключиться к серверу. Проверьте соединение.", { cause: error });
    });

  // A plain GET may already have been started by index.html; use that response if it worked.
  const early = !options.method && !options.body && retry ? takeEarly(path) : undefined;
  const earlyRes = early ? await observeFetch(BASE, path, {}, early).catch(() => undefined) : undefined;
  const res = earlyRes?.ok ? earlyRes : await send();
  assertSessionGeneration(generation);

  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    const currentToken = getAccessToken();
    const refreshed = Boolean(currentToken && currentToken !== token) || (await refreshSession()) !== null;
    assertSessionGeneration(generation);
    if (refreshed) return api<T>(path, options, false);
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; restriction?: Restriction };
    assertSessionGeneration(generation);
    // Hosting platforms answer some failures (too large, overloaded) with a plain page, not our JSON.
    const fallback =
      res.status === 413
        ? "That file is too large."
        : res.status === 429
          ? "Too many requests, wait a moment and try again."
          : res.status >= 500
            ? "The server had a problem. Try again in a moment."
            : "Something went wrong";
    const known: Record<string, string> = {
      "Invalid input": "Проверьте введённые данные.",
      "Invalid email or password": "Неверный адрес почты или пароль.",
      "Current password is incorrect": "Текущий пароль указан неверно.",
      "Email delivery is unavailable": "Отправка писем сейчас недоступна. Попробуйте позже.",
      "This link is invalid or has expired": "Ссылка недействительна или срок её действия истёк.",
      "The new email is the same as the current one": "Укажите адрес, отличный от текущего.",
      "Cancel your renewing subscription before deleting your account": "Отмените продление подписки в разделе Plus, затем повторите удаление.",
      "Email or username is already taken": "Этот адрес почты или имя пользователя уже заняты.",
      "This account has been suspended": "Этот аккаунт заблокирован.",
      "No session": "Войдите в аккаунт.",
      "Session expired": "Срок сеанса истёк. Войдите снова.",
      "Wallpaper name is required": "Введите название фона.",
      "Wallpaper name is too long": "Название фона слишком длинное.",
      "Display name is required": "Введите отображаемый ник.",
      "Display name is too long": "Отображаемый ник слишком длинный.",
      "Invalid display name": "В нике есть недопустимые символы.",
      "Invalid font file": "Не удалось прочитать файл шрифта.",
      "Font must be 2 MB or smaller": "Размер шрифта не должен превышать 2 МБ.",
      "Wallpaper not found": "Фон не найден.",
      "You already reported this wallpaper": "Вы уже отправили жалобу на этот фон.",
      "Only PNG, JPEG, GIF and WebP images are allowed": "Выберите изображение PNG, JPEG, GIF или WebP.",
      "Post not found": "Запись не найдена.",
      "Comment not found": "Комментарий не найден.",
      "You can't message this account": "В этот аккаунт нельзя отправить сообщение.",
      "Community not found": "Группа не найдена.",
      "Insufficient community permissions": "У вас недостаточно прав в этой группе.",
      "Community settings changed. Try again.": "Настройки группы изменились. Попробуйте ещё раз.",
      "You cannot edit this community's appearance": "У вашей роли нет доступа к оформлению группы.",
      "You cannot publish in this community": "У вашей роли нет права публиковать записи в этой группе.",
      "You cannot edit this community post": "У вашей роли нет права редактировать эту запись.",
      "You cannot delete this community post": "У вашей роли нет права удалять эту запись.",
      "The community owner cannot be removed": "Владелец может выйти только после передачи владения.",
      "Only the owner can remove a community manager": "Исключать управляющих может только владелец.",
      "Choose another member of the community": "Выберите другого участника группы.",
      "Community member not found": "Участник больше не состоит в группе.",
      "Enter the community address to confirm": "Введите адрес группы для подтверждения.",
      "Choose an active community member": "Выберите действующего участника группы.",
      "Write something or attach a file": "Напишите текст или добавьте вложение.",
      "This post changed. Refresh and try again.": "Запись изменилась. Обновите страницу и попробуйте ещё раз.",
      "Join this community to post in it": "Вступите в группу, чтобы публиковать записи.",
      "You can only delete your own posts": "Вы можете удалять только свои записи.",
      "Not found": "Запрошенные данные не найдены.",
      "Invalid JSON": "Не удалось обработать запрос.",
      "Invalid request": "Не удалось обработать запрос.",
      "Invalid or expired access token": "Срок сеанса истёк. Войдите снова.",
      "Image must be 4 MB or smaller": "Размер изображения не должен превышать 4 МБ.",
      "Too many requests, slow down.": "Слишком много запросов. Попробуйте позже.",
      "Too many attempts, try again later.": "Слишком много попыток. Попробуйте позже.",
    };
    const safe = (data.error && known[data.error]) ||
      (res.status === 413 ? "Файл слишком большой." : res.status === 429 ? "Слишком много запросов. Попробуйте позже." : `Не удалось выполнить запрос (код ${res.status}).`);
    if (data.restriction?.kind === "account" && !path.startsWith("/auth/")) {
      window.dispatchEvent(new CustomEvent("account-restricted", { detail: data.restriction }));
    }
    const wait = res.status === 429 ? retrySeconds(res) : undefined;
    throw new ApiError(res.status, data.restriction ? restrictionText(data.restriction) : wait
      ? `Слишком много запросов. Повторите через ${wait} с.` : safe, data.error ?? fallback, data.restriction);
  }
  const result = res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  assertSessionGeneration(generation);
  return result;
}

/** Builds "/path?a=1&b=2", skipping undefined or empty values. */
export function withQuery(path: string, params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

export { refresh as tryRefresh };
export { BASE as API_BASE };
