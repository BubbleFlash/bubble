import { useRef, useState } from "react";
import type { ChangeEvent, ClipboardEvent, FormEvent } from "react";
import { useCreatePost } from "../hooks/usePosts";
import { useImageDraft } from "../hooks/useImageDraft";
import { useImageDrop } from "../hooks/useImageDrop";
import ImageDropHint from "./ImageDropHint";
import { COMMUNITY_POST_LENGTH, FREE_POST_LENGTH, PLUS_POST_LENGTH } from "@commune/shared";
import { useAuth } from "../store/auth";
import Avatar from "./Avatar";
import Icon from "./Icon";
import MusicAttachmentPicker from "./MusicAttachmentPicker";
import { LinkPreview } from "./LinkContent";
import type { MusicTrackDTO } from "@commune/shared";
import EmojiInputButton from "./EmojiInputButton";

export default function Composer({ communitySlug }: { communitySlug?: string }) {
  const { user } = useAuth();
  const maxLength = communitySlug ? COMMUNITY_POST_LENGTH : user?.plus ? PLUS_POST_LENGTH : FREE_POST_LENGTH;
  const [content, setContent] = useState("");
  const [music, setMusic] = useState<MusicTrackDTO[]>([]);
  const [musicPickerOpen, setMusicPickerOpen] = useState(false);
  const imageDraft = useImageDraft();
  const [privatePost, setPrivatePost] = useState(false);
  const [hideAuthor, setHideAuthor] = useState(false);
  const [adult, setAdult] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const create = useCreatePost();
  const drop = useImageDrop(imageDraft.add, create.isPending);
  const pickImage = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) imageDraft.add(files);
  };
  const imageFiles = (files: FileList | null | undefined) => Array.from(files ?? []).filter((file) => file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(file.name));
  const onPaste = (e: ClipboardEvent) => { const files = imageFiles(e.clipboardData.files); if (files.length) { e.preventDefault(); imageDraft.add(files); } };

  const canPost = (content.trim().length > 0 || imageDraft.images.length > 0 || music.length > 0) && !imageDraft.busy && imageDraft.ready;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canPost || create.isPending) return;
    create.mutate(
      {
        content,
        imageUrls: imageDraft.images.map((image) => image.url!),
        musicTrackIds: music.map((track) => track.id),
        adult,
        ...(communitySlug ? { hideAuthor } : {}),
        ...(communitySlug ? { community: communitySlug } : {}),
        ...(privatePost && !communitySlug ? { visibility: "friends" } : {}),
      },
      {
        onSuccess: () => {
          if (textRef.current) textRef.current.style.height = "";
          setContent("");
          setMusic([]);
          imageDraft.clear();
          setPrivatePost(false);
          setHideAuthor(false);
          setAdult(false);
        },
      },
    );
  };

  return (
    <form
      className="card composer"
      onSubmit={submit}
      {...drop.handlers}
    >
      <div className="composer-row">
        {user && <Avatar username={user.username} displayName={user.displayName} url={user.avatarUrl} frame={user.avatarFrame} size={42} online />}
        <div className="image-drop-field">
        <textarea
          ref={textRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            communitySlug ? `Запись в c/${communitySlug}` : "Что нового? Поделитесь со всеми!"
          }
          maxLength={maxLength}
          rows={2}
          aria-label="Написать запись"
          onPaste={onPaste}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }}
        />
        <EmojiInputButton field={textRef} value={content} onChange={setContent} maxLength={maxLength} disabled={create.isPending} />
        {drop.dragging && <ImageDropHint />}
        </div>
      </div>

      <LinkPreview text={content} />
      {imageDraft.images.length > 0 && <div className="image-draft">{imageDraft.images.map((image) => <div className="image-preview" key={image.id}><img src={image.preview} alt="Предпросмотр вложения" /><button type="button" className="image-remove" aria-label="Удалить изображение" onClick={() => imageDraft.remove(image.id)}>×</button>{image.pending && <span role="status">{image.progress === undefined ? "Подготовка…" : `Загрузка ${image.progress}%`}</span>}{image.error && <p className="error" role="alert">{image.error} <button type="button" onClick={() => imageDraft.retry(image)}>Повторить</button></p>}</div>)}</div>}
      {imageDraft.error && <p className="error" role="alert">{imageDraft.error}</p>}

      {music.length > 0 && <div className="music-attachments">{music.map((track) => <div className="music-attachments__row" key={track.id}><div className="music-page__track-info"><strong>{track.title}</strong><span>{track.artist}</span></div><button type="button" className="btn btn-ghost" aria-label={`Удалить ${track.title}`} onClick={() => setMusic((tracks) => tracks.filter((item) => item.id !== track.id))}>×</button></div>)}</div>}
      {musicPickerOpen && <MusicAttachmentPicker selected={music} onChange={setMusic} onClose={() => setMusicPickerOpen(false)} />}
      <div className="composer-footer">
        <span className="row composer-controls">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            hidden
            onChange={pickImage}
          />
          <button
            type="button"
            className="btn btn-ghost composer-attachment"
            onClick={() => fileRef.current?.click()}
            disabled={imageDraft.images.length >= 10}
            aria-label="Прикрепить изображение"
            title="Прикрепить изображение"
          >
            <Icon name="image" size={20} />
          </button>
          <button type="button" className="btn btn-ghost composer-attachment" aria-label="Прикрепить музыку" title="Прикрепить музыку" onClick={() => setMusicPickerOpen(true)}><Icon name="music" size={20} /></button>
          <label className="row post-visibility"><input className="aero-checkbox" type="checkbox" aria-label="Фото 18+" checked={adult} onChange={(e) => setAdult(e.target.checked)} /> 18+</label>
          {communitySlug && <label className="row post-visibility"><input className="aero-checkbox" type="checkbox" checked={hideAuthor} onChange={(e) => setHideAuthor(e.target.checked)} /> Скрыть автора</label>}
          {!communitySlug && (
            <label className="row post-visibility">
              <input className="aero-checkbox" type="checkbox" checked={privatePost} onChange={(e) => setPrivatePost(e.target.checked)} />
              Только друзья
            </label>
          )}
        </span>
        <button className="btn" disabled={create.isPending || !canPost}>
          {create.isPending ? "Публикация…" : "Опубликовать"}
        </button>
      </div>
      {create.isError && <p className="error" role="alert">{create.error.message}</p>}
    </form>
  );
}
