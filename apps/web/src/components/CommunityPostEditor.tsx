import { useRef, useState } from "react";
import { FREE_POST_LENGTH, PLUS_POST_LENGTH, type MusicTrackDTO, type PostDTO } from "@commune/shared";
import { useUpdateCommunityPost } from "../hooks/usePosts";
import { useImageDraft } from "../hooks/useImageDraft";
import { assetUrl } from "../lib/api";
import { useAuth } from "../store/auth";
import MusicAttachmentPicker from "./MusicAttachmentPicker";

export default function CommunityPostEditor({ post, onClose }: { post: PostDTO; onClose: () => void }) {
  const { user } = useAuth();
  const [content, setContent] = useState(post.content);
  const [images, setImages] = useState(post.imageUrls?.length ? post.imageUrls : post.imageUrl ? [post.imageUrl] : []);
  const [music, setMusic] = useState(post.musicAttachments ?? []);
  const [newMusic, setNewMusic] = useState<MusicTrackDTO[]>([]);
  const [musicOpen, setMusicOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageDraft = useImageDraft();
  const [attachmentError, setAttachmentError] = useState("");
  const update = useUpdateCommunityPost(post.id);
  const maxLength = user?.plus ? PLUS_POST_LENGTH : FREE_POST_LENGTH;
  const musicCount = music.length + newMusic.length;
  const imageCount = images.length + imageDraft.images.length;
  const valid = (content.trim() === post.content || content.trim().length <= maxLength)
    && Boolean(content.trim() || imageCount || musicCount || post.repost)
    && imageDraft.ready && !imageDraft.busy;

  return (
    <form className="community-post-editor" onSubmit={(event) => {
      event.preventDefault();
      if (!valid || update.isPending) return;
      const nextImages = [...images, ...imageDraft.images.map((image) => image.url!)];
      const nextTracks = [...music, ...newMusic].map(({ id }) => id);
      update.mutate({
        content,
        ...(images.length !== (post.imageUrls?.length || Number(Boolean(post.imageUrl))) || imageDraft.images.length ? { imageUrls: nextImages } : {}),
        ...(music.length !== post.musicAttachments?.length || newMusic.length ? { musicTrackIds: nextTracks } : {}),
      }, { onSuccess: onClose });
    }}>
      <label>
        Текст записи
        <textarea className="aero-input" rows={4} value={content} maxLength={Math.max(maxLength, post.content.length)} onChange={(event) => setContent(event.target.value)} disabled={update.isPending} />
      </label>
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
            {image.pending && <span role="status">Загрузка…</span>}
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
      <div className="community-post-editor__actions">
        <button className="aero-button" type="button" disabled={imageCount >= 10 || update.isPending} onClick={() => fileInput.current?.click()}>Добавить фото</button>
        <button className="aero-button" type="button" disabled={musicCount >= 10 || update.isPending} onClick={() => setMusicOpen(true)}>Добавить музыку</button>
        <button className="aero-button" type="button" disabled={update.isPending} onClick={onClose}>Отмена</button>
        <button className="aero-button" disabled={!valid || update.isPending}>{update.isPending ? "Сохранение…" : "Сохранить запись"}</button>
      </div>
    </form>
  );
}
