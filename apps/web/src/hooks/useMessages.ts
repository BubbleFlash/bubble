import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import type { ConversationDTO, MessageDTO, MessagePage, MusicTrackDTO } from "@commune/shared";
import { api } from "../lib/api";
import { isRealtimeConnected } from "../lib/realtime";
import { readAcrossTabs, sharedStaleTime } from "../lib/tabQueries";
import { useAuth } from "../store/auth";

export type ThreadPage = MessagePage & { conversation?: ConversationDTO };
type CachedThread = InfiniteData<ThreadPage>;

export function updateLatestThreadPage(qc: QueryClient, id: string, update: (page: ThreadPage) => ThreadPage) {
  qc.setQueryData<CachedThread>(["thread", id], (old) => {
    const latest = old?.pages[0];
    return latest ? { ...old, pages: [update(latest), ...old.pages.slice(1)] } : old;
  });
}

export function refreshMessageQueries(qc: QueryClient, id: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["thread", id], exact: true }),
    qc.invalidateQueries({ queryKey: ["conversations"] }),
    qc.invalidateQueries({ queryKey: ["unread-messages"] }),
  ]);
}

export function useConversations(enabled = true) {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: () => api<ConversationDTO[]>("/messages"),
    enabled,
    refetchOnWindowFocus: true,
    // The live connection delivers changes; polling is only a safety net while it is up.
    refetchInterval: 30_000,
  });
}

/** Number of conversations with unread messages (for the badge). */
export function useUnreadMessages(enabled: boolean) {
  const { confirmed } = useAuth();
  const qc = useQueryClient();
  const key = ["unread-messages"];
  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) => readAcrossTabs(qc, key, 25_000, () => api<{ count: number }>("/messages/unread-count", { signal }), signal),
    enabled: enabled && confirmed,
    staleTime: (query) => sharedStaleTime(key, query.state.dataUpdatedAt, 25_000),
    refetchOnWindowFocus: true,
    refetchInterval: () => (isRealtimeConnected() ? 180_000 : 30_000),
  });
}

/** Only the open conversation needs the shorter fallback interval. */
export function useThread(id: string | undefined) {
  const qc = useQueryClient();
  return useInfiniteQuery({
    queryKey: ["thread", id],
    enabled: Boolean(id),
    refetchOnWindowFocus: (query) => !isRealtimeConnected() || query.state.isInvalidated,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: ThreadPage) => page.nextCursor ?? undefined,
    queryFn: async ({ pageParam, signal }): Promise<ThreadPage> => {
      const query = pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : "";
      const page = await api<ThreadPage>(`/messages/${id}${query}`, { signal });
      // Opening a thread marks it read on the server, so refresh the badges when it mattered.
      if ((page.conversation?.unread ?? 0) > 0) {
        void qc.invalidateQueries({ queryKey: ["unread-messages"] });
        void qc.invalidateQueries({ queryKey: ["conversations"] });
      }
      return page;
    },
    refetchInterval: (query) => {
      if (!isRealtimeConnected()) return 15_000;
      return (query.state.data?.pages.length ?? 0) > 1 ? 180_000 : 60_000;
    },
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
}

/** Ids of messages that are still being sent start with this. */
export const PENDING_PREFIX = "tmp-";
export type MessageDraft = { text: string; tracks: MusicTrackDTO[]; clientMessageId: string; imageIds: string[] };
const messageBody = (draft: MessageDraft) => ({
  text: draft.text,
  musicTrackIds: draft.tracks.map((track) => track.id),
  imageIds: draft.imageIds,
  clientMessageId: draft.clientMessageId,
});

/**
 * Sending shows the message at once ("optimistic"), then swaps in the saved one. If sending
 * fails the temporary message is removed and the error is shown, so nothing is silently lost.
 */
export function useSendMessage(id: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const key = ["thread", id];
  return useMutation({
    mutationFn: (draft: MessageDraft) =>
      api<MessageDTO>(`/messages/${id}`, { method: "POST", body: messageBody(draft) }),
    onMutate: async (draft) => {
      await qc.cancelQueries({ queryKey: key });
      const tempId = `${PENDING_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const temp: MessageDTO = {
        id: tempId,
        conversationId: id,
        senderId: user?.id ?? "",
        text: draft.text,
        clientMessageId: draft.clientMessageId,
        imageIds: draft.imageIds,
        musicAttachments: draft.tracks.map(({ id, title, artist, duration }) => ({ id, title, artist, duration, unavailable: false })),
        createdAt: new Date().toISOString(),
      };
      updateLatestThreadPage(qc, id, (old) => ({
              ...old,
              items: [...old.items, temp],
              conversation: old.conversation && { ...old.conversation, seenByOther: false },
      }));
      return { tempId };
    },
    onSuccess: (saved, _text, ctx) => {
      updateLatestThreadPage(qc, id, (old) => {
        // The live event may already have delivered the saved message; then just drop the temp one.
        const already = old.items.some((m) => m.id === saved.id);
        const items = already
          ? old.items.filter((m) => m.id !== ctx?.tempId)
          : old.items.some((m) => m.id === ctx?.tempId)
            ? old.items.map((m) => (m.id === ctx?.tempId ? saved : m))
            : [...old.items, saved];
        return { ...old, items };
      });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (_err, _text, ctx) => {
      updateLatestThreadPage(qc, id, (old) => ({ ...old, items: old.items.filter((m) => m.id !== ctx?.tempId) }));
    },
  });
}

export function useChangeMessage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { messageId: string; text?: string }) =>
      api<void>(`/messages/${id}/items/${input.messageId}`, input.text === undefined
        ? { method: "DELETE" }
        : { method: "PATCH", body: { text: input.text } }),
    onSuccess: () => refreshMessageQueries(qc, id),
  });
}

/** Marks a conversation read (sent when a message arrives while the person is looking at it). */
export function useMarkRead(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/messages/${id}/read`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["unread-messages"] });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useStartChat(username: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: MessageDraft) =>
      api<{ conversationId: string; message: MessageDTO }>(
        `/messages/with/${encodeURIComponent(username)}`,
        {
          method: "POST",
          body: messageBody(draft),
        },
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
}
