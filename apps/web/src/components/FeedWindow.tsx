import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { PostDTO } from "@commune/shared";
import PostCard from "./PostCard";
import {
  FeedGeometry,
  type FeedAnchor,
  type FeedCardState,
  type FeedMeasurements,
  type FeedSession,
} from "../lib/feedWindow";
import { getPageScroller } from "../lib/scrollToTop";
import { FEED_SCROLL_RESET } from "../lib/feedNavigation";

const focusable = 'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])';
const gutter = 8;

function rowControls(row: HTMLElement) {
  return [...row.querySelectorAll<HTMLElement>(focusable)].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(":disabled") &&
      !element.closest("[inert], [hidden]") &&
      element.getClientRects().length > 0,
  );
}

const Row = memo(function Row({
  post,
  session,
  pinTarget,
  attach,
}: {
  post: PostDTO;
  session: FeedSession;
  pinTarget?: string;
  attach: (id: string, node: HTMLDivElement | null, state: FeedCardState) => void;
}) {
  const [state] = useState(() => session.cards.get(post.id) ?? {});
  const ref = useCallback(
    (node: HTMLDivElement | null) => attach(post.id, node, state),
    [attach, post.id, state],
  );
  return (
    <div className="feed-window-row" data-feed-row={post.id} ref={ref}>
      <PostCard post={post} inlineComments pinTarget={pinTarget} retained={state} />
    </div>
  );
});

export default function FeedWindow({
  posts,
  pinTarget,
  session,
  measurement,
  restore,
  remember,
}: {
  posts: PostDTO[];
  pinTarget?: string;
  session: FeedSession;
  measurement: FeedMeasurements;
  restore: FeedAnchor | null;
  remember: (anchor: FeedAnchor | null) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const rows = useRef(new Map<string, HTMLDivElement>());
  const observer = useRef<ResizeObserver>();
  const pendingRestore = useRef(restore);
  const activeEmbed = useRef<HTMLIFrameElement>();
  const previousGeometry = useRef<FeedGeometry>();
  const previousMeasurement = useRef<FeedMeasurements>();
  const currentPosts = useRef(posts);
  const lastAnchor = useRef<FeedAnchor | null>(null);
  const [layoutMeasurement, refreshLayoutMeasurement] = useState(measurement);
  const geometry = useMemo(() => {
    const previous = previousGeometry.current;
    // Updating a reaction or a comment changes DTO identity without changing positions.
    if (
      previous &&
      previousMeasurement.current === layoutMeasurement &&
      previous.indices.size === posts.length &&
      posts.every(({ id }, index) => previous.indices.get(id) === index)
    )
      return previous;
    return new FeedGeometry(posts, layoutMeasurement);
  }, [posts, layoutMeasurement]);
  useLayoutEffect(() => {
    currentPosts.current = posts;
    previousMeasurement.current = layoutMeasurement;
  }, [posts, layoutMeasurement]);
  const [view, setView] = useState<number[]>(() => {
    const first = restore
      ? Math.max(0, (geometry.indices.get(restore.id) ?? restore.index) - 3)
      : 0;
    return Array.from({ length: Math.min(12, posts.length - first) }, (_, i) => first + i);
  });
  const viewRef = useRef(view);
  const range = useRef<{ first: number; last: number }>();
  const attach = useCallback(
    (id: string, node: HTMLDivElement | null, state: FeedCardState) => {
      const previous = rows.current.get(id);
      if (previous) observer.current?.unobserve(previous);
      if (node) {
        session.cards.set(id, state);
        rows.current.set(id, node);
        observer.current?.observe(node, { box: "border-box" });
      } else {
        rows.current.delete(id);
        if (
          !state.editor &&
          !state.commentsOpen &&
          !state.content &&
          !state.replying &&
          !state.tracks?.length &&
          !state.images?.read().length &&
          !state.expanded &&
          !state.slideUrl &&
          !state.revealed
        ) {
          session.cards.delete(id);
        }
      }
    },
    [session],
  );

  useLayoutEffect(() => {
    const list = root.current!;
    let frame = 0;
    let scrollTarget: EventTarget;
    let scroller = getPageScroller();
    if (!scroller) return;
    const pendingSizes = new Map<string, { node: Element; height: number }>();
    const getViewport = () => {
      const listTop = list.getBoundingClientRect().top;
      const paneTop =
        scroller === document.scrollingElement ? 0 : scroller!.getBoundingClientRect().top;
      return { start: paneTop - listTop, size: scroller!.clientHeight };
    };

    const findPins = () => {
      const selection = window.getSelection();
      const active = document.activeElement;
      // The cross-origin player keeps running when focus moves back to Bubble.
      if (active instanceof HTMLIFrameElement && list.contains(active))
        activeEmbed.current = active;
      if (!activeEmbed.current?.isConnected) activeEmbed.current = undefined;
      const endpoints = selection?.isCollapsed ? [] : [selection?.anchorNode, selection?.focusNode];
      const pinned: number[] = [];
      for (const [id, row] of rows.current) {
        if (
          row.contains(active) ||
          row.contains(activeEmbed.current ?? null) ||
          endpoints.some((node) => node && row.contains(node)) ||
          row.querySelector("dialog[open], [data-feed-keep]")
        ) {
          const index = geometry.indices.get(id);
          if (index !== undefined) pinned.push(index);
        }
      }
      return pinned;
    };

    const update = (sync: boolean, extraIndex?: number) => {
      const posts = currentPosts.current;
      const viewport = getViewport();
      let start = viewport.start;
      const { size } = viewport;
      const atBottom =
        start > 0 && scroller!.scrollHeight - scroller!.clientHeight - scroller!.scrollTop < 2;
      let adjustment = 0;
      const anchor = start > 0 ? geometry.indexAt(start) : -1;
      let changedHeight = false;
      for (const [id, { node, height }] of pendingSizes) {
        const index = geometry.indices.get(id);
        if (index === undefined || rows.current.get(id) !== node || height <= gutter) continue;
        if (!measurement.heights.has(id) && measurement.heights.size >= 4096) {
          measurement.heights.delete(measurement.heights.keys().next().value!);
        }
        measurement.heights.set(id, height);
        const delta = geometry.measure(index, height);
        if (index < anchor) adjustment += delta;
        changedHeight ||= Math.abs(delta) > 0.1;
      }
      pendingSizes.clear();

      const saved =
        pendingRestore.current ??
        (previousGeometry.current !== geometry && scroller!.scrollTop > 1
          ? lastAnchor.current
          : null);
      previousGeometry.current = geometry;
      if (saved) {
        const index = geometry.indices.get(saved.id);
        const restoreIndex = pendingRestore.current
          ? (index ?? Math.min(saved.index, posts.length - 1))
          : index;
        if (restoreIndex !== undefined)
          adjustment = geometry.offset(restoreIndex) - saved.offset - start;
        pendingRestore.current = null;
      }
      start += adjustment;
      const first = geometry.indexAt(start - size);
      const last = geometry.indexAt(start + size * 2);
      const current = viewRef.current;
      // Keep the existing range until the viewport approaches its buffered edge.
      const safeFirst = geometry.indexAt(start - size / 3);
      const safeLast = geometry.indexAt(start + size * 1.33);
      const previous = range.current;
      const buffered =
        previous &&
        !saved &&
        safeFirst >= previous.first &&
        safeLast <= previous.last &&
        previous.last < posts.length &&
        previous.last - previous.first <= last - first + 12;
      const startIndex = buffered ? previous.first : first;
      const endIndex = buffered ? previous.last : last;
      range.current = { first: startIndex, last: endIndex };
      const indices = new Set(
        Array.from({ length: endIndex - startIndex + 1 }, (_, i) => startIndex + i),
      );
      findPins().forEach((index) => indices.add(index));
      if (extraIndex !== undefined) indices.add(extraIndex);
      const next = [...indices].sort((a, b) => a - b);
      const rangeChanged =
        next.length !== current.length || next.some((index, i) => index !== current[i]);
      // Measured rows already occupy their real height in flow. Only changing
      // which rows are represented by spacers requires a React commit.
      if (rangeChanged) {
        viewRef.current = next;
        if (sync) flushSync(() => setView(next));
        else setView(next);
      }
      if (
        sync &&
        atBottom &&
        !saved &&
        endIndex === posts.length - 1 &&
        (changedHeight || rangeChanged)
      ) {
        scroller!.scrollTo({ top: scroller!.scrollHeight, behavior: "instant" });
        start = getViewport().start;
      } else if (Math.abs(adjustment) >= 0.5) {
        scroller!.scrollBy({ top: adjustment, behavior: "instant" });
      }
      const visible = geometry.indexAt(start);
      const nextAnchor =
        start > 0 && posts[visible]
          ? { id: posts[visible].id, index: visible, offset: geometry.offset(visible) - start }
          : null;
      lastAnchor.current = nextAnchor;
      remember(nextAnchor);
    };

    const schedule = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          update(true);
        });
    };
    const reset = () => {
      pendingRestore.current = null;
      lastAnchor.current = null;
      range.current = undefined;
      schedule();
    };
    let selecting = !window.getSelection()?.isCollapsed;
    const selectionChanged = () => {
      const selection = window.getSelection();
      const extended = Boolean(
        selection &&
        !selection.isCollapsed &&
        (list.contains(selection.anchorNode) || list.contains(selection.focusNode)),
      );
      if (selecting !== extended) {
        selecting = extended;
        schedule();
      }
    };
    const resize = () => {
      const nextScroller = getPageScroller();
      if (nextScroller !== scroller && nextScroller) {
        scrollTarget.removeEventListener("scroll", schedule);
        scroller = nextScroller;
        bindScroll();
      }
      schedule();
    };
    function bindScroll() {
      scrollTarget = scroller === document.scrollingElement ? window : scroller!;
      scrollTarget.addEventListener("scroll", schedule, { passive: true });
    }
    const tab = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || event.defaultPrevented || !(event.target instanceof HTMLElement))
        return;
      const row = event.target.closest<HTMLElement>("[data-feed-row]");
      if (!row || row.querySelector("dialog[open]")) return;
      const controls = rowControls(row);
      if (event.target !== (event.shiftKey ? controls[0] : controls.at(-1))) return;
      const index = geometry.indices.get(row.dataset.feedRow ?? "");
      if (index === undefined) return;
      const next = index + (event.shiftKey ? -1 : 1);
      const adjacentPost = currentPosts.current[next];
      if (!adjacentPost || rows.current.has(adjacentPost.id)) return;
      update(true, next);
      const adjacent = rows.current.get(adjacentPost.id);
      if (!adjacent) return;
      const candidates = rowControls(adjacent);
      const control = event.shiftKey ? candidates.at(-1) : candidates[0];
      if (control) {
        event.preventDefault();
        control.focus();
        schedule();
      }
    };
    const sizes = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === list) {
          const nextWidth = Math.round(entry.contentRect.width);
          if (nextWidth && nextWidth !== measurement.width) {
            if (measurement.width) measurement.heights.clear();
            measurement.width = nextWidth;
            refreshLayoutMeasurement({ ...measurement });
          }
        } else {
          const row = entry.target as HTMLDivElement;
          const height = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height + gutter;
          pendingSizes.set(row.dataset.feedRow!, { node: row, height });
        }
      }
      schedule();
    });
    observer.current = sizes;
    sizes.observe(list);
    for (const row of rows.current.values()) sizes.observe(row, { box: "border-box" });
    bindScroll();
    window.addEventListener("resize", resize);
    window.addEventListener("blur", schedule);
    window.addEventListener(FEED_SCROLL_RESET, reset);
    window.visualViewport?.addEventListener("resize", schedule);
    list.addEventListener("keydown", tab);
    list.addEventListener("focusout", schedule);
    list.addEventListener("click", schedule);
    document.addEventListener("selectionchange", selectionChanged);
    const fontChange = () => {
      measurement.heights.clear();
      refreshLayoutMeasurement({ ...measurement });
    };
    document.fonts.addEventListener("loadingdone", fontChange);
    update(false);
    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      observer.current = undefined;
      scrollTarget.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", resize);
      window.removeEventListener("blur", schedule);
      window.removeEventListener(FEED_SCROLL_RESET, reset);
      window.visualViewport?.removeEventListener("resize", schedule);
      list.removeEventListener("keydown", tab);
      list.removeEventListener("focusout", schedule);
      list.removeEventListener("click", schedule);
      document.removeEventListener("selectionchange", selectionChanged);
      document.fonts.removeEventListener("loadingdone", fontChange);
    };
  }, [geometry, measurement, remember]);

  useLayoutEffect(() => {
    for (const id of measurement.heights.keys()) {
      if (!geometry.indices.has(id)) measurement.heights.delete(id);
    }
  }, [geometry, measurement]);

  const visibleIndices = view.filter((index) => index < posts.length);
  let cursor = 0;
  return (
    <div className="feed-window" ref={root} data-feed-count={posts.length}>
      {visibleIndices.flatMap((index) => {
        const post = posts[index]!;
        const space = geometry.offset(index) - geometry.offset(cursor);
        cursor = index + 1;
        return [
          space > 0 && (
            <div key={`before-${post.id}`} aria-hidden="true" style={{ height: space }} />
          ),
          <Row key={post.id} post={post} session={session} pinTarget={pinTarget} attach={attach} />,
        ];
      })}
      {cursor < posts.length && (
        <div
          aria-hidden="true"
          style={{ height: geometry.offset(posts.length) - geometry.offset(cursor) }}
        />
      )}
    </div>
  );
}
