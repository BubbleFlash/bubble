import OnlineStatus from "./OnlineStatus";
import { displayNameOf } from "@commune/shared";
import { pluralRu } from "../lib/plural";
import { memo, useState } from "react";
import { Link } from "react-router-dom";
import type { PostDTO } from "@commune/shared";
import { useAuth } from "../store/auth";
import { useDeletePost, useSetPostLike } from "../hooks/usePosts";
import Avatar, { ProfileAvatar } from "./Avatar";
import Icon from "./Icon";
import PlusBadge from "./PlusBadge";
import ReportForm from "./ReportForm";
import InlineComments from "./InlineComments";
import MusicAttachments from "./MusicAttachments";
import ImageGallery from "./ImageGallery";
import { LinkedText, LinkPreview } from "./LinkContent";
import RepostButton from "./RepostButton";
import RepostCard from "./RepostCard";
import CommunityPostEditor from "./CommunityPostEditor";

const relativeTime = new Intl.RelativeTimeFormat("ru", { numeric: "always" });
export function timeAgo(iso: string): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return relativeTime.format(-seconds, "second");
  if (seconds < 3600) return relativeTime.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86400) return relativeTime.format(-Math.floor(seconds / 3600), "hour");
  return relativeTime.format(-Math.floor(seconds / 86400), "day");
}

export default memo(function PostCard({ post, inlineComments = false }: { post: PostDTO; inlineComments?: boolean }) {
  const { user } = useAuth();
  const like = useSetPostLike();
  const del = useDeletePost();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsMounted, setCommentsMounted] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const mine = user?.id === post.author.id;
  const isAdmin = user?.role === "admin";
  const canDelete = isAdmin || (post.community ? post.communityActions?.delete : mine);
  const canEdit = Boolean(post.communityActions?.edit);
  const showEditor = editing && canEdit;

  return (
    <article className={`card post post-head${inlineComments ? " feed-post" : ""}`}>
      {post.community ? <Link to={`/c/${post.community.slug}`} className="profile-avatar-link"><Avatar username={post.community.slug} displayName={post.community.name} url={post.community.avatarUrl} /></Link> : <ProfileAvatar username={post.author.username} displayName={post.author.displayName} url={post.author.avatarUrl} frame={post.author.avatarFrame} />}
      <div className="post-controls">
        {canDelete && <button type="button" className="btn btn-ghost danger post-report" title="Удалить запись" aria-label="Удалить запись" disabled={del.isPending} onClick={() => window.confirm("Удалить эту запись?") && del.mutate(post.id)}><Icon name="trash" size={18} /></button>}
        {!mine && <button type="button" className="btn btn-ghost post-report" title="Пожаловаться" aria-label="Пожаловаться" aria-expanded={reporting} onClick={() => setReporting((r) => !r)}><Icon name="flag" size={18} /></button>}
      </div>
      <div className="post-main">
        <div className="post-meta">
          {post.community ? <Link to={`/c/${post.community.slug}`} className="user-link">{post.community.name}</Link> : <>
            <Link to={`/u/${post.author.username}`} className="user-link">{displayNameOf(post.author)}</Link>
            <OnlineStatus online={mine || post.author.online} />
            <PlusBadge plus={post.author.plus} />
          </>}
          {inlineComments ? (
            <span className="muted">· <Link className="feed-post-time" to={`/posts/${post.id}`} aria-label={`Открыть публикацию ${displayNameOf(post.author)} от ${new Date(post.createdAt).toLocaleString("ru-RU")}`}>
              <time dateTime={post.createdAt}>{timeAgo(post.createdAt)}</time>
            </Link></span>
          ) : <span className="muted">· {timeAgo(post.createdAt)}</span>}
          {post.visibility === "private" && <span className="repost-private"><Icon name="lock" size={14} /> Только я</span>}
          {post.visibility === "friends" && <span className="repost-private"><Icon name="lock" size={14} /> Только друзья</span>}
        </div>
        {showEditor ? <CommunityPostEditor post={post} onClose={() => setEditing(false)} /> : <>
          {post.content && <><p className="post-body"><LinkedText text={post.content} /></p><LinkPreview text={post.content} /></>}
          {(post.imageUrls?.length || post.imageUrl) && <ImageGallery images={post.imageUrls?.length ? post.imageUrls : [post.imageUrl!]} alt={`Изображение пользователя ${displayNameOf(post.author)}`} />}
          {post.musicAttachments?.length > 0 && <MusicAttachments attachments={post.musicAttachments} source={`post:${post.id}`} />}
        </>}
        {post.repost && <RepostCard preview={post.repost} source={`post-repost:${post.id}`} />}
        {post.community && <p className="muted community-post-author"><Link to={`/u/${post.author.username}`}>{displayNameOf(post.author)}</Link></p>}
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
