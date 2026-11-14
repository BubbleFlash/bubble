import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import type { CommentDTO, CreatePostInput, Page, PostDTO } from "@commune/shared";
import { api, withQuery } from "../lib/api";

export type FeedType = "all" | "following";

export function useFeed(feed: FeedType = "all") {
  return useInfiniteQuery({
    queryKey: ["feed", feed],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<Page<PostDTO>>(withQuery("/posts", { feed, cursor: pageParam })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

function findPostInFeeds(qc: QueryClient, id: string): PostDTO | undefined {
  for (const [, data] of qc.getQueriesData<InfiniteData<Page<PostDTO>>>({ queryKey: ["feed"] })) {
    const hit = data?.pages.flatMap((p) => p.items).find((p) => p.id === id);
    if (hit) return hit;
  }
  return undefined;
}

export function usePost(id: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["post", id],
    // Opening a post you just saw in a feed shows it at once; the fresh copy loads behind it.
    placeholderData: () => findPostInFeeds(qc, id),
    queryFn: () => api<PostDTO>(`/posts/${id}`),
  });
}

export function useComments(id: string, linkedCommentId?: string) {
  return useQuery({
    queryKey: linkedCommentId ? ["comments", id, linkedCommentId] : ["comments", id],
    queryFn: () => api<CommentDTO[]>(withQuery(`/posts/${id}/comments`, { comment: linkedCommentId })),
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePostInput) => api<PostDTO>("/posts", { method: "POST", body: input }),
    // ["feed"] also covers community feeds, which are keyed ["feed", "community", slug].
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feed"] }),
  });
}

export function useToggleLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<PostDTO>(`/posts/${id}/like`, { method: "POST" }),
    onSuccess: (post) => {
      void qc.invalidateQueries({ queryKey: ["post"], predicate: (query) => query.queryKey[1] !== post.id });
      qc.setQueryData(["post", post.id], post);
      void qc.invalidateQueries({ queryKey: ["feed"] });
      void qc.invalidateQueries({ queryKey: ["search", "posts"] });
      void qc.invalidateQueries({ queryKey: ["public", "posts"] });
    },
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/posts/${id}`, { method: "DELETE" }),
    onSuccess: (_result, id) => {
      qc.removeQueries({ queryKey: ["post", id], exact: true });
      for (const key of [["feed"], ["post"], ["search", "posts"], ["public", "posts"], ["thread"]]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useAddComment(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      api<CommentDTO>(`/posts/${postId}/comments`, { method: "POST", body: { content } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["comments", postId] });
      void qc.invalidateQueries({ queryKey: ["post", postId] });
      void qc.invalidateQueries({ queryKey: ["feed"] });
    },
  });
}
