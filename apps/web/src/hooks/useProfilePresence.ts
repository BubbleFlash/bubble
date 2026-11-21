import { useQuery } from "@tanstack/react-query";
import { api, withQuery } from "../lib/api";

const pending = new Map<string, { resolve: (online: boolean) => void; reject: (error: unknown) => void }>();

function fetchPresence(username: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (!pending.size) window.setTimeout(flushPresence, 0);
    pending.set(username, { resolve, reject });
  });
}

function flushPresence() {
  const entries = [...pending];
  pending.clear();
  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50);
    const path = withQuery("/profile-presence", { usernames: batch.map(([username]) => username).join(",") });
    api<{ online: string[] }>(path).then(({ online }) => {
      const names = new Set(online);
      for (const [username, result] of batch) result.resolve(names.has(username));
    }).catch((error: unknown) => {
      for (const [, result] of batch) result.reject(error);
    });
  }
}

export function useProfilePresence(username: string, enabled: boolean) {
  const key = username.toLowerCase();
  return useQuery({
    queryKey: ["profile-presence", key],
    queryFn: () => fetchPresence(key),
    enabled: enabled && /^[a-z0-9_]{3,24}$/.test(key),
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: false,
  }).data;
}
