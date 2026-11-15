import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CommunityDTO, CommunityMemberDTO, CreateCommunityInput, Page, PostDTO } from "@commune/shared";
import type { QueryClient } from "@tanstack/react-query";
import { api, withQuery } from "../lib/api";

export function useCommunities(filter: { q?: string; mine?: boolean; owned?: boolean; publishable?: boolean }, enabled = true) {
  return useQuery({
    queryKey: ["communities", filter],
    enabled,
    queryFn: () =>
      api<CommunityDTO[]>(
        withQuery("/communities", {
          q: filter.q,
          mine: filter.mine ? "1" : undefined,
          owned: filter.owned ? "1" : undefined,
          publishable: filter.publishable ? "1" : undefined,
        }),
      ),
  });
}

export function useCommunityMembers(slug: string, scope: "members" | "managers" | "team", search: string, enabled: boolean) {
  const q = search.trim();
  return useInfiniteQuery({
    queryKey: ["community-people", slug, scope, q],
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => api<Page<CommunityMemberDTO>>(
      withQuery(`/communities/${slug}/${scope}`, { q, cursor: pageParam }),
      { signal },
    ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function refreshCommunity(qc: QueryClient, slug: string) {
  return Promise.all([
    ["community", slug], ["community-people", slug], ["communities"],
    ["feed"], ["post"], ["search", "posts"], ["public", "posts"], ["thread"],
  ].map((queryKey) => qc.invalidateQueries({ queryKey })));
}

export function useCommunity(slug: string) {
  return useQuery({
    queryKey: ["community", slug],
    queryFn: () => api<CommunityDTO>(`/communities/${slug}`),
  });
}

export function useCommunityPosts(slug: string) {
  return useInfiniteQuery({
    queryKey: ["feed", "community", slug],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<Page<PostDTO>>(withQuery(`/communities/${slug}/posts`, { cursor: pageParam })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useCreateCommunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommunityInput) =>
      api<CommunityDTO>("/communities", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["communities"] }),
  });
}

export function useMembership(slug: string) {
  const qc = useQueryClient();
  const refresh = () => refreshCommunity(qc, slug);
  const join = useMutation({
    mutationFn: () => api<void>(`/communities/${slug}/join`, { method: "POST" }),
    onSuccess: refresh,
  });
  const leave = useMutation({
    mutationFn: () => api<void>(`/communities/${slug}/join`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  return { join, leave };
}
