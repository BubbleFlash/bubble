import PostCard from "./PostCard";
import { PostListSkeleton } from "./Skeleton";
import { useLoadMoreOnVisible } from "../hooks/useInfiniteScroll";
import type { useFeed } from "../hooks/usePosts";

/** Renders any infinite post query: loading, error, empty state, posts and "Загрузить ещё". */
export default function PostList({
  query,
  emptyMessage,
  inlineComments = false,
  pinTarget,
  communitySource,
}: {
  query: ReturnType<typeof useFeed>;
  emptyMessage: string;
  inlineComments?: boolean;
  pinTarget?: string;
  communitySource?: string;
}) {
  const posts = query.data?.pages.flatMap((p) => p.items) ?? [];
  const { hasNextPage, isFetching, isFetchingNextPage, isError, fetchNextPage } = query;
  // Fetch the next page before the reader reaches the end.
  const sentinel = useLoadMoreOnVisible(
    () => void fetchNextPage({ cancelRefetch: false }),
    hasNextPage && !isFetching && !isError,
  );

  return (
    <>
      {query.isLoading && <PostListSkeleton />}
      {query.isError && <p className="error center">{query.error.message}</p>}
      {query.isSuccess && posts.length === 0 && <p className="muted center">{emptyMessage}</p>}
      {posts.map((post) => (
        <PostCard key={post.id} post={post} inlineComments={inlineComments} pinTarget={pinTarget} communitySource={communitySource} />
      ))}
      {isFetchingNextPage && <PostListSkeleton count={1} />}
      {query.hasNextPage && <div ref={sentinel} aria-hidden="true" />}
      {query.hasNextPage && !isFetchingNextPage && (
        <button className="btn btn-ghost block" disabled={isFetching} onClick={() => void fetchNextPage({ cancelRefetch: false })}>
          Загрузить ещё
        </button>
      )}
    </>
  );
}
