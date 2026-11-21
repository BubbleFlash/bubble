import { displayNameOf } from "@commune/shared";
import { pluralRu } from "../lib/plural";
import { memo, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { PostDTO } from "@commune/shared";
import { useAuth } from "../store/auth";
import { useDeletePost, useModeratePost, useSetPostLike } from "../hooks/usePosts";
import Avatar, { ProfileAvatar } from "./Avatar";
import Icon from "./Icon";
import PlusBadge from "./PlusBadge";
import ReportForm from "./ReportForm";
import InlineComments from "./InlineComments";
import MusicAttachments from "./MusicAttachments";
import PostImages from "./PostImages";
import PostText from "./PostText";
import RepostButton from "./RepostButton";
import RepostCard from "./RepostCard";
import CommunityPostEditor from "./CommunityPostEditor";
import AeroTitlebar from "./AeroTitlebar";
import { useDialogBackdrop } from "../hooks/useDialogBackdrop";
import { violationReasons } from "../lib/moderationReasons";

const relativeTime = new Intl.RelativeTimeFormat("ru", { numeric: "always" });
export function timeAgo(iso: string): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return relativeTime.format(-seconds, "second");
  if (seconds < 3600) return relativeTime.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86400) return relativeTime.format(-Math.floor(seconds / 3600), "hour");
  return relativeTime.format(-Math.floor(seconds / 86400), "day");
}

export function postTime(iso: string): string {
  if (Date.now() - new Date(iso).getTime() < 86400000) return timeAgo(iso);
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

export default memo(function PostCard({ post, inlineComments = false, expandable = true, pinTarget }: { post: PostDTO; inlineComments?: boolean; expandable?: boolean; pinTarget?: string }) {
  const { user } = useAuth();
  const like = useSetPostLike();
  const del = useDeletePost();
  const moderate = useModeratePost();
  const cache = useQueryClient();
  const pin = useMutation({
    mutationFn: () => api<void>(pinTarget === "/admin/feed-pin" ? `${pinTarget}/${post.id}` : `${pinTarget}/posts/${post.id}/pin`, { method: post.pinned ? "DELETE" : "PUT" }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["feed"] }),
  });
  const [moderating, setModerating] = useState(false);
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { if (moderating) dialog.current?.showModal(); }, [moderating]);
  const backdrop = useDialogBackdrop(() => { if (!moderate.isPending) setModerating(false); });
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsMounted, setCommentsMounted] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) setMenuOpen(false); };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [menuOpen]);
  const mute = useMutation({
    mutationFn: ({ kind, name }: { kind: "users" | "communities"; name: string }) => api(`/feed-mutes/${kind}/${encodeURIComponent(name)}`, { method: "PUT" }),
    onSuccess: () => { setMenuOpen(false); void cache.invalidateQueries({ queryKey: ["feed"] }); void cache.invalidateQueries({ queryKey: ["feed-mute"] }); },
  });
  const [editing, setEditing] = useState(false);
  const [editExpired, setEditExpired] = useState(() => Date.now() - new Date(post.createdAt).getTime() >= 5 * 60_000);
  useEffect(() => {
    const remaining = new Date(post.createdAt).getTime() + 5 * 60_000 - Date.now();
    if (remaining <= 0) { setEditExpired(true); return; }
    setEditExpired(false);
    const timer = window.setTimeout(() => setEditExpired(true), remaining);
    return () => window.clearTimeout(timer);
  }, [post.createdAt]);
  const mine = user?.id === post.author.id;
  const isAdmin = user?.role === "admin";
  const staffRemoval = !mine && (isAdmin || user?.role === "moderator");
  const canDelete = isAdmin || staffRemoval || (post.community ? post.communityActions?.delete : mine);
  const canEdit = Boolean(post.communityActions?.edit) || Boolean(!post.community && mine && !editExpired);
  const showEditor = editing && (canEdit || (!post.community && mine));

  return (
    <article className={`card post post-head${inlineComments ? " feed-post" : ""}`}>
      {post.community ? <Link to={`/c/${post.community.slug}`} className="profile-avatar-link"><Avatar username={post.community.slug} displayName={post.community.name} url={post.community.avatarUrl} /></Link> : <ProfileAvatar username={post.author.username} displayName={post.author.displayName} url={post.author.avatarUrl} frame={post.author.avatarFrame} online={post.author.online} />}
      <div className="post-controls">
        {pinTarget && post.canPin && <button type="button" className="btn btn-ghost post-report" title={post.pinned ? "Открепить запись" : "Закрепить запись"} aria-label={post.pinned ? "Открепить запись" : "Закрепить запись"} disabled={pin.isPending} onClick={() => pin.mutate()}><Icon name="pin" size={18} /></button>}
        {canDelete && <button type="button" className="btn btn-ghost danger post-report" title="Удалить запись" aria-label="Удалить запись" disabled={del.isPending || moderate.isPending} onClick={() => { if (staffRemoval) { setReason(""); setCustomReason(""); moderate.reset(); setModerating(true); } else if (window.confirm("Удалить эту запись?")) del.mutate(post.id); }}><Icon name="trash" size={18} /></button>}
        {(!mine || post.community) && <div className="post-options" ref={menu}>
          <button type="button" className="btn btn-ghost post-report" title="Действия с записью" aria-label="Действия с записью" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            {/* Material Symbols more_horiz, see docs/licenses/material-symbols.txt. */}
            <svg width="24" height="24" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><circle cx="240" cy="-480" r="80"/><circle cx="480" cy="-480" r="80"/><circle cx="720" cy="-480" r="80"/></svg>
          </button>
          {menuOpen && <div className="post-options__menu" role="menu">
            {!mine && <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setReporting(true); }}>Пожаловаться</button>}
            {!post.community && !mine && post.author.username && <button type="button" role="menuitem" disabled={mute.isPending} onClick={() => mute.mutate({ kind: "users", name: post.author.username })}>Скрыть публикации пользователя</button>}
            {post.community && <button type="button" role="menuitem" disabled={mute.isPending} onClick={() => mute.mutate({ kind: "communities", name: post.community!.slug })}>Скрыть публикации сообщества</button>}
          </div>}
        </div>}
      </div>
      <div className="post-main">
        <div className="post-meta">
          {post.community ? <Link to={`/c/${post.community.slug}`} className="user-link">{post.community.name}</Link> : <>
            <Link to={`/u/${post.author.username}`} className="user-link">{displayNameOf(post.author)}</Link>
            <PlusBadge plus={post.author.plus} />
          </>}
          {inlineComments ? (
            <span className="muted">· <Link className="feed-post-time" to={`/posts/${post.id}`} aria-label={`Открыть публикацию ${displayNameOf(post.author)} от ${new Date(post.createdAt).toLocaleString("ru-RU")}`}>
              <time dateTime={post.createdAt}>{postTime(post.createdAt)}</time>
            </Link></span>
          ) : <span className="muted">· {postTime(post.createdAt)}</span>}
          {post.visibility === "private" && <span className="repost-private"><Icon name="lock" size={14} /> Только я</span>}
          {post.visibility === "friends" && <span className="repost-private"><Icon name="lock" size={14} /> Только друзья</span>}
        </div>
        {post.pinned && <span className="muted"><Icon name="pin" size={14} /> Закреплено</span>}
        {showEditor ? <CommunityPostEditor post={post} onClose={() => setEditing(false)} /> : <>
          {post.content && <PostText text={post.content} expandable={expandable} />}
          {(post.imageUrls?.length || post.imageUrl) && <PostImages images={post.imageUrls?.length ? post.imageUrls : [post.imageUrl!]} adult={post.adult} alt={`Изображение пользователя ${displayNameOf(post.author)}`} />}
          {post.musicAttachments?.length > 0 && <MusicAttachments attachments={post.musicAttachments} source={`post:${post.id}`} />}
        </>}
        {post.repost && <RepostCard preview={post.repost} source={`post-repost:${post.id}`} />}
        {post.community && post.author.id && <p className="muted community-post-author">
          <Link to={`/u/${post.author.username}`}>{displayNameOf(post.author)}</Link>
          {post.hideAuthor && <span title="Автор скрыт для остальных пользователей" aria-label="Автор скрыт для остальных пользователей"><Icon name="eye-off" size={15} /></span>}
        </p>}
        <div className="post-actions">
          <button
            className={`btn btn-ghost ${post.likedByMe ? "liked" : ""}`}
            onClick={() => like.mutate({ id: post.id, liked: !post.likedByMe })}
            disabled={like.isPending || post.likePostId === null}
            aria-label={post.likePostId === null ? "Исходная публикация недоступна" : `Нравится · ${post.likeCount}`}
            aria-pressed={post.likedByMe}
          >
            <Icon name="heart" size={19} filled={post.likedByMe} />
            <span>{post.likeCount}</span>
          </button>
          {inlineComments ? <button type="button" className="btn btn-ghost" aria-label={`${post.commentCount} ${pluralRu(post.commentCount, "комментарий", "комментария", "комментариев")}`} aria-expanded={commentsOpen} onClick={() => { setCommentsMounted(true); setCommentsOpen(v => !v); }}><Icon name="comment" size={19} /><span>{post.commentCount}</span></button> : <Link className="btn btn-ghost" to={`/posts/${post.id}`}>
            <Icon name="comment" size={19} />
            <span>{post.commentCount}</span>
          </Link>}
          <RepostButton source={{ post: post.id }} count={post.repostCount ?? 0} />
          {canEdit && !showEditor && <button type="button" className="btn btn-ghost" aria-label="Редактировать запись" title="Редактировать запись" onClick={() => setEditing(true)}><Icon name="pencil" size={18} /></button>}
        </div>
        {del.error && <p className="error" role="alert">{del.error.message}</p>}
        {pin.error && <p className="error" role="alert">{pin.error.message}</p>}
        {mute.error && <p className="error" role="alert">{mute.error.message}</p>}
        {moderating && <dialog ref={dialog} {...backdrop} className="aero-dialog moderation-dialog post-moderation-dialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!moderate.isPending) setModerating(false); }}>
          <AeroTitlebar closeLabel="Закрыть окно" onClose={() => { if (!moderate.isPending) setModerating(false); }}><h2 id={titleId}>Удалить запись</h2></AeroTitlebar>
          <form className="aero-dialog__body moderation-action" onSubmit={(event) => { event.preventDefault(); const selected = reason === "other" ? customReason.trim() : reason; if (selected) moderate.mutate({ id: post.id, reason: selected }, { onSuccess: () => setModerating(false) }); }}>
            <p>Запись будет удалена без возможности восстановления. Причина сохранится в журнале модерации.</p>
            <label>Причина<select required value={reason} onChange={(event) => setReason(event.target.value)}><option value="">Выберите причину</option>{violationReasons.map((option) => <option key={option} value={option}>{option}</option>)}<option value="other">Другая причина</option></select></label>
            {reason === "other" && <label>Укажите причину<textarea required maxLength={500} value={customReason} onChange={(event) => setCustomReason(event.target.value)} /></label>}
            <div className="moderation-buttons"><button className="btn" disabled={!reason || (reason === "other" && !customReason.trim()) || moderate.isPending}>Удалить</button><button type="button" className="btn btn-outline" disabled={moderate.isPending} onClick={() => setModerating(false)}>Отмена</button></div>
            {moderate.error && <p className="error" role="alert">{moderate.error.message}</p>}
          </form>
        </dialog>}
        {like.error && <p className="error" role="alert">{like.error.message}</p>}
        {inlineComments && (
          <div className={`comments-disclosure${commentsOpen ? " is-open" : ""}`} aria-hidden={!commentsOpen} ref={(node) => { node?.toggleAttribute("inert", !commentsOpen); }}>
            <div className="comments-disclosure-inner">{commentsMounted && <InlineComments postId={post.id} />}</div>
          </div>
        )}
        {reporting && <ReportForm postId={post.id} onClose={() => setReporting(false)} />}
      </div>
    </article>
  );
});
