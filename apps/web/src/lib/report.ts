import { API_BASE } from "./api";
import { telemetryPage } from "@commune/shared";

/**
 * Sends unexpected browser errors to the API so the owner can see them in the Admin page.
 * It sends the message, a short stack and the page path (no query string, no user data), only
 * in production, at most a few per visit, and never throws.
 */
const MAX_PER_VISIT = 5;
const sent = new Set<string>();

// Errors that come from the visitor's network, browser or extensions, not from our code.
const IGNORED = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Failed to fetch/i,
  /Load failed/i,
  /NetworkError/i,
  /AbortError/i,
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
];

export function isChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|failed to load module script|unable to preload css|loading chunk .+ failed/i.test(message);
}

export function reportError(source: "window" | "promise" | "react", error: unknown): void {
  if (!import.meta.env.PROD) return;
  try {
    const err =
      error instanceof Error
        ? error
        : new Error(typeof error === "string" ? error : "Unknown error");
    const chunk = isChunkError(err);
    const category = chunk ? "chunk" : source === "react" ? "render" : undefined;
    const message = chunk ? "Не удалось загрузить модуль страницы" : (err.message || err.name || "Unknown error").slice(0, 300);
    const stack = chunk ? undefined : (err.stack ?? "").slice(0, 2000);
    if (!chunk && IGNORED.some((re) => re.test(message) || re.test(stack ?? ""))) return;
    const path = telemetryPage(window.location.pathname);
    const key = `${path} ${message}`;
    if (sent.size >= MAX_PER_VISIT || sent.has(key)) return;
    sent.add(key);
    void fetch(`${API_BASE}/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        stack,
        source,
        path,
        category,
      }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* reporting must never cause another error */
  }
}

/** Call once at startup. */
export function installErrorReporting(): void {
  window.addEventListener("error", (e) => reportError("window", e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => reportError("promise", e.reason));
}
