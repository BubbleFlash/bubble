import { useId, useLayoutEffect, useRef, useState } from "react";
import { COMMUNITY_POST_LENGTH, PLUS_POST_LENGTH, type MusicTrackDTO, type PostDTO } from "@commune/shared";
import { useUpdateCommunityPost } from "../hooks/usePosts";
import { createImageDraftStore, useImageDraft } from "../hooks/useImageDraft";
import type { FeedEditorDraft } from "../lib/feedWindow";
import { assetUrl } from "../lib/api";
import MusicAttachmentPicker from "./MusicAttachmentPicker";
import EmojiInputButton from "./EmojiInputButton";
import Icon from "./Icon";
import TextareaResizeHandle from "./TextareaResizeHandle";

export default function CommunityPostEditor({ post, onClose, retained }: { post: PostDTO; onClose: () => void; retained?: FeedEditorDraft }) {
  const [content, setContent] = useState(retained?.content ?? post.content);
  const [adult, setAdult] = useState(retained?.adult ?? Boolean(post.adult));
  const [hideAuthor, setHideAuthor] = useState(retained?.hideAuthor ?? Boolean(post.hideAuthor));
  const [images, setImages] = useState(retained?.photos ?? (post.imageUrls?.length ? post.imageUrls : post.imageUrl ? [post.imageUrl] : []));
  const [music, setMusic] = useState(retained?.music ?? post.musicAttachments ?? []);
  const [newMusic, setNewMusic] = useState<MusicTrackDTO[]>(retained?.newMusic ?? []);
  const [musicOpen, setMusicOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const textId = useId();
  const [imageStore] = useState(() => retained && (retained.images ?? createImageDraftStore()));
  const imageDraft = useImageDraft(false, 10, imageStore);
  useLayoutEffect(() => {
    if (retained) Object.assign(retained, { content, adult, hideAuthor, photos: images, music, newMusic, images: imageStore });
  }, [retained, content, adult, hideAuthor, images, music, newMusic, imageStore]);
  const [attachmentError, setAttachmentError] = useState("");
  const update = useUpdateCommunityPost(post.id);
  const maxLength = post.community ? COMMUNITY_POST_LENGTH : PLUS_POST_LENGTH;
  const musicCount = music.length + newMusic.length;
  const imageCount = images.length + imageDraft.images.length;
  const valid = (content.trim() === post.content || content.trim().length <= maxLength)
    && Boolean(content.trim() || imageCount || musicCount || post.repost)
    && imageDraft.ready && !imageDraft.busy;
  const contentChanged = content.trim() !== post.content;
  const imagesChanged = images.length !== (post.imageUrls?.length || Number(Boolean(post.imageUrl))) || Boolean(imageDraft.images.length);
  const musicChanged = music.length !== (post.musicAttachments?.length ?? 0) || Boolean(newMusic.length);
  const changed = contentChanged || imagesChanged || musicChanged || adult !== Boolean(post.adult) || hideAuthor !== Boolean(post.hideAuthor);

  return (
    <form className="community-post-editor" data-feed-keep={update.isPending || undefined} onSubmit={(event) => {
      event.preventDefault();
      if (!valid || !changed || update.isPending) return;
      const nextImages = [...images, ...imageDraft.images.map((image) => image.url!)];
      const nextTracks = [...music, ...newMusic].map(({ id }) => id);
      update.mutate({
        ...(contentChanged ? { content } : {}),
        ...(imagesChanged ? { imageUrls: nextImages } : {}),
        ...(musicChanged ? { musicTrackIds: nextTracks } : {}),
        ...(adult !== Boolean(post.adult) ? { adult } : {}),
        ...(hideAuthor !== Boolean(post.hideAuthor) ? { hideAuthor } : {}),
      }, { onSuccess: onClose });
    }}>
      <div>
        <label htmlFor={textId}>Текст записи</label>
        <div className="emoji-input-field"><textarea id={textId} ref={textRef} className="aero-input" rows={4} value={content} maxLength={Math.max(maxLength, post.content.length)} onChange={(event) => setContent(event.target.value)} disabled={update.isPending} />
          <EmojiInputButton field={textRef} value={content} onChange={setContent} maxLength={Math.max(maxLength, post.content.length)} disabled={update.isPending} />
          <TextareaResizeHandle field={textRef} disabled={update.isPending} />
        </div>
      </div>
      {content.trim() !== post.content && content.trim().length > maxLength && <p className="error">Текст должен содержать не более {maxLength} символов.</p>}
      {imageCount > 0 && <div className="image-draft">
        {images.map((url, index) => (
          <div className="image-preview" key={`${url}-${index}`}>
            <img src={assetUrl(url)} alt={`Изображение ${index + 1}`} />
            <button type="button" className="image-remove" aria-label={`Удалить изображение ${index + 1}`} disabled={update.isPending} onClick={() => setImages(images.filter((_, item) => item !== index))}>×</button>
          </div>
        ))}
        {imageDraft.images.map((image) => (
          <div className="image-preview" key={image.id}>
            <img src={image.preview} alt="Предпросмотр вложения" />
            <button type="button" className="image-remove" aria-label="Удалить новое изображение" disabled={update.isPending} onClick={() => imageDraft.remove(image.id)}>×</button>
            {image.pending && <span role="status">{image.progress === undefined ? "Подготовка…" : `Загрузка ${image.progress}%`}</span>}
            {image.error && <p className="error" role="alert">{image.error} <button type="button" onClick={() => imageDraft.retry(image)}>Повторить</button></p>}
          </div>
        ))}
      </div>}
      {musicCount > 0 && <div className="music-attachments">
        {[...music, ...newMusic].map((track) => (
          <div className="music-attachments__row" key={track.id}>
            <span>{"title" in track ? `${track.title} — ${track.artist}` : "Недоступный трек"}</span>
            <button type="button" className="btn btn-ghost" aria-label={`Удалить ${"title" in track ? track.title : "недоступный трек"}`} disabled={update.isPending} onClick={() => {
              setMusic(music.filter(({ id }) => id !== track.id));
              setNewMusic(newMusic.filter(({ id }) => id !== track.id));
            }}>×</button>
          </div>
        ))}
      </div>}
      {musicOpen && <MusicAttachmentPicker selected={newMusic} onClose={() => setMusicOpen(false)} onChange={(tracks) => {
        const existing = new Set(music.map(({ id }) => id));
        const additions = tracks.filter(({ id }) => !existing.has(id));
        if (music.length + additions.length > 10) {
          setAttachmentError("Можно прикрепить не более 10 треков.");
          return;
        }
        setAttachmentError("");
        setNewMusic(additions);
      }} />}
      <input ref={fileInput} type="file" multiple hidden accept="image/png,image/jpeg,image/gif,image/webp" onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        if (imageCount + files.length > 10) {
          setAttachmentError("Можно прикрепить не более 10 изображений.");
          return;
        }
        setAttachmentError("");
        if (files.length) imageDraft.add(files);
      }} />
      {(imageDraft.error || attachmentError) && <p className="error" role="alert">{imageDraft.error ?? attachmentError}</p>}
      {update.error && <p className="error" role="alert">{update.error.message}</p>}
      <label className="row"><input type="checkbox" checked={adult} onChange={(event) => setAdult(event.target.checked)} /> Фото 18+</label>
      {post.community && <label className="row"><input type="checkbox" checked={hideAuthor} onChange={(event) => setHideAuthor(event.target.checked)} /> Скрыть автора</label>}
      <div className="community-post-editor__actions">
        <button className="btn btn-ghost composer-attachment" type="button" aria-label="Прикрепить изображение" title="Прикрепить изображение" disabled={imageCount >= 10 || update.isPending} onClick={() => fileInput.current?.click()}><Icon name="image" size={20} /></button>
        <button className="btn btn-ghost composer-attachment" type="button" aria-label="Прикрепить музыку" title="Прикрепить музыку" disabled={musicCount >= 10 || update.isPending} onClick={() => setMusicOpen(true)}><Icon name="music" size={20} /></button>
        <button className="aero-button" type="button" disabled={update.isPending} onClick={onClose}>Отмена</button>
        <button className="aero-button" disabled={!valid || !changed || update.isPending}>{update.isPending ? "Сохранение…" : "Сохранить запись"}</button>
      </div>
    </form>
  );
}
