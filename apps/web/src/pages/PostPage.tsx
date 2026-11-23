import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { PostListSkeleton } from "../components/Skeleton";
import PostCard from "../components/PostCard";
import InlineComments from "../components/InlineComments";
import { useTrackView } from "../hooks/useBilling";
import { usePost } from "../hooks/usePosts";
import { useAuth } from "../store/auth";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { PostDTO } from "@commune/shared";
import { displayNameOf } from "@commune/shared";
import PostText from "../components/PostText";
import PostImages from "../components/PostImages";
import RepostCard from "../components/RepostCard";

function GuestPost({ id }: { id: string }) {
  const post = useQuery({ queryKey: ["public", "post", id], queryFn: () => api<PostDTO>(`/public/posts/${id}`) });
  return <><Link to="/explore" className="muted">← Вернуться к обзору</Link>
    {post.isLoading && <PostListSkeleton count={1} />}{post.isError && <p className="error center">Запись не найдена.</p>}
    {post.data && <article className="card post"><strong>{post.data.community?.name ?? displayNameOf(post.data.author)}</strong>
      {post.data.content && <PostText text={post.data.content} expandable={false} />}
      <PostImages images={post.data.imageUrls?.length ? post.data.imageUrls : post.data.imageUrl ? [post.data.imageUrl] : []} adult={post.data.adult} alt="Изображение записи" />
      {post.data.musicAttachments.map((track) => <p key={track.id}>{track.unavailable ? "Трек недоступен" : `${track.artist} — ${track.title}`}</p>)}
      {post.data.repost && <RepostCard preview={post.data.repost} source={`public:${id}`} guest />}
      {post.data.community && post.data.author.id && <p className="muted">{displayNameOf(post.data.author)}</p>}
    </article>}
  </>;
}

function MemberPostPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const origin = (location.state as { communityReturn?: { path: string; scrollY: number; mainScroll: number; postId?: string; postTop?: number } } | null)?.communityReturn;
  const communityReturn = origin && /^\/c\/[^/?#]+$/.test(origin.path) && Number.isFinite(origin.scrollY) && Number.isFinite(origin.mainScroll) ? origin : undefined;
  const post = usePost(id);
  useTrackView(id);

  return (
    <>
      <Link to={communityReturn?.path ?? "/"} state={communityReturn ? { restoreCommunityScroll: communityReturn } : undefined} className="muted">{communityReturn ? "← Вернуться в сообщество" : "← Вернуться к ленте"}</Link>
      {post.isLoading && <PostListSkeleton count={1} />}
      {post.isError && <p className="error center">Запись не найдена.</p>}
      {post.data && <>
        <PostCard post={post.data} expandable={false} />
        <InlineComments key={id} postId={id} focusedId={params.get("comment") ?? undefined} />
      </>}
    </>
  );
}

export default function PostPage() {
  const { user, loading } = useAuth();
  const { id = "" } = useParams();
  if (loading) return <PostListSkeleton count={1} />;
  return user ? <MemberPostPage /> : <GuestPost id={id} />;
}
