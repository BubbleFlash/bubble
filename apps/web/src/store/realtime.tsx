import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient, type InfiniteData, type QueryKey } from "@tanstack/react-query";
import type { MessageDTO, NotificationDTO, Page } from "@commune/shared";
import NotificationToasts from "../components/NotificationToasts";
import { refreshMessageQueries, updateLatestThreadPage, type ThreadPage } from "../hooks/useMessages";
import { isRealtimeConnected, realtimeEnabled, startRealtime, stopRealtime } from "../lib/realtime";
import { hideNotificationToasts, notificationVersion } from "../lib/notifications";
import { isViewingConversation, playSound } from "../lib/sound";
import { useAuth } from "./auth";
import { useUnreadCount } from "../hooks/useSocial";

/** Adds a message to a loaded conversation unless it is already there (own sends arrive twice). */
export function appendUnique(page: ThreadPage, message: MessageDTO): ThreadPage {
  if (page.items.some((m) => m.id === message.id)) return page;
  if (message.clientMessageId) {
    const index = page.items.findIndex((item) => item.id.startsWith("tmp-") && item.senderId === message.senderId && item.clientMessageId === message.clientMessageId);
    if (index !== -1) {
      const items = [...page.items];
      items[index] = message;
      return { ...page, items };
    }
  }
  return { ...page, items: [...page.items, message] };
}

/**
 * Connects the live service while someone is signed in and keeps the data on screen up to date:
 * new messages appear instantly, "seen" ticks over, badges refresh, notifications arrive.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user, confirmed } = useAuth();
  const qc = useQueryClient();
  const userId = confirmed ? user?.id : undefined;
  const unread = useUnreadCount(Boolean(userId));
  const previous = useRef<{ userId: string; count: number } | null>(null);
  const timers = useRef(new Map<string, number>());
  const [toasts, setToasts] = useState<Array<{ userId: string; item: NotificationDTO }>>([]);
  const dismissToast = useCallback((version: string) => {
    window.clearTimeout(timers.current.get(version));
    timers.current.delete(version);
    setToasts((current) => current.filter(({ item }) => notificationVersion(item) !== version));
  }, []);

  const invalidate = useCallback((queryKey: QueryKey, exact = false) => qc.invalidateQueries({
    queryKey, exact, refetchType: document.visibilityState === "visible" ? "active" : "none",
  }), [qc]);

  useEffect(() => {
    if (!userId || unread.data === undefined) { previous.current = null; return; }
    const count = unread.data.count;
    if (previous.current?.userId === userId && previous.current.count !== count) {
      if (!isRealtimeConnected()) void invalidate(["notifications"]);
    }
    previous.current = { userId, count };
  }, [userId, unread.data, invalidate]);

  useEffect(() => {
    if (!userId) return;
    const refresh = () => {
      if (isRealtimeConnected()) return;
      for (const key of ["thread", "conversations", "unread-messages", "notifications", "unread-count", "relationships", "friends-access", "friends-list"]) void invalidate([key]);
    };
    window.addEventListener("online", refresh);
    return () => window.removeEventListener("online", refresh);
  }, [userId, invalidate]);

  useEffect(() => {
    if (!realtimeEnabled || !userId) return;
    const toastTimers = timers.current;
    const hideToasts = window.matchMedia(hideNotificationToasts);

    startRealtime({
      onMessage: ({ message }) => {
        const key = ["thread", message.conversationId];
        const fetching = qc.getQueryState(key)?.fetchStatus === "fetching";
        // An older REST snapshot must never overwrite this event. This also covers
        // the first GET, when there is no conversation in the cache to append to yet.
        if (fetching) void qc.cancelQueries({ queryKey: key, exact: true });
        updateLatestThreadPage(qc, message.conversationId, (old) => {
          const next = appendUnique(old, message);
          // A new message from me means the other person has not seen it yet.
          if (message.senderId === userId && old.conversation) {
            return { ...next, conversation: { ...old.conversation, seenByOther: false } };
          }
          return next;
        });
        if (fetching || message.hasRepost) void invalidate(key, true);
        void invalidate(["conversations"]);
        if (message.senderId !== userId) {
          void invalidate(["unread-messages"]);
          // A chime for someone else's message, unless you are already reading that conversation.
          if (!isViewingConversation(message.conversationId)) void playSound("message", { userId, eventId: `message/${message.id}` });
        }
      },
      onRead: ({ conversationId, readerId }) => {
        if (readerId === userId) {
          void invalidate(["unread-messages"]);
          void invalidate(["conversations"]);
          return;
        }
        updateLatestThreadPage(qc, conversationId, (old) =>
          old.conversation
            ? { ...old, conversation: { ...old.conversation, seenByOther: true } }
            : old,
        );
        void invalidate(["conversations"]);
      },
      onMessageChanged: ({ conversationId }) => {
        if (document.visibilityState === "visible") void refreshMessageQueries(qc, conversationId);
        else {
          void invalidate(["thread", conversationId], true);
          void invalidate(["conversations"]);
          void invalidate(["unread-messages"]);
        }
      },
      onNotification: (event) => {
        if (event?.notification) {
          const item = event.notification;
          if (item.type === "comment" && item.postId) {
            void invalidate(["comments", item.postId]);
            void invalidate(["post", item.postId], true);
            void invalidate(["feed"]);
            void invalidate(["search", "posts"]);
            void invalidate(["public", "posts"]);
          }
          const visible = document.visibilityState === "visible";
          const version = notificationVersion(item);
          if (event.sound !== false) void playSound(item.type, { userId, eventId: `notification/${version}` });
          if (visible && !hideToasts.matches && !toastTimers.has(version)) {
            setToasts((current) => [...current, { userId, item }]);
            toastTimers.set(version, window.setTimeout(() => dismissToast(version), 2700));
          }
          for (const [key, data] of qc.getQueriesData<InfiniteData<Page<NotificationDTO>>>({ queryKey: ["notifications", userId] })) {
            const filter = key[2];
            if ((filter && filter !== item.type) || !data?.pages.length) continue;
            if (qc.getQueryState(key)?.fetchStatus === "fetching") {
              void invalidate(key, true);
              continue;
            }
            const existing = data.pages.flatMap((page) => page.items).find((row) => row.id === item.id);
            if (existing && existing.createdAt >= item.createdAt) continue;
            const lastInHead = data.pages[0]?.items.at(-1);
            if (lastInHead && lastInHead.createdAt > item.createdAt) {
              void invalidate(key, true);
              continue;
            }
            const pages = data.pages.map((page, index) => {
              const items = page.items.filter((row) => row.id !== item.id);
              if (index === 0) {
                items.push(item);
                items.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
              }
              return { ...page, items };
            });
            qc.setQueryData(key, { ...data, pages });
          }
        } else {
          void invalidate(["notifications", userId]);
        }
        void invalidate(["unread-count"]);
        // An event without a card may still represent a hidden follow notification.
        if (!event?.readStateChanged && (!event?.notification || event.notification.type === "follow")) {
          for (const key of ["relationships", "friends-access", "friends-list", "profile", "profile-music"]) void invalidate([key]);
        }
      },
      onResync: () => {
        // Events sent while the connection was down are gone, so ask the server what changed.
        for (const key of [
          "thread",
          "conversations",
          "unread-messages",
          "notifications",
          "unread-count",
          "relationships", "friends-access", "friends-list", "profile", "profile-music",
        ]) {
          void invalidate([key]);
        }
      },
    });
    return () => {
      stopRealtime();
      toastTimers.forEach((timer) => window.clearTimeout(timer));
      toastTimers.clear();
      setToasts([]);
    };
  }, [userId, qc, dismissToast, invalidate]);

  return (
    <>
      {children}
      {userId && <NotificationToasts
        items={toasts.filter((toast) => toast.userId === userId).map(({ item }) => item)}
        dismiss={dismissToast}
      />}
    </>
  );
}
