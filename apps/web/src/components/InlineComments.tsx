import { displayNameOf, type CommentDTO } from "@commune/shared";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAddComment, useComments, useSetCommentLike } from "../hooks/usePosts";
import { ProfileAvatar } from "./Avatar";
import CommentInput from "./CommentInput";
import Icon from "./Icon";
import { LinkedText, LinkPreview } from "./LinkContent";
import RepostButton from "./RepostButton";
import CommentReportDialog from "./CommentReportDialog";
import { useAuth } from "../store/auth";

function orderComments(items: CommentDTO[]) {
  const byId = new Map(items.map((comment) => [comment.id, comment]));
  const children = new Map<string, CommentDTO[]>();
  const roots: CommentDTO[] = [];
  for (const comment of byId.values()) {
    if (comment.parentId && byId.has(comment.parentId)) {
      const replies = children.get(comment.parentId) ?? [];
      replies.push(comment);
      children.set(comment.parentId, replies);
    } else {
      roots.push(comment);
    }
  }
  const rows: CommentDTO[] = [];
  const visit = (comment: CommentDTO) => {
    rows.push(comment);
    children.get(comment.id)?.forEach(visit);
  };
  roots.forEach(visit);
  return { rows, byId };
}

/** Mounted on first expansion; retained to preserve the draft and cached discussion. */
export default function InlineComments({ postId, focusedId }: { postId: string; focusedId?: string }) {
  const comments = useComments(postId, focusedId);
  const add = useAddComment(postId);
  const [content, setContent] = useState("");
  const [replying, setReplying] = useState<CommentDTO>();
  const field = useRef<HTMLInputElement>(null);
  const section = useRef<HTMLElement>(null);
  const prefix = useId();
  const { rows, byId } = useMemo(() => orderComments([...(comments.data?.pages ?? [])].reverse().flat()), [comments.data]);
  const focused = Boolean(focusedId && byId.has(focusedId));
  useEffect(() => {
    if (focused) section.current?.querySelector(".repost-linked-comment")?.scrollIntoView({ block: "center" });
  }, [focused, focusedId]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!content.trim() || add.isPending) return;
    const name = replying && displayNameOf(replying.author);
    add.mutate({ content, parentId: replying?.id, ...(name && content.startsWith(`${name},`) ? { mention: name } : {}) }, { onSuccess: () => {
      setContent((draft) => draft === content ? "" : draft);
      setReplying((comment) => comment?.id === replying?.id ? undefined : comment);
    } });
  };

  return (
    <section ref={section} className="inline-comments" aria-label="Комментарии">
      {comments.isLoading && <p role="status">Загрузка комментариев…</p>}
      {comments.isError && <p className="error" role="alert">{comments.error.message} <button type="button" className="link-btn" onClick={() => void comments.refetch()}>Попробовать снова</button></p>}
      {comments.isSuccess && rows.length === 0 && <p className="muted">Комментариев пока нет.</p>}
      {comments.hasNextPage && <button type="button" className="btn btn-ghost" disabled={comments.isFetching} onClick={() => void comments.fetchNextPage()}>
        {comments.isFetchingNextPage ? "Загрузка…" : "Показать более ранние комментарии"}
      </button>}
      {rows.map((comment) => <CommentRow key={comment.id} comment={comment}
        prefix={prefix} focused={comment.id === focusedId}
        onReply={() => {
          const name = displayNameOf(comment.author);
          setContent((draft) => {
            const oldPrefix = replying ? `${displayNameOf(replying.author)}, ` : "";
            const rest = oldPrefix && draft.startsWith(oldPrefix) ? draft.slice(oldPrefix.length) : draft;
            return `${name}, ${rest}`.slice(0, 300);
          });
          setReplying(comment);
          field.current?.focus();
        }} />)}
      <form onSubmit={submit}>
        {replying && <div className="comment-reply-draft">
          <span>Ответ для {displayNameOf(replying.author)}</span>
          <button type="button" className="link-btn" onClick={() => { setReplying(undefined); field.current?.focus(); }}>Отменить</button>
        </div>}
        <CommentInput ref={field} value={content} onChange={setContent} pending={add.isPending} replying={Boolean(replying)} />
        {add.isError && <p className="error" role="alert">{add.error.message}</p>}
      </form>
    </section>
  );
}

function CommentRow({ comment, prefix, focused, onReply }: {
  comment: CommentDTO;
  prefix: string;
  focused: boolean;
  onReply: () => void;
}) {
  const like = useSetCommentLike(comment.postId);
  const { user } = useAuth();
  const trigger = useRef<HTMLButtonElement>(null);
  const [reporting, setReporting] = useState(false);
  return (
    <div id={`${prefix}-${comment.id}`} tabIndex={-1} className={`inline-comment${comment.parentId ? " inline-comment--reply" : ""}${focused ? " repost-linked-comment" : ""}`}>
      <ProfileAvatar username={comment.author.username} displayName={comment.author.displayName} url={comment.author.avatarUrl} frame={comment.author.avatarFrame} size={28} />
      <div>
        <div className="repost-comment-meta">
          <Link to={`/u/${comment.author.username}`}>{displayNameOf(comment.author)}</Link>
        </div>
        <p>{comment.mention && comment.content.startsWith(`${comment.mention.name},`) ? <>
          <Link to={`/u/${comment.mention.username}`}>{comment.mention.name}</Link><LinkedText text={comment.content.slice(comment.mention.name.length)} />
        </> : <LinkedText text={comment.content} />}</p><LinkPreview text={comment.content} />
        <div className="comment-actions">
          <time className="muted" dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString("ru-RU")}</time>
          <button type="button" className="btn btn-ghost" onClick={onReply}>Ответить{comment.replyCount ? ` · ${comment.replyCount}` : ""}</button>
          <RepostButton source={{ post: comment.postId, comment: comment.id }} />
          {user?.id !== comment.author.id && <button ref={trigger} type="button" className="btn btn-ghost" onClick={() => setReporting(true)}>Пожаловаться</button>}
          <button type="button" className={`btn btn-ghost comment-like${comment.likedByMe ? " liked" : ""}`} disabled={like.isPending} aria-pressed={comment.likedByMe} aria-label={`Нравится · ${comment.likeCount}`} onClick={() => like.mutate({ id: comment.id, liked: !comment.likedByMe })}><Icon name="heart" size={15} filled={comment.likedByMe} /> {comment.likeCount}</button>
        </div>
        {reporting && trigger.current && <CommentReportDialog postId={comment.postId} commentId={comment.id} trigger={trigger.current} onClose={() => setReporting(false)} />}
        {like.error && <p role="alert" className="error">{like.error.message}</p>}
      </div>
    </div>
  );
}
