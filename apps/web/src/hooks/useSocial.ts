import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import type {
  NotificationDTO,
  NotificationPreference,
  NotificationPreferences,
  NotificationType,
  ReadNotificationsInput,
  Page,
  PostDTO,
  ProfileDTO,
  AccountUser,
  UpdateProfileInput,
  FriendsAccessDTO,
  FriendsVisibility,
  UserSummaryDTO,
} from "@commune/shared";
import { api, withQuery } from "../lib/api";
import { useAuth } from "../store/auth";
import { readAcrossTabs, sharedStaleTime } from "../lib/tabQueries";
import { isRealtimeConnected } from "../lib/realtime";

export function useProfile(username: string, enabled = Boolean(username), live = false) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["profile", username.toLowerCase(), user?.id],
    enabled,
    refetchInterval: live ? 30_000 : false,
    refetchOnWindowFocus: live,
    queryFn: () => api<ProfileDTO>(`/users/${encodeURIComponent(username)}`),
  });
}

export function useUserPosts(username: string) {
  return useInfiniteQuery({
    queryKey: ["feed", "user", username.toLowerCase()],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<Page<PostDTO>>(
        withQuery(`/users/${encodeURIComponent(username)}/posts`, { cursor: pageParam }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useToggleFollow(username: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (following: boolean) =>
      api<ProfileDTO>(`/users/${encodeURIComponent(username)}/follow`, {
        method: following ? "PUT" : "DELETE",
      }),
    onSuccess: (profile) => {
      qc.setQueryData(["profile", username.toLowerCase(), user?.id], profile);
      void qc.invalidateQueries({ queryKey: ["profile"] });
      // The "Following" feed changes whenever the follow list changes.
      void qc.invalidateQueries({ queryKey: ["feed", "following"] });
      void qc.invalidateQueries({ queryKey: ["friends-access"] });
      void qc.invalidateQueries({ queryKey: ["friends-list"] });
      void qc.invalidateQueries({ queryKey: ["relationships"] });
      void qc.invalidateQueries({ queryKey: ["profile-music"] });
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: ["profile", username.toLowerCase()] });
      void qc.invalidateQueries({ queryKey: ["friends-access"] });
      void qc.invalidateQueries({ queryKey: ["friends-list"] });
      void qc.invalidateQueries({ queryKey: ["feed", "following"] });
      void qc.invalidateQueries({ queryKey: ["relationships"] });
    },
  });
}

export function useFriendsAccess(username: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["friends-access", user?.id, username.toLowerCase()],
    queryFn: () => api<FriendsAccessDTO>(`/users/${encodeURIComponent(username)}/friends/access`),
    enabled: Boolean(user && username),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });
}

export function useFriends(username: string, q: string, enabled: boolean, limit = 20) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: ["friends-list", user?.id, username.toLowerCase(), q, limit],
    enabled: Boolean(user && enabled),
    gcTime: 0,
    staleTime: 0,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<Page<UserSummaryDTO>>(
        withQuery(`/users/${encodeURIComponent(username)}/friends`, {
          q,
          cursor: pageParam,
          limit: String(limit),
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
  });
}

export function useFriendRequests(type: "incoming" | "outgoing", q: string, enabled: boolean) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: ["relationships", user?.id, type, q],
    enabled: Boolean(user && enabled),
    gcTime: 0,
    staleTime: 0,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<Page<UserSummaryDTO>>(
        withQuery("/users/me/relationships", { type, q, cursor: pageParam }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
  });
}

export function usePeople(q: string, enabled: boolean) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: ["people", user?.id, q],
    enabled: Boolean(user && enabled),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api<Page<UserSummaryDTO>>(withQuery("/search/people", { q, cursor: pageParam })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
  });
}

export function useRelationshipCounts(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["relationships", user?.id, "counts"],
    queryFn: () => api<Record<"friends" | "outgoing" | "incoming", number>>("/users/me/relationships/counts"),
    enabled: Boolean(user && enabled), staleTime: 30_000, gcTime: 0, refetchInterval: 30_000, refetchOnWindowFocus: true,
  });
}

export function useFriendsVisibility() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (friendsVisibility: FriendsVisibility) =>
      api<{ friendsVisibility: FriendsVisibility }>("/users/me/friends-visibility", {
        method: "PATCH",
        body: { friendsVisibility },
      }),
    onSuccess: ({ friendsVisibility }) => {
      if (user) {
        qc.setQueryData<FriendsAccessDTO>(["friends-access", user.id, user.username.toLowerCase()],
          (current) => current?.canView ? { ...current, friendsVisibility } : current);
      }
      void qc.invalidateQueries({ queryKey: ["profile"] });
      void qc.invalidateQueries({ queryKey: ["friends-access"] });
      void qc.invalidateQueries({ queryKey: ["friends-list"] });
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: ["friends-access"] });
    },
  });
}

/** Updates the signed-in user's bio and/or avatar. */
export function useUpdateProfile() {
  const qc = useQueryClient();
  const { setUser } = useAuth();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) =>
      api<AccountUser>("/users/me", { method: "PATCH", body: input }),
    onSuccess: (user, changes) => {
      setUser(user);
      if (changes.displayName !== undefined) {
        for (const key of ["public", "search", "friends-list", "relationships", "conversations", "thread", "notifications", "admin-reports", "wallpapers"]) {
          void qc.invalidateQueries({ queryKey: [key] });
        }
      }
      void qc.invalidateQueries({ queryKey: ["profile"] });
      // Avatars appear on posts and comments, so refresh those too.
      void qc.invalidateQueries({ queryKey: ["feed"] });
      void qc.invalidateQueries({ queryKey: ["post"] });
      void qc.invalidateQueries({ queryKey: ["comments"] });
    },
  });
}

export function useNotifications(type: NotificationType | undefined, compact = false) {
  const { user, confirmed } = useAuth();
  return useInfiniteQuery({
    queryKey: ["notifications", user?.id, type, compact],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => api<Page<NotificationDTO>>(
      withQuery("/notifications", { type, limit: "30", cursor: pageParam }),
      { signal },
    ),
    getNextPageParam: (last) => compact ? undefined : last.nextCursor ?? undefined,
    enabled: confirmed, refetchInterval: () => (isRealtimeConnected() ? 90_000 : 30_000),
    refetchOnWindowFocus: (query) => !isRealtimeConnected() || query.state.isInvalidated,
    staleTime: 15_000,
  });
}

/** Shares the latest REST count while retaining fallback reconciliation. */
export function useUnreadCount(enabled: boolean) {
  const { confirmed } = useAuth();
  const qc = useQueryClient();
  const key = ["unread-count"];
  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) => readAcrossTabs(qc, key, 25_000, () => api<{ count: number }>("/notifications/unread-count", { signal }), signal),
    enabled: enabled && confirmed,
    staleTime: (query) => sharedStaleTime(key, query.state.dataUpdatedAt, 25_000),
    refetchInterval: () => (isRealtimeConnected() ? 90_000 : 30_000),
    refetchOnWindowFocus: true,
  });
}

export function useReadNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: NonNullable<ReadNotificationsInput["items"]>) => {
      const requests: Promise<void>[] = [];
      for (let start = 0; start < items.length; start += 100) {
        requests.push(api<void>("/notifications/read", {
          method: "POST",
          body: { items: items.slice(start, start + 100) },
          keepalive: true,
        }));
      }
      await Promise.all(requests);
    },
    onSettled: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
        qc.invalidateQueries({ queryKey: ["unread-count"] }),
      ]);
    },
  });
}

/** Remembers the unread entries rendered during a page or popup visit. */
export function useNotificationReadSession() {
  const seen = useRef(new Map<string, NotificationDTO>());
  const { mutate } = useReadNotifications();
  const remember = useCallback((items: NotificationDTO[]) => {
    for (const item of items) {
      if (!item.read) seen.current.set(item.id, item);
      else if (seen.current.get(item.id)?.createdAt === item.createdAt) seen.current.delete(item.id);
    }
  }, []);
  const finish = useCallback((selection?: NotificationDTO[]) => {
    const items = selection ?? Array.from(seen.current.values());
    seen.current.clear();
    if (items.length) mutate(items.map(({ id, createdAt }) => ({ id, createdAt })));
  }, [mutate]);
  return { remember, finish };
}

export function useNotificationPreferences() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notification-preferences", user?.id],
    queryFn: ({ signal }) => api<NotificationPreferences>("/notifications/preferences", { signal }),
    enabled: Boolean(user),
    refetchOnWindowFocus: true,
  });
}

export function useSaveNotificationPreference() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["notification-preferences", user?.id];
  return useMutation({
    mutationFn: (body: NotificationPreference) =>
      api<NotificationPreferences>("/notifications/preferences", { method: "PATCH", body }),
    onSuccess: async (prefs, change) => {
      await qc.cancelQueries({ queryKey: key });
      qc.setQueryData(key, prefs);
      if (!prefs[change.type].visible) {
        qc.setQueriesData<InfiniteData<Page<NotificationDTO>>>({ queryKey: ["notifications", user?.id] }, (data) =>
          data && {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.filter((item) => item.type !== change.type),
            })),
          },
        );
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
        qc.invalidateQueries({ queryKey: ["unread-count"] }),
      ]);
    },
  });
}
