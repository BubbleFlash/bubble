import type { CommentDTO, MusicTrackDTO, PostDTO } from "@commune/shared";
import type { ImageDraftStore } from "../hooks/useImageDraft";
import type { FeedType } from "../hooks/usePosts";
import { createContext } from "react";

export type FeedCardState = {
  commentsOpen?: boolean;
  commentsMounted?: boolean;
  content?: string;
  replying?: CommentDTO;
  tracks?: MusicTrackDTO[];
  images?: ImageDraftStore;
  expanded?: boolean;
  slideUrl?: string;
  revealed?: boolean;
  editor?: FeedEditorDraft;
};

export type FeedEditorDraft = {
  content?: string;
  adult?: boolean;
  hideAuthor?: boolean;
  photos?: string[];
  music?: PostDTO["musicAttachments"];
  newMusic?: MusicTrackDTO[];
  images?: ImageDraftStore;
};

export type FeedAnchor = { id: string; offset: number; index: number };
export type FeedMeasurements = { width: number; heights: Map<string, number> };

export function createFeedSession() {
  const cards = new Map<string, FeedCardState>();
  const history = new Map<string, { tab: FeedType; anchor: FeedAnchor | null }>();
  const measurements: Record<FeedType, FeedMeasurements> = {
    all: { width: 0, heights: new Map() },
    following: { width: 0, heights: new Map() },
  };
  return {
    cards,
    history,
    measurements,
    remember(key: string, tab: FeedType, anchor: FeedAnchor | null) {
      history.delete(key);
      history.set(key, { tab, anchor });
      if (history.size > 16) history.delete(history.keys().next().value!);
    },
    dispose() {
      for (const card of cards.values()) {
        card.images?.dispose();
        card.editor?.images?.dispose();
      }
      cards.clear();
      history.clear();
      for (const measurement of Object.values(measurements)) measurement.heights.clear();
    },
  };
}

export type FeedSession = ReturnType<typeof createFeedSession>;
export const FeedSessionContext = createContext<FeedSession | null>(null);

function estimate(post: PostDTO, width: number) {
  const lines = (post.content ?? "")
    .split("\n")
    .reduce(
      (sum, line) => sum + Math.max(1, Math.ceil(line.length / Math.max(20, (width - 26) / 7))),
      0,
    );
  const pictures = post.imageUrls?.length || (post.imageUrl ? 1 : 0);
  return (
    104 +
    Math.min(10, lines) * 20 +
    (pictures ? width * 0.56 : 0) +
    (post.repost ? 150 : 0) +
    (post.musicAttachments?.length ?? 0) * 55
  );
}

/** Prefix sums over row heights, including the trailing row gap. */
export class FeedGeometry {
  readonly indices = new Map<string, number>();
  private readonly sums: Float64Array;
  private readonly heights: Float64Array;

  constructor(posts: PostDTO[], measurement: FeedMeasurements) {
    this.heights = new Float64Array(posts.length);
    this.sums = new Float64Array(posts.length + 1);
    posts.forEach((post, index) => {
      this.indices.set(post.id, index);
      this.heights[index] =
        measurement.heights.get(post.id) ?? estimate(post, measurement.width || 500);
      const node = index + 1;
      this.sums[node] = this.sums[node]! + this.heights[index]!;
      const parent = node + (node & -node);
      if (parent < this.sums.length) this.sums[parent] = this.sums[parent]! + this.sums[node]!;
    });
  }

  offset(end: number) {
    let result = 0;
    for (let node = end; node > 0; node -= node & -node) result += this.sums[node]!;
    return result;
  }

  measure(index: number, height: number) {
    const delta = height - this.heights[index]!;
    this.heights[index] = height;
    for (let node = index + 1; node < this.sums.length; node += node & -node)
      this.sums[node] = this.sums[node]! + delta;
    return delta;
  }

  indexAt(offset: number) {
    let index = 0;
    let remaining = Math.max(0, offset);
    for (let step = 2 ** Math.floor(Math.log2(this.sums.length)); step >= 1; step /= 2) {
      const next = index + step;
      if (next >= this.sums.length || this.sums[next]! > remaining) continue;
      remaining -= this.sums[next]!;
      index = next;
    }
    return Math.min(this.heights.length - 1, index);
  }
}
