import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { Page, PostDTO } from "@commune/shared";
import type { MouseEvent } from "react";
import type { FeedType } from "../hooks/usePosts";
import { scrollToTop } from "./scrollToTop";

const feedTypes = ["following", "all"] as const;
type FeedPages = InfiniteData<Page<PostDTO>, string | undefined>;

export async function refreshFeed(client: QueryClient, feed: FeedType) {
  const queryKey = ["feed", feed];
  const filter = { queryKey, exact: true };
  const query = client.getQueryState<FeedPages>(queryKey);
  if (!query) return;
  if (!query.data) {
    if (query.fetchStatus === "idle") await client.invalidateQueries(filter, { cancelRefetch: false });
    return;
  }
  if (query.isInvalidated && query.fetchStatus === "fetching" && query.data.pages.length === 1) return;

  await client.cancelQueries(filter);
  const cached = client.getQueryState<FeedPages>(queryKey);
  if (cached?.data && cached.data.pages.length > 1) {
    // An infinite query refetches every cached page in order. Start from the
    // first page at the top and let normal pagination load the rest as needed.
    client.setQueryData<FeedPages>(queryKey, {
      pages: cached.data.pages.slice(0, 1),
      pageParams: cached.data.pageParams.slice(0, 1),
    }, { updatedAt: cached.dataUpdatedAt });
  }
  await client.invalidateQueries(filter, { cancelRefetch: false });
}

export function openFeed(event: MouseEvent<HTMLAnchorElement>, client: QueryClient, pathname: string) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  scrollToTop();
  if (pathname !== "/") {
    void refreshFeed(client, "following");
    return;
  }

  event.preventDefault();
  const active = feedTypes.find((feed) =>
    client.getQueryCache().find({ queryKey: ["feed", feed], exact: true })?.isActive(),
  );
  if (active) void refreshFeed(client, active);
}
