import {
  cfRayPattern,
  requestIdPattern,
  telemetryLimiters,
  telemetryMethods,
  telemetryRoute,
  type ClientNetworkEvent,
} from "@commune/shared";

const MAX_QUEUE = 30;
const DEDUP_MS = 5000;
const queued: ClientNetworkEvent[] = [];
const recent = new Map<string, number>();
let apiBase: string | undefined;
let timer: number | undefined;
let sending = false;

function schedule(delay: number) {
  if (navigator.onLine === false || !queued.length || timer !== undefined || sending) return;
  timer = window.setTimeout(() => {
    timer = undefined;
    void flush();
  }, delay);
}

async function flush() {
  if (sending || navigator.onLine === false || !queued.length || !apiBase) return;
  sending = true;
  const batch = queued.splice(0, 10);
  let delay = 1500;
  try {
    const response = await fetch(`${apiBase}/client-network`, {
      method: "POST",
      credentials: "omit",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: batch }),
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 429 || response.status >= 500) {
      delay = Math.max(15_000, (retrySeconds(response) ?? 0) * 1000);
      queued.unshift(...batch);
    }
  } catch {
    delay = 15_000;
    queued.unshift(...batch);
  } finally {
    queued.splice(0, Math.max(0, queued.length - MAX_QUEUE));
    sending = false;
    schedule(delay);
  }
}

function enqueue(base: string, event: Omit<ClientNetworkEvent, "at">) {
  if (!import.meta.env.PROD) return;
  const now = Date.now();
  const key = JSON.stringify([event.method, event.route, event.kind, event.status, event.limiter]);
  if (now - (recent.get(key) ?? 0) < DEDUP_MS) return;
  for (const [previous, at] of recent) if (at < now - DEDUP_MS) recent.delete(previous);
  recent.set(key, now);
  apiBase = base;
  if (queued.length >= MAX_QUEUE) queued.shift();
  queued.push({ ...event, at: now });
  schedule(1500);
}

export function retrySeconds(response: Response, maxSeconds = 86_400) {
  const header = response.headers.get("Retry-After");
  if (!header) return undefined;
  const seconds = /^\d+$/.test(header)
    ? Number(header)
    : Math.ceil((Date.parse(header) - Date.now()) / 1000);
  return Number.isFinite(seconds) ? Math.min(Math.max(0, seconds), maxSeconds) : undefined;
}

export async function observeFetch(
  base: string,
  path: string,
  options: RequestInit,
  early?: Promise<Response>,
) {
  const report = (details: Omit<ClientNetworkEvent, "at" | "route" | "method">) => {
    const route = telemetryRoute(path);
    if (/^\/(?:client-network|client-errors|admin\/(?:telemetry|errors))(?:\/|$)/.test(route))
      return;
    const method = telemetryMethods.find((value) => value === (options.method ?? "GET")) ?? "OTHER";
    enqueue(base, { route, method, ...details });
  };
  try {
    const response = await (early ?? fetch(`${base}${path}`, options));
    if (response.status === 429 || response.status >= 500) {
      const id = response.headers.get("X-Request-Id") ?? "";
      const ray = response.headers.get("CF-Ray") ?? "";
      const limiter = telemetryLimiters.find(
        (value) => response.headers.get("X-RateLimit-Limiter") === value,
      );
      report({
        kind: "http",
        status: response.status,
        limiter,
        retryAfter: retrySeconds(response),
        requestId: requestIdPattern.test(id) ? id : undefined,
        cfRay: cfRayPattern.test(ray) ? ray : undefined,
      });
    }
    return response;
  } catch (error) {
    const timeout = [options.signal?.reason, error].some(
      (reason) => reason instanceof Error && reason.name === "TimeoutError",
    );
    if (
      timeout ||
      (!options.signal?.aborted && !(error instanceof Error && error.name === "AbortError"))
    ) {
      report({ kind: timeout ? "timeout" : navigator.onLine === false ? "offline" : "network" });
    }
    throw error;
  }
}

export function reportSocketIssue(
  base: string,
  kind: Extract<ClientNetworkEvent["kind"], `socket-${string}`>,
) {
  enqueue(base, { method: "OTHER", route: "/socket.io", kind });
}

window.addEventListener("online", () => schedule(0));
