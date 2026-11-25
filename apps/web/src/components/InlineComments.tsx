import { COMMENT_MAX_LENGTH, displayNameOf, type CommentDTO, type MusicTrackDTO } from "@commune/shared";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAddComment, useComments, useDeleteComment, useSetCommentLike } from "../hooks/usePosts";
import { ProfileAvatar } from "./Avatar";
import CommentInput from "./CommentInput";
import Icon from "./Icon";
import { LinkedText, LinkPreview } from "./LinkContent";
import RepostButton from "./RepostButton";
import CommentReportDialog from "./CommentReportDialog";
import { useAuth } from "../store/auth";
import { useImageDraft } from "../hooks/useImageDraft";
import MusicAttachmentPicker from "./MusicAttachmentPicker";
import MusicAttachments from "./MusicAttachments";
import PostImages from "./PostImages";
import { clipboardImageFiles } from "../lib/images";

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
export default function InlineComments({ postId, focusedId, open = true }: { postId: string; focusedId?: string; open?: boolean }) {
  const comments = useComments(postId, focusedId, open);
  const add = useAddComment(postId);
  const [content, setContent] = useState("");
  const images = useImageDraft(false, 2);
  const [tracks, setTracks] = useState<MusicTrackDTO[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const [replying, setReplying] = useState<CommentDTO>();
  const field = useRef<HTMLTextAreaElement>(null);
  const section = useRef<HTMLElement>(null);
  const prefix = useId();
  const { rows, byId } = useMemo(() => orderComments([...(comments.data?.pages ?? [])].reverse().flat()), [comments.data]);
  const focused = Boolean(focusedId && byId.has(focusedId));
  useEffect(() => {
    if (focused) section.current?.querySelector(".repost-linked-comment")?.scrollIntoView({ block: "center" });
  }, [focused, focusedId]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if ((!content.trim() && !images.images.length && !tracks.length) || add.isPending || images.busy || !images.ready) return;
    const name = replying && displayNameOf(replying.author);
    add.mutate({ content, imageUrls: images.images.map((image) => image.url!), musicTrackIds: tracks.map((track) => track.id), parentId: replying?.id, ...(name && content.startsWith(`${name},`) ? { mention: name } : {}) }, { onSuccess: () => {
      setContent((draft) => draft === content ? "" : draft);
      images.clear();
      setTracks([]);
      setReplying((comment) => comment?.id === replying?.id ? undefined : comment);
    } });
  };

  return (
    <section ref={section} className="inline-comments" aria-label="Комментарии">
      {(comments.isLoading || (comments.isFetching && rows.length === 0)) && <p role="status">Загрузка комментариев…</p>}
      {comments.isError && <p className="error" role="alert">{comments.error.message} <button type="button" className="link-btn" onClick={() => void comments.refetch()}>Попробовать снова</button></p>}
      {comments.isSuccess && !comments.isFetching && rows.length === 0 && <p className="muted">Комментариев пока нет.</p>}
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
            return `${name}, ${rest}`.slice(0, COMMENT_MAX_LENGTH);
          });
          setReplying(comment);
          field.current?.focus();
        }} />)}
      <form onSubmit={submit}>
        {replying && <div className="comment-reply-draft">
          <span>Ответ для {displayNameOf(replying.author)}</span>
          <button type="button" className="link-btn" onClick={() => { setReplying(undefined); field.current?.focus(); }}>Отменить</button>
        </div>}
        {images.images.length > 0 && <div className="image-draft">{images.images.map((image) => <div className="image-preview" key={image.id}><img src={image.preview} alt="Предпросмотр вложения" /><button type="button" className="image-remove" aria-label="Удалить изображение" onClick={() => images.remove(image.id)}>×</button>{image.pending && <span role="status">{image.progress === undefined ? "Подготовка…" : `Загрузка ${image.progress}%`}</span>}{image.error && <p role="alert">{image.error} <button type="button" onClick={() => images.retry(image)}>Повторить</button></p>}</div>)}</div>}
        {images.error && <p className="error" role="alert">{images.error}</p>}
        {tracks.map((track) => <div className="row" key={track.id}>{track.artist} — {track.title}<button type="button" onClick={() => setTracks((items) => items.filter((item) => item.id !== track.id))}>Убрать</button></div>)}
        <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden onChange={(event) => { const selected = Array.from(event.target.files ?? []); event.target.value = ""; if (selected.length) images.add(selected); }} />
        <CommentInput ref={field} value={content} onChange={setContent} pending={add.isPending || images.busy} canSubmit={Boolean(content.trim() || images.images.length || tracks.length) && images.ready} replying={Boolean(replying)} onImage={() => file.current?.click()} onMusic={() => setPickerOpen(true)} onPaste={(event) => {
          const files = clipboardImageFiles(event.clipboardData);
          if (!files.length) return;
          if (!event.clipboardData.getData("text/plain")) event.preventDefault();
          if (!add.isPending && !images.busy) images.add(files);
        }} />
        {add.isError && <p className="error" role="alert">{add.error.message}</p>}
      </form>
      {pickerOpen && <MusicAttachmentPicker selected={tracks} onChange={setTracks} maxSelection={2} onClose={() => setPickerOpen(false)} />}
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
  const remove = useDeleteComment(comment.postId);
  const { user } = useAuth();
  const trigger = useRef<HTMLButtonElement>(null);
  const [reporting, setReporting] = useState(false);
  return (
    <div id={`${prefix}-${comment.id}`} tabIndex={-1} className={`inline-comment${comment.parentId ? " inline-comment--reply" : ""}${focused ? " repost-linked-comment" : ""}`}>
      <ProfileAvatar username={comment.author.username} displayName={comment.author.displayName} url={comment.author.avatarUrl} frame={comment.author.avatarFrame} size={28} />
      <div>
        <div className="repost-comment-meta">
          <Link to={`/u/${comment.author.username}`}>{displayNameOf(comment.author)}</Link>
          <time className="muted inline-comment__time" dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}</time>
        </div>
        <p>{comment.mention && comment.content.startsWith(`${comment.mention.name},`) ? <>
          <Link to={`/u/${comment.mention.username}`}>{comment.mention.name}</Link><LinkedText text={comment.content.slice(comment.mention.name.length)} />
        </> : <LinkedText text={comment.content} />}</p><LinkPreview text={comment.content} />
        {Boolean(comment.imageUrls?.length) && <PostImages images={comment.imageUrls!} alt="Изображение комментария" mobileCarouselFrom={2} />}
        {Boolean(comment.musicAttachments?.length) && <MusicAttachments attachments={comment.musicAttachments!} source={`comment:${comment.id}`} />}
        <div className="comment-actions">
          <button type="button" className={`btn btn-ghost comment-like${comment.likedByMe ? " liked" : ""}`} disabled={like.isPending} aria-pressed={comment.likedByMe} aria-label={`Нравится · ${comment.likeCount}`} onClick={() => like.mutate({ id: comment.id, liked: !comment.likedByMe })}><Icon name="heart" size={15} filled={comment.likedByMe} /> {comment.likeCount}</button>
          <button type="button" className="btn btn-ghost" onClick={onReply}>Ответить{comment.replyCount ? ` · ${comment.replyCount}` : ""}</button>
          <RepostButton source={{ post: comment.postId, comment: comment.id }} />
          {user?.id !== comment.author.id && <button ref={trigger} type="button" className="btn btn-ghost comment-report" aria-label="Пожаловаться на комментарий" title="Пожаловаться на комментарий" onClick={() => setReporting(true)}><Icon name="flag" size={15} /></button>}
          {user?.id === comment.author.id && <button type="button" className="btn btn-ghost comment-report" aria-label="Удалить комментарий" title="Удалить комментарий" disabled={remove.isPending} onClick={() => { if (window.confirm("Удалить комментарий? Ответы сохранятся.")) remove.mutate(comment.id); }}><Icon name="trash" size={15} /></button>}
        </div>
        {reporting && trigger.current && <CommentReportDialog postId={comment.postId} commentId={comment.id} trigger={trigger.current} onClose={() => setReporting(false)} />}
        {like.error && <p role="alert" className="error">{like.error.message}</p>}
        {remove.error && <p role="alert" className="error">{remove.error.message}</p>}
      </div>
    </div>
  );
}
