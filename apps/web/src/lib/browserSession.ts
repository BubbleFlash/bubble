type SessionState = "active" | "guest";
type SessionChange = { id: string; state: SessionState; at: number };

const KEY = "bubble-session-change";
const listeners = new Set<(change: SessionChange) => void>();
let latest: SessionChange | undefined;
let channel: BroadcastChannel | undefined;

function parse(value: unknown): SessionChange | undefined {
  if (typeof value !== "object" || !value) return undefined;
  const change = value as Partial<SessionChange>;
  if (typeof change.id !== "string" || typeof change.at !== "number") return undefined;
  if (change.state !== "active" && change.state !== "guest") return undefined;
  return { id: change.id, at: change.at, state: change.state };
}

function readChange() {
  try {
    return parse(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return undefined;
  }
}

export function sessionGeneration() {
  return (readChange() ?? latest)?.id ?? "initial";
}

function receive(change: SessionChange | undefined) {
  if (!change || change.id === latest?.id) return;
  const persisted = readChange();
  if (persisted && persisted.id !== change.id) return;
  if (!persisted && latest && change.at < latest.at) return;
  latest = change;
  for (const listener of listeners) listener(change);
}

function onStorage(event: StorageEvent) {
  if (event.key === KEY) receive(readChange());
}

export function subscribeSessionChanges(listener: (change: SessionChange) => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    latest = readChange() ?? latest;
    window.addEventListener("storage", onStorage);
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(KEY);
      channel.onmessage = ({ data }) => receive(parse(data));
    }
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.removeEventListener("storage", onStorage);
      channel?.close();
      channel = undefined;
    }
  };
}

export function announceSessionChange(state: SessionState) {
  const change = {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    state,
    at: Date.now(),
  };
  latest = change;
  try {
    localStorage.setItem(KEY, JSON.stringify(change));
  } catch {
    // The live channel can still notify peers when storage is disabled.
  }
  channel?.postMessage(change);
}

export async function withSessionCookie<T>(action: () => Promise<T>): Promise<T> {
  const locks = navigator.locks;
  return locks ? locks.request(KEY, { signal: AbortSignal.timeout(15_000) }, action) : action();
}

export class SessionChanged extends Error {
  constructor() {
    super("Сеанс изменился. Повторите действие.");
  }
}

export function assertSessionGeneration(generation: string) {
  if (sessionGeneration() !== generation) throw new SessionChanged();
}
