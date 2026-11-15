import { displayNameOf } from "@commune/shared";
import { useEffect, useState } from "react";
import { PostListSkeleton } from "../components/Skeleton";
import type { FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ProfileAvatar } from "../components/Avatar";
import PostCard, { timeAgo } from "../components/PostCard";
import PlusBadge from "../components/PlusBadge";
import CommentInput from "../components/CommentInput";
import { LinkedText, LinkPreview } from "../components/LinkContent";
import { useTrackView } from "../hooks/useBilling";
import { useAddComment, useComments, usePost } from "../hooks/usePosts";
import RepostButton from "../components/RepostButton";

export default function PostPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const commentId = params.get("comment");
  const post = usePost(id);
  useTrackView(id);
  const comments = useComments(id, commentId ?? undefined);
  const add = useAddComment(id);
  const [content, setContent] = useState("");
  const hasLinkedComment = comments.data?.some((comment) => comment.id === commentId);

  useEffect(() => {
    if (commentId && hasLinkedComment)
      document.getElementById(`comment-${commentId}`)?.scrollIntoView({ block: "center" });
  }, [commentId, hasLinkedComment]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    add.mutate(content, { onSuccess: () => setContent("") });
  };

  return (
    <>
      <Link to="/" className="muted">
        ← Вернуться к ленте
      </Link>
      {post.isLoading && <PostListSkeleton count={1} />}
      {post.isError && <p className="error center">Запись не найдена.</p>}
      {post.data && <PostCard post={post.data} />}

      {post.data && <form className="card composer" onSubmit={submit}>
        <CommentInput value={content} onChange={setContent} pending={add.isPending} />
        <div className="composer-footer">
          <span className="muted">{content.length}/300</span>
        </div>
        {add.isError && <p className="error">{add.error.message}</p>}
      </form>}

      {comments.data?.map((c) => (
        <div key={c.id} id={`comment-${c.id}`} className={`card comment post-head${commentId === c.id ? " repost-linked-comment" : ""}`}>
          <ProfileAvatar username={c.author.username} displayName={c.author.displayName} url={c.author.avatarUrl} frame={c.author.avatarFrame} size={32} />
          <div className="post-main">
            <div className="post-meta">
              <Link to={`/u/${c.author.username}`} className="user-link">
                {displayNameOf(c.author)}
              </Link>
              <PlusBadge plus={c.author.plus} />
              <span className="muted">· {timeAgo(c.createdAt)}</span>
              <RepostButton source={{ post: id, comment: c.id }} />
            </div>
            <p className="post-body"><LinkedText text={c.content} /></p><LinkPreview text={c.content} />
          </div>
        </div>
      ))}
    </>
  );
}
