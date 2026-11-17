import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import type { CommentDTO, CreateCommentInput, CreatePostInput, Page, PostDTO, UpdateCommunityPostInput } from "@commune/shared";
import { COMMENTS_PAGE_SIZE } from "@commune/shared";
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
  return useInfiniteQuery({
    queryKey: linkedCommentId ? ["comments", id, linkedCommentId] : ["comments", id],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }): Promise<CommentDTO[]> =>
      api<CommentDTO[]>(withQuery(`/posts/${id}/comments`, { before: pageParam, comment: pageParam ? undefined : linkedCommentId }), { signal }),
    getNextPageParam: (page: CommentDTO[]) => {
      if (page.length < COMMENTS_PAGE_SIZE) return undefined;
      return page.length > COMMENTS_PAGE_SIZE ? page.find((item) => item.id !== linkedCommentId)?.id : page[0]?.id;
    },
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

export function useSetPostLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, liked }: { id: string; liked: boolean }) =>
      api<PostDTO>(`/posts/${id}/like`, { method: liked ? "PUT" : "DELETE" }),
    onSuccess: (post) => {
      const update = (row: PostDTO) => row.id === post.id
        ? { ...row, likeCount: post.likeCount, likedByMe: post.likedByMe }
        : row;
      qc.setQueriesData<PostDTO>({ queryKey: ["post"] }, (row) => row && update(row));
      qc.setQueryData(["post", post.id], post);
      for (const key of [["feed"], ["search", "posts"], ["public", "posts"]]) {
        qc.setQueriesData<InfiniteData<Page<PostDTO>>>({ queryKey: key }, (rows) => rows && ({
          ...rows,
          pages: rows.pages.map((page) => ({ ...page, items: page.items.map(update) })),
        }));
      }
      if (post.likePostId) {
        void qc.invalidateQueries({ queryKey: ["post", post.likePostId] });
        for (const key of [["feed"], ["search", "posts"], ["public", "posts"]]) void qc.invalidateQueries({ queryKey: key });
      }
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

export function useUpdateCommunityPost(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCommunityPostInput) => api<PostDTO>(`/posts/${id}`, { method: "PATCH", body: input }),
    onSuccess: (post) => {
      qc.setQueryData(["post", id], post);
      for (const key of [["feed"], ["post"], ["search", "posts"], ["public", "posts"], ["thread"]]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useAddComment(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommentInput) =>
      api<CommentDTO>(`/posts/${postId}/comments`, { method: "POST", body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["comments", postId] });
      void qc.invalidateQueries({ queryKey: ["post", postId] });
      void qc.invalidateQueries({ queryKey: ["feed"] });
    },
  });
}

export function useSetCommentLike(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, liked }: { id: string; liked: boolean }) =>
      api<void>(`/posts/${postId}/comments/${id}/like`, { method: liked ? "PUT" : "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", postId] }),
  });
}
