import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { assertSessionGeneration, sessionGeneration } from "./browserSession";

const CHANNEL = "bubble-account-queries-v1";
const keys = new Set([
  JSON.stringify(["feed", "following"]),
  JSON.stringify(["feed", "all"]),
  JSON.stringify(["unread-count"]),
  JSON.stringify(["unread-messages"]),
]);

type Snapshot = { at: number; value: unknown };
type Message =
  | { scope: string; key: string; kind: "request" }
  | { scope: string; key: string; kind: "result"; snapshot: Snapshot }
  | { scope: string; key: string; kind: "invalidate"; at: number };
type Bridge = {
  scope: string;
  generation: string;
  channel: BroadcastChannel;
  cache: Map<string, Snapshot>;
  usedAt: Map<string, number>;
  invalidatedAt: Map<string, number>;
  unsubscribe: () => void;
};
let bridge: Bridge | undefined;

export function closeTabQueries() {
  bridge?.channel.close();
  bridge?.unsubscribe();
  bridge = undefined;
}

export function startTabQueries(qc: QueryClient, accountId: string) {
  const generation = sessionGeneration();
  const scope = JSON.stringify([accountId, generation]);
  if (bridge?.scope === scope) return;
  closeTabQueries();
  if (typeof BroadcastChannel === "undefined") return;
  const cache = new Map<string, Snapshot>();
  const usedAt = new Map<string, number>();
  const invalidatedAt = new Map<string, number>();
  const channel = new BroadcastChannel(CHANNEL);
  let receivingInvalidation = false;
  const unsubscribe = qc.getQueryCache().subscribe((event) => {
    if (receivingInvalidation || event.type !== "updated" || event.action.type !== "invalidate")
      return;
    const key = JSON.stringify(event.query.queryKey);
    if (event.query.queryKey[0] !== "feed" || !keys.has(key) || sessionGeneration() !== generation)
      return;
    const at = Date.now();
    invalidatedAt.set(key, at);
    cache.delete(key);
    channel.postMessage({ scope, key, kind: "invalidate", at } satisfies Message);
  });
  bridge = { channel, scope, generation, cache, usedAt, invalidatedAt, unsubscribe };
  channel.onmessage = ({ data }: MessageEvent<Message>) => {
    if (bridge?.channel !== channel || sessionGeneration() !== generation) return;
    if (!data || data.scope !== scope || !keys.has(data.key)) return;
    if (data.kind === "request") {
      const snapshot = cache.get(data.key);
      if (snapshot && Date.now() - snapshot.at < 30_000) {
        channel.postMessage({ scope, key: data.key, kind: "result", snapshot } satisfies Message);
      }
    } else if (data.kind === "result") {
      const snapshot = data.snapshot;
      const newest = Math.max(cache.get(data.key)?.at ?? 0, invalidatedAt.get(data.key) ?? 0);
      if (snapshot && Number.isFinite(snapshot.at) && snapshot.at > newest) {
        cache.set(data.key, snapshot);
      }
    } else if (data.kind === "invalidate" && Number.isFinite(data.at)) {
      if (data.at <= Math.max(cache.get(data.key)?.at ?? 0, invalidatedAt.get(data.key) ?? 0))
        return;
      invalidatedAt.set(data.key, data.at);
      cache.delete(data.key);
      receivingInvalidation = true;
      try {
        void qc.invalidateQueries({
          queryKey: JSON.parse(data.key) as QueryKey,
          exact: true,
          refetchType: "none",
        });
      } finally {
        receivingInvalidation = false;
      }
    }
  };
}

export function sharedStaleTime(key: QueryKey, updatedAt: number, maxAge: number) {
  const at = bridge?.usedAt.get(JSON.stringify(key));
  return at === undefined ? maxAge : Math.max(0, Math.min(maxAge, at + maxAge - updatedAt));
}

/** Coordinate only explicitly allowed account reads. A quiet or missing peer costs at most 40 ms. */
export async function readAcrossTabs<T>(
  qc: QueryClient,
  key: QueryKey,
  maxAge: number,
  read: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const current = bridge;
  if (!current) return read();
  const encoded = JSON.stringify(key);
  if (!keys.has(encoded)) return read();
  const started = Date.now();
  const find = () => {
    const hit = current.cache.get(encoded);
    const invalidatedAt =
      current.invalidatedAt.get(encoded) ?? (qc.getQueryState(key)?.isInvalidated ? started : 0);
    return hit && hit.at >= Math.max(invalidatedAt, Date.now() - maxAge) ? hit : undefined;
  };
  const share = async () => {
    assertSessionGeneration(current.generation);
    signal?.throwIfAborted();
    let hit = find();
    if (!hit && bridge === current) {
      current.channel.postMessage({
        scope: current.scope,
        key: encoded,
        kind: "request",
      } satisfies Message);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 40));
      assertSessionGeneration(current.generation);
      signal?.throwIfAborted();
      hit = find();
    }
    if (hit) {
      current.usedAt.set(encoded, hit.at);
      return hit.value as T;
    }
    const at = Date.now();
    const value = await read();
    if (bridge === current && !signal?.aborted && at >= (current.invalidatedAt.get(encoded) ?? 0)) {
      const snapshot = { at, value };
      current.usedAt.set(encoded, at);
      current.cache.set(encoded, snapshot);
      current.channel.postMessage({
        scope: current.scope,
        key: encoded,
        kind: "result",
        snapshot,
      } satisfies Message);
    }
    return value;
  };
  const locks = navigator.locks;
  if (!locks) return share();
  // The lock only avoids duplicate reads. A stalled peer must not block this screen.
  const deadline = AbortSignal.timeout(1500);
  const waitSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let acquired = false;
  try {
    return await locks.request(
      JSON.stringify([CHANNEL, current.scope, encoded]),
      { signal: waitSignal },
      () => {
        acquired = true;
        return share();
      },
    );
  } catch (error) {
    if (acquired || signal?.aborted || !deadline.aborted) throw error;
    return share();
  }
}
