import { useMutation, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import type { Page, PostDTO } from "@commune/shared";
import { api, ApiError } from "../lib/api";
import { assertSessionGeneration, sessionGeneration } from "../lib/browserSession";
import { expireFeedSnapshots } from "../lib/tabQueries";
import { useAuth } from "../store/auth";

type Reaction = Pick<PostDTO, "likedByMe" | "likeCount">;
type Pages = InfiniteData<Page<PostDTO>>;
type Pending = { confirmed: PostDTO; desired: boolean; revision: number; reconcile?: boolean };
const pending = new Map<string, Pending>();

function isPostList(key: readonly unknown[]) {
  return key[0] === "feed" || (key[0] === "search" && key[1] === "posts");
}

function asLiked(row: Reaction, liked: boolean): Reaction {
  return { likedByMe: liked, likeCount: Math.max(0, row.likeCount + Number(liked) - Number(row.likedByMe)) };
}

function patchReaction(qc: QueryClient, id: string, reaction: Reaction) {
  const patch = (row: PostDTO) => row.id === id &&
    (row.likedByMe !== reaction.likedByMe || row.likeCount !== reaction.likeCount)
    ? { ...row, likedByMe: reaction.likedByMe, likeCount: reaction.likeCount } : row;
  const detail = qc.getQueryData<PostDTO>(["post", id]);
  if (detail) {
    const updated = patch(detail);
    if (updated !== detail) qc.setQueryData(["post", id], updated);
  }
  for (const [key, data] of qc.getQueriesData<Pages>({ predicate: q => isPostList(q.queryKey) })) {
    if (!data) continue;
    let changed = false;
    const pages = data.pages.map(page => {
      const index = page.items.findIndex(row => row.id === id);
      if (index < 0) return page;
      const before = page.items[index]!;
      const after = patch(before);
      if (before === after) return page;
      changed = true;
      const items = page.items.slice();
      items[index] = after;
      return { ...page, items };
    });
    if (changed) qc.setQueryData(key, { ...data, pages });
  }
}

function cachedPost(qc: QueryClient, id: string) {
  const detail = qc.getQueryData<PostDTO>(["post", id]);
  if (detail) return detail;
  for (const [, data] of qc.getQueriesData<Pages>({ predicate: q => isPostList(q.queryKey) })) {
    for (const page of data?.pages ?? []) {
      const row = page.items.find(item => item.id === id);
      if (row) return row;
    }
  }
}

async function reconcileOriginal(qc: QueryClient, id: string, key: string, current: () => boolean) {
  const before = cachedPost(qc, id);
  if (!before) return;
  const inFlight = pending.get(key);
  if (inFlight) {
    inFlight.reconcile = true;
    return;
  }
  try {
    const saved = await api<PostDTO>(`/posts/${id}`);
    if (current() && !pending.has(key) && cachedPost(qc, id) === before)
      patchReaction(qc, id, saved);
  } catch {
    if (current()) void qc.invalidateQueries({ queryKey: ["post", id], exact: true, refetchType: "none" });
  }
}

/** Serialize writes to one post while allowing the next tap to update the visible intent. */
export function usePostLike(post: PostDTO) {
  const qc = useQueryClient();
  const { user, isCurrentAccount } = useAuth();
  const generation = sessionGeneration();
  const account = user?.id ?? "";
  const prefix = JSON.stringify([generation, account]);
  const key = prefix + post.id;
  const current = () => isCurrentAccount(account) && sessionGeneration() === generation;
  const mutation = useMutation({
    scope: { id: key },
    retry: false,
    mutationFn: ({ liked }: { liked: boolean; state: Pending; revision: number }) => {
      assertSessionGeneration(generation);
      if (!current()) throw new Error("Сеанс изменился");
      return api<PostDTO>(`/posts/${post.id}/like`, { method: liked ? "PUT" : "DELETE" });
    },
    onSuccess: (saved, { state, liked }) => {
      if (!current()) return;
      state.confirmed = saved;
      if (liked && saved.likePostId && saved.likePostId !== saved.id)
        void reconcileOriginal(qc, saved.likePostId, prefix + saved.likePostId, current);
    },
    onError: async (error, { state, liked }) => {
      if (!current() || (error instanceof ApiError && error.status >= 400 && error.status < 500)) return;
      // A lost response can follow a successful write. Reconcile before the next queued write.
      try {
        const saved = await api<PostDTO>(`/posts/${post.id}`);
        if (current()) {
          state.confirmed = saved;
          if (liked && saved.likedByMe && saved.likePostId && saved.likePostId !== saved.id)
            void reconcileOriginal(qc, saved.likePostId, prefix + saved.likePostId, current);
        }
      } catch {
        void qc.invalidateQueries({ queryKey: ["post", post.id], exact: true, refetchType: "none" });
      }
    },
    onSettled: (_data, _error, { state, revision }) => {
      if (state.revision !== revision) return;
      if (pending.get(key) === state) pending.delete(key);
      if (!current()) return;
      patchReaction(qc, post.id, state.confirmed);
      const detailKey = ["post", post.id];
      if (qc.getQueryCache().find({ queryKey: detailKey, exact: true })?.isActive() && !qc.getQueryData(detailKey))
        qc.setQueryData(detailKey, state.confirmed);
      if (state.reconcile) void reconcileOriginal(qc, post.id, key, current);
      // Expire the first-page snapshots shared across tabs without refetching loaded pages.
      expireFeedSnapshots(qc);
    },
  });
  const toggle = () => {
    if (!current() || post.likePostId === null) return;
    const state = pending.get(key) ?? { confirmed: post, desired: post.likedByMe, revision: 0 };
    state.desired = !state.desired;
    state.revision++;
    pending.set(key, state);
    void qc.cancelQueries({ fetchStatus: "fetching", predicate: q => {
      if (q.queryKey[0] === "post") return q.queryKey[1] === post.id;
      return isPostList(q.queryKey) && Boolean((q.state.data as Pages | undefined)?.pages.some(page => page.items.some(item => item.id === post.id)));
    } });
    patchReaction(qc, post.id, asLiked(state.confirmed, state.desired));
    mutation.mutate({ liked: state.desired, state, revision: state.revision });
  };
  const state = pending.get(key);
  return { toggle, error: mutation.error, reaction: state ? asLiked(state.confirmed, state.desired) : post };
}
