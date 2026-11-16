import { Link, useParams, useSearchParams } from "react-router-dom";
import { PostListSkeleton } from "../components/Skeleton";
import PostCard from "../components/PostCard";
import InlineComments from "../components/InlineComments";
import { useTrackView } from "../hooks/useBilling";
import { usePost } from "../hooks/usePosts";

export default function PostPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const post = usePost(id);
  useTrackView(id);

  return (
    <>
      <Link to="/" className="muted">← Вернуться к ленте</Link>
      {post.isLoading && <PostListSkeleton count={1} />}
      {post.isError && <p className="error center">Запись не найдена.</p>}
      {post.data && <>
        <PostCard post={post.data} />
        <InlineComments key={id} postId={id} focusedId={params.get("comment") ?? undefined} />
      </>}
    </>
  );
}
