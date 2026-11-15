import { displayNameOf, type RepostPreviewDTO } from "@commune/shared";
import { Link } from "react-router-dom";
import Avatar, { ProfileAvatar } from "./Avatar";
import Icon from "./Icon";
import ImageGallery from "./ImageGallery";
import { LinkedText, LinkPreview } from "./LinkContent";
import MusicAttachments from "./MusicAttachments";

export default function RepostCard({
  preview,
  source,
  guest = false,
}: {
  preview: RepostPreviewDTO;
  source: string;
  guest?: boolean;
}) {
  const postLink = (id: string, commentId?: string) =>
    guest ? "/login" : `/posts/${id}${commentId ? `?comment=${commentId}#comment-${commentId}` : ""}`;

  if (preview.kind === "unavailable") {
    return <div className="repost-card repost-card--notice"><Icon name="lock" size={17} /> Исходная запись или комментарий недоступны.</div>;
  }
  if (preview.kind === "link") {
    return <div className="repost-card repost-card--notice"><Link to={postLink(preview.postId)}>Открыть предыдущую запись</Link></div>;
  }

  const { author } = preview;
  return (
    <aside className="repost-card" aria-label={preview.kind === "comment" ? "Цитата комментария" : "Исходная запись"}>
      <div className="repost-card__header">
        {preview.kind === "post" && preview.community ? <Link to={`/c/${preview.community.slug}`}><Avatar username={preview.community.slug} displayName={preview.community.name} url={preview.community.avatarUrl} size={30} /></Link> : <ProfileAvatar username={author.username} displayName={author.displayName} url={author.avatarUrl} frame={author.avatarFrame} size={30} />}
        <div>
          {preview.kind === "post" && preview.community ? <Link to={`/c/${preview.community.slug}`} className="user-link">{preview.community.name}</Link> : <Link to={`/u/${author.username}`} className="user-link">{displayNameOf(author)}</Link>}
          <Link className="repost-card__date" to={postLink(preview.postId, preview.kind === "comment" ? preview.commentId : undefined)}>
            {preview.kind === "comment" ? "Комментарий" : "Запись"} · <time dateTime={preview.createdAt}>{new Date(preview.createdAt).toLocaleDateString("ru-RU")}</time>
          </Link>
        </div>
      </div>
      {preview.content && <><p className="post-body"><LinkedText text={preview.content} /></p><LinkPreview text={preview.content} /></>}
      {preview.kind === "post" && (
        <>
          {preview.imageUrls.length > 0 && <ImageGallery images={preview.imageUrls} alt={`Изображение пользователя ${displayNameOf(author)}`} />}
          {preview.musicAttachments.length > 0 && (
            guest
              ? preview.musicAttachments.map((track) => <p className="muted" key={track.id}>{track.unavailable ? "Трек недоступен" : `${track.artist} — ${track.title}`}</p>)
              : <MusicAttachments attachments={preview.musicAttachments} source={`${source}:${preview.postId}`} />
          )}
          {preview.repost && <RepostCard preview={preview.repost} source={source} guest={guest} />}
          {preview.community && <p className="muted"><Link to={`/u/${author.username}`}>{displayNameOf(author)}</Link></p>}
        </>
      )}
    </aside>
  );
}
