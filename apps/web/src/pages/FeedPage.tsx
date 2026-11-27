import { useCallback, useContext, useState } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import Composer from "../components/Composer";
import PostList from "../components/PostList";
import { useFeed } from "../hooks/usePosts";
import type { FeedType } from "../hooks/usePosts";
import { useQueryClient } from "@tanstack/react-query";
import { scrollToTop } from "../lib/scrollToTop";
import { refreshFeed } from "../lib/feedNavigation";
import { FeedSessionContext, type FeedAnchor } from "../lib/feedWindow";

const TABS: Array<{ id: FeedType; label: string; empty: string }> = [
  {
    id: "following",
    label: "Подписки",
    empty: "Здесь пока пусто. Подпишитесь на пользователей в их профилях.",
  },
  { id: "all", label: "Все записи", empty: "Записей пока нет. Напишите первую!" },
];

export default function FeedPage() {
  const session = useContext(FeedSessionContext);
  const { key, state } = useLocation();
  const navigation = useNavigationType();
  const [back] = useState(() => {
    const source = (state as { feedHistoryKey?: unknown } | null)?.feedHistoryKey;
    return session?.history.get(navigation === "POP" ? key : typeof source === "string" ? source : "");
  });
  const [tab, setTab] = useState<FeedType>(back?.tab ?? "following");
  const [restore, setRestore] = useState(back?.anchor ?? null);
  const [revision, setRevision] = useState(0);
  const remember = useCallback((anchor: FeedAnchor | null) => session?.remember(key, tab, anchor), [session, key, tab]);
  const feed = useFeed(tab);
  const queryClient = useQueryClient();
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <>
      <Composer />
      <div className="tabs feed-tabs" role="tablist" aria-label="Лента">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === tab}
            className={`tab ${t.id === tab ? "active" : ""}`}
            onClick={() => {
              scrollToTop();
              setRestore(null);
              setRevision(previous => previous + 1);
              void refreshFeed(queryClient, t.id);
              setTab(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <PostList inlineComments query={feed} emptyMessage={active.empty} pinTarget={tab === "all" ? "/admin/feed-pin" : undefined}
        windowing={session && import.meta.env.VITE_FEED_WINDOW !== "0" ? {
          key: `${tab}:${revision}`, session, measurement: session.measurements[tab], remember, restore,
        } : undefined} />
    </>
  );
}
