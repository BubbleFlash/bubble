import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useFeedMute(kind: "users" | "communities", name: string) {
  const cache = useQueryClient();
  const path = `/feed-mutes/${kind}/${encodeURIComponent(name)}`;
  const queryKey = ["feed-mute", kind, name.toLowerCase()];
  const status = useQuery({ queryKey, queryFn: () => api<{ muted: boolean }>(path), enabled: Boolean(name) });
  const change = useMutation({
    mutationFn: (muted: boolean) => api<{ muted: boolean }>(path, { method: muted ? "PUT" : "DELETE" }),
    onSuccess: (value) => { cache.setQueryData(queryKey, value); void cache.invalidateQueries({ queryKey: ["feed"] }); },
  });
  return { status, change };
}

export default function FeedMuteButton({ kind, name }: { kind: "users" | "communities"; name: string }) {
  const { status, change } = useFeedMute(kind, name);
  if (!status.data?.muted) return null;
  return <div><button type="button" className="btn" disabled={change.isPending} onClick={() => change.mutate(false)}>Вернуть публикации в ленту</button>
    {change.isError && <p className="error" role="alert">{change.error.message}</p>}</div>;
}
