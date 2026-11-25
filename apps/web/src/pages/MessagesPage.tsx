import { useProfile } from "../hooks/useSocial";
import { displayNameOf } from "@commune/shared";
import { lazy, Suspense, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RowsSkeleton, ThreadSkeleton } from "../components/Skeleton";
import type { FormEvent, KeyboardEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { MESSAGE_MAX_LENGTH, type MusicTrackDTO } from "@commune/shared";
import Avatar from "../components/Avatar";
import MusicAttachmentPicker from "../components/MusicAttachmentPicker";
import MusicAttachments from "../components/MusicAttachments";
import MessageImages from "../components/MessageImages";
import RepostCard from "../components/RepostCard";
import EmojiText from "../components/EmojiText";
import MessageContextMenu from "../components/MessageContextMenu";
import { EmojiIcon } from "../components/EmojiInputButton";
import { LinkPreview, splitLinks } from "../components/LinkContent";
import { useImageDraft } from "../hooks/useImageDraft";
import { useImageDrop } from "../hooks/useImageDrop";
import ImageDropHint from "../components/ImageDropHint";
import Icon from "../components/Icon";
import SendButton from "../components/SendButton";
import PlusBadge from "../components/PlusBadge";
import { timeAgo } from "../components/PostCard";
import {
  PENDING_PREFIX,
  useChangeMessage,
  useConversations,
  useMarkRead,
  useSendMessage,
  useStartChat,
  useThread,
  type MessageDraft,
} from "../hooks/useMessages";
import { joinConversation, noteTyping, stopTyping, useRealtime } from "../lib/realtime";
import { useAuth } from "../store/auth";
import {createId} from "../lib/uuid";
import { usesMobileKeyboard } from "../lib/mobileKeyboard";

const EmojiPicker = lazy(() => import("../components/EmojiPicker"));

function MessageText({ text }: { text: string }) {
  return <>{splitLinks(text).map((part, index) => part.href
    ? <a key={index} href={part.href} target="_blank" rel="noopener noreferrer ugc nofollow">{part.value}</a>
    : <EmojiText key={index} text={part.value} />)}</>;
}

/** On desktop, Enter sends and Shift+Enter inserts a new line. */
function Composer({
  onSend,
  busy,
  error,
  onTyping,
  onStopTyping,
}: {
  onSend: (draft: MessageDraft) => Promise<unknown>;
  busy: boolean;
  error?: string | null;
  onTyping?: () => void;
  onStopTyping?: () => void;
}) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [inputFont, setInputFont] = useState("");
  const [fontRevision, setFontRevision] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const composer = useRef<HTMLFormElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const emojiButton = useRef<HTMLButtonElement>(null);
  const emojiId = useId();
  const [tracks, setTracks] = useState<MusicTrackDTO[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const attachmentsRef = useRef<HTMLDivElement>(null);
  const attachmentsButton = useRef<HTMLButtonElement>(null);
  const attachmentsId = useId();
  const images = useImageDraft(true);
  const drop = useImageDrop(images.add, busy);
  const imageInput = useRef<HTMLInputElement>(null);
  const sending = useRef(false);
  useLayoutEffect(() => {
    const input = field.current;
    const overlay = mirror.current;
    if (!input || !overlay) return;
    const sync = () => {
      const style = getComputedStyle(input);
      const scrollbar = input.offsetWidth - input.clientWidth - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
      overlay.style.right = `${Math.max(0, scrollbar)}px`;
      overlay.style.lineHeight = style.lineHeight;
      overlay.style.letterSpacing = style.letterSpacing;
      overlay.style.wordSpacing = style.wordSpacing;
      overlay.scrollTop = input.scrollTop;
      overlay.scrollLeft = input.scrollLeft;
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(input);
    return () => observer.disconnect();
  }, [text, fontRevision]);
  useLayoutEffect(() => {
    const input = field.current;
    if (!input) return;
    const update = () => {
      const style = getComputedStyle(input);
      setInputFont(`${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(input);
    const fontsLoaded = () => { update(); setFontRevision((revision) => revision + 1); };
    document.fonts.addEventListener("loadingdone", fontsLoaded);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", fontsLoaded);
    };
  }, [user?.appearance?.font]);
  useEffect(() => {
    if (!attachmentsOpen) return;
    const closeOutside = (event: PointerEvent) => { if (!attachmentsRef.current?.contains(event.target as Node)) setAttachmentsOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [attachmentsOpen]);
  useEffect(() => {
    if (!emojiOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node &&
          !document.getElementById(emojiId)?.contains(event.target) &&
          !emojiButton.current?.contains(event.target)) setEmojiOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [emojiOpen, emojiId]);
  const insertEmoji = (emoji: string) => {
    const input = field.current;
    if (!input) return false;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const next = text.slice(0, start) + emoji + text.slice(end);
    if (next.length > MESSAGE_MAX_LENGTH) return false;
    setText(next);
    onTyping?.();
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + emoji.length, start + emoji.length);
    });
    return true;
  };
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const value = text.trim();
    if ((!value && !tracks.length && !images.images.length) || busy || images.busy || !images.ready || sending.current || pickerOpen) return;
    sending.current = true;
    onStopTyping?.();
    try {
      await onSend({ text: value, tracks, imageIds: images.images.map((image) => image.url!), clientMessageId: createId() });
      setText("");
      setTracks([]);
      images.clear();
    } catch {
      // Keep the draft available for correction or retry.
    } finally {
      sending.current = false;
    }
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !usesMobileKeyboard()) {
      e.preventDefault();
      void submit();
    }
  };
  return (
    <>
    <form ref={composer} className="chat-form" onSubmit={(e) => void submit(e)} {...drop.handlers} onKeyDown={(event) => {
      if (!emojiOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setEmojiOpen(false);
        emojiButton.current?.focus();
      }
      if (event.key === "Enter" && event.target instanceof HTMLInputElement && event.target.type === "search") event.preventDefault();
    }}>
      {error && <p className="error small">{error}</p>}
      <LinkPreview text={text} />
      {images.images.length > 0 && <div className="image-draft">{images.images.map((image) => <div className="image-preview" key={image.id}><img src={image.preview} alt="Предпросмотр вложения" /><button type="button" className="image-remove" disabled={busy} aria-label="Удалить изображение" onClick={() => images.remove(image.id)}>×</button>{image.pending && <span role="status">{image.progress === undefined ? "Подготовка…" : `Загрузка ${image.progress}%`}</span>}{image.error && <p className="error" role="alert">{image.error} <button type="button" onClick={() => images.retry(image)}>Повторить</button></p>}</div>)}</div>}
      {images.error && <p className="error" role="alert">{images.error}</p>}
      {tracks.length > 0 && <div className="chat-draft-tracks" aria-label="Выбранная музыка">
        {tracks.map((track) => <div className="chat-draft-track" key={track.id}>
          <span>{track.title} — {track.artist}</span>
          <button type="button" className="btn btn-ghost" disabled={busy} aria-label={`Убрать ${track.title}`} onClick={() => setTracks((current) => current.filter((item) => item.id !== track.id))}>×</button>
        </div>)}
      </div>}
      <div className="chat-form-row">
        <div className="image-drop-field">
        {text && <div ref={mirror} className="chat-form__mirror" aria-hidden="true"><EmojiText key={fontRevision} text={text} measureFont={inputFont} />{"\n"}</div>}
        <textarea
          ref={field}
          disabled={busy}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value) onTyping?.();
          }}
          onKeyDown={onKey}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.items)
              .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
              .map((item) => item.getAsFile()).filter((file): file is File => Boolean(file));
            if (!files.length) return;
            if (!event.clipboardData.getData("text/plain")) event.preventDefault();
            images.add(files);
          }}
          onScroll={(event) => {
            if (mirror.current) {
              mirror.current.scrollTop = event.currentTarget.scrollTop;
              mirror.current.scrollLeft = event.currentTarget.scrollLeft;
            }
          }}
          className={text ? "chat-form__text--mirrored" : undefined}
          placeholder="Сообщение..."
          rows={1}
          maxLength={MESSAGE_MAX_LENGTH}
          aria-label="Сообщение"
          enterKeyHint="enter"
        />
        {drop.dragging && <ImageDropHint />}
        <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) images.add(files); }} />
        <div className="chat-form__tools">
        <button ref={emojiButton} type="button" className="chat-form__tool chat-emoji-toggle" disabled={busy} aria-label="Выбрать эмодзи" title="Выбрать эмодзи" aria-expanded={emojiOpen} aria-controls={emojiOpen ? emojiId : undefined} onClick={() => {
          setAttachmentsOpen(false);
          setEmojiOpen((open) => !open);
        }}>
          {/* Google Material Icons: sentiment_satisfied_alt, Apache-2.0. */}
          <EmojiIcon />
        </button>
        <div ref={attachmentsRef} className="chat-attachments" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setAttachmentsOpen(false); }} onKeyDown={(event) => { if (event.key === "Escape" && attachmentsOpen) { event.preventDefault(); event.stopPropagation(); setAttachmentsOpen(false); attachmentsButton.current?.focus(); } }}>
          <button ref={attachmentsButton} type="button" className="chat-form__tool chat-attachments__toggle" disabled={busy} aria-label="Вложения" aria-expanded={attachmentsOpen} aria-controls={attachmentsOpen ? attachmentsId : undefined} title="Вложения" onClick={() => { setEmojiOpen(false); setAttachmentsOpen((open) => !open); }}>
            {/* Google Material Icons: attach_file, Apache-2.0. */}
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" /></svg>
          </button>
          {attachmentsOpen && <div id={attachmentsId} className="chat-attachments__menu" role="group" aria-label="Выберите вложение">
            <button type="button" disabled={busy || images.images.length >= 10} onClick={() => { setAttachmentsOpen(false); imageInput.current?.click(); }}><Icon name="image" size={18} /> Фото</button>
            <button type="button" disabled={busy} onClick={() => { setAttachmentsOpen(false); setPickerOpen(true); }}><Icon name="music" size={18} /> Музыка</button>
          </div>}
        </div>
        </div>
        </div>
        <SendButton disabled={busy || images.busy || !images.ready || (!text.trim() && !tracks.length && !images.images.length)} />
      </div>
      {text.length > MESSAGE_MAX_LENGTH - 200 && (
        <span className="muted small">
          {text.length}/{MESSAGE_MAX_LENGTH}
        </span>
      )}
      {emojiOpen && user && <Suspense fallback={<div className="chat-emoji aero-panel" role="status">Загрузка эмодзи…</div>}>
        <EmojiPicker id={emojiId} userId={user.id} onSelect={insertEmoji} onClose={() => { setEmojiOpen(false); emojiButton.current?.focus(); }} />
      </Suspense>}
    </form>
    {pickerOpen && <MusicAttachmentPicker selected={tracks} onChange={setTracks} onClose={() => setPickerOpen(false)} />}
    </>
  );
}

function Thread({ id }: { id: string }) {
  const { user } = useAuth();
  const thread = useThread(id);
  const send = useSendMessage(id);
  const markRead = useMarkRead(id);
  const change = useChangeMessage(id);
  const [editing, setEditing] = useState<{ id: string; text: string }>();
  const [messageMenu, setMessageMenu] = useState<{ id: string; text: string; x: number; y: number }>();
  const longPress = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number }>();
  const longPressOpened = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const cancelLongPress = () => { if (longPress.current) clearTimeout(longPress.current.timer); longPress.current = undefined; };
  useEffect(() => () => cancelLongPress(), []);

  // Live: join this conversation's room for typing and online status.
  useEffect(() => joinConversation(id), [id]);
  const latest = thread.data?.pages[0];
  const otherId = latest?.conversation?.other.id;
  const typing = useRealtime((s) => s.typing[id] === true);
  const online = useRealtime((s) => otherId ? s.presence[otherId] : undefined) ?? latest?.conversation?.other.online ?? false;

  const messages = useMemo(() => {
    const seen = new Set<string>();
    return [...(thread.data?.pages ?? [])].reverse().flatMap((page) => page.items)
      .filter((m) => !seen.has(m.id) && seen.add(m.id));
  }, [thread.data]);

  // Stay at the bottom for new messages, unless the person scrolled up to read.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (stick.current && list) list.scrollTop = list.scrollHeight;
  }, [messages.length, typing]);

  // A message from the other person arrived while this conversation is open and visible: mark
  // it read (the first load is already marked read by the server).
  const lastMessage = messages[messages.length - 1];
  const lastFromOther =
    Boolean(lastMessage) &&
    lastMessage!.senderId !== user?.id &&
    !lastMessage!.id.startsWith(PENDING_PREFIX);
  const markedRef = useRef<string | null>(null);
  useEffect(() => {
    if (thread.isSuccess && markedRef.current === null) markedRef.current = lastMessage?.id ?? "";
  }, [thread.isSuccess, lastMessage?.id]);
  useEffect(() => {
    const mark = () => {
      if (!lastFromOther || !lastMessage || markedRef.current === lastMessage.id) return;
      if (document.visibilityState !== "visible") return;
      markedRef.current = lastMessage.id;
      markRead.mutate();
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
    // markRead is stable enough for this purpose; the message id is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage?.id, lastFromOther]);

  const lastMineId = [...messages].reverse().find((m) => m.senderId === user?.id)?.id;

  const onScroll = () => {
    const el = listRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const showOlder = async () => {
    if (!thread.hasNextPage || thread.isFetching) return;
    stick.current = false;
    await thread.fetchNextPage();
  };

  if (thread.isLoading) return <ThreadSkeleton />;
  if (!latest)
    return <p className="error center">Переписка не найдена.</p>;
  const other = latest.conversation?.other;

  return (
    <>
      <div className="chat-head">
        <Link to="/messages" className="icon-btn chat-back" aria-label="К списку переписок">
          ←
        </Link>
        {other && (
          <Link to={`/u/${other.username}`} className="person">
            <Avatar username={other.username} displayName={other.displayName} url={other.avatarUrl} frame={other.avatarFrame} size={36} online={online} />
            <span className="person-text">
              <strong>
                {displayNameOf(other)} <PlusBadge plus={other.plus} />
              </strong>
              {typing ? (
                <span className="chat-status typing-label">печатает…</span>
              ) : null}
            </span>
          </Link>
        )}
      </div>

      <div className="chat-messages" ref={listRef} onScroll={onScroll}>
        {thread.hasNextPage && (
          <button
            className="link-btn center"
            onClick={() => void showOlder()}
            disabled={thread.isFetching}
          >
            {thread.isFetchingNextPage ? "Загрузка…" : "Загрузить предыдущие сообщения"}
          </button>
        )}
        {(change.error || thread.isFetchNextPageError) && <p role="alert" className="error">{(change.error ?? thread.error)?.message}</p>}
        {messages.length === 0 && <p className="muted center">Сообщений пока нет. Поздоровайтесь!</p>}
        {messages.map((m) => {
          const mine = m.senderId === user?.id;
          const pending = m.id.startsWith(PENDING_PREFIX);
          const draft = editing?.id === m.id ? editing : undefined;
          return (
            <div
              key={m.id}
              id={`message-${m.id}`}
              tabIndex={mine && !pending ? 0 : -1}
              className={`bubble-row${mine ? " mine" : ""}${pending ? " pending" : ""}`}
              onKeyDown={(event) => {
                if (!mine || pending || draft || !(event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) return;
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                setMessageMenu({ id: m.id, text: m.text, x: rect.right, y: rect.top });
              }}
            >
              <div className={`bubble${m.hasRepost || m.musicAttachments?.length || m.imageIds?.length || splitLinks(m.text).some((part) => part.href) ? " bubble--music" : ""}`}
                onContextMenu={(event) => {
                  if (!mine || pending || draft) return;
                  event.preventDefault();
                  cancelLongPress();
                  const rect = event.currentTarget.getBoundingClientRect();
                  setMessageMenu({ id: m.id, text: m.text, x: event.clientX || rect.right, y: event.clientY || rect.top });
                }}
                onPointerDown={(event) => {
                  if (!mine || pending || draft || event.pointerType !== "touch" || !event.isPrimary) return;
                  cancelLongPress();
                  longPressOpened.current = false;
                  const { clientX: x, clientY: y } = event;
                  longPress.current = { x, y, timer: setTimeout(() => { longPress.current = undefined; longPressOpened.current = true; setMessageMenu({ id: m.id, text: m.text, x, y }); }, 550) };
                }}
                onPointerMove={(event) => { const start = longPress.current; if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) cancelLongPress(); }}
                onPointerUp={cancelLongPress}
                onPointerCancel={cancelLongPress}
                onClickCapture={(event) => { if (longPressOpened.current) { event.preventDefault(); event.stopPropagation(); longPressOpened.current = false; } }}
              >
                {draft ? <form className="chat-edit" onSubmit={(event) => {
                  event.preventDefault();
                  if (change.isPending) return;
                  change.mutate({ messageId: draft.id, text: draft.text }, { onSuccess: () => setEditing(undefined) });
                }}>
                  <textarea value={draft.text} maxLength={MESSAGE_MAX_LENGTH} aria-label="Текст сообщения" autoFocus onChange={(event) => setEditing({ id: m.id, text: event.target.value })} />
                  <div className="chat-message-actions">
                    <button className="btn" disabled={change.isPending || (!draft.text.trim() && !m.imageIds?.length && !m.musicAttachments?.length && !m.hasRepost)}>Сохранить</button>
                    <button className="btn btn-ghost chat-edit__cancel" type="button" disabled={change.isPending} onClick={() => { change.reset(); setEditing(undefined); }}>Отмена</button>
                  </div>
                </form> : m.text && <><span><MessageText text={m.text} /></span><LinkPreview text={m.text} /></>}
                {(m.imageIds?.length ?? 0) > 0 && <MessageImages ids={m.imageIds!} />}
                {(m.musicAttachments?.length ?? 0) > 0 && <MusicAttachments attachments={m.musicAttachments!} source={`message:${m.senderId}:${m.clientMessageId ?? m.id}`} />}
                {m.repost && <RepostCard preview={m.repost} source={`message-repost:${m.id}`} />}
                {m.hasRepost && !m.repost && <p className="muted">Загрузка репоста…</p>}
                <time
                  className="bubble-time"
                  dateTime={m.createdAt}
                  title={new Date(m.createdAt).toLocaleString("ru-RU")}
                >
                  {pending ? "Отправка…" : `${timeAgo(m.createdAt)}${m.editedAt ? " · изменено" : ""}`}
                </time>
                {mine &&
                  m.id === lastMineId &&
                  !pending &&
                  latest.conversation?.seenByOther && (
                    <span className="bubble-seen">Прочитано</span>
                  )}
              </div>
            </div>
          );
        })}
        {typing && (
          <div className="bubble-row" aria-live="polite">
            <div className="bubble typing-bubble" aria-label="Печатает">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
      </div>

      {messageMenu && <MessageContextMenu key={`${messageMenu.id}:${messageMenu.x}:${messageMenu.y}`} x={messageMenu.x} y={messageMenu.y} busy={change.isPending}
        onClose={() => setMessageMenu(undefined)}
        onEdit={() => { change.reset(); setEditing({ id: messageMenu.id, text: messageMenu.text }); setMessageMenu(undefined); }}
        onDelete={() => { const messageId = messageMenu.id; setMessageMenu(undefined); if (window.confirm("Удалить сообщение у обоих участников?")) change.mutate({ messageId }); }} />}

      <Composer
        busy={send.isPending}
        error={send.isError ? send.error.message : null}
        onTyping={() => noteTyping(id)}
        onStopTyping={() => stopTyping(id)}
        onSend={(text) => {
          stick.current = true;
          return send.mutateAsync(text);
        }}
      />
    </>
  );
}

/** First message to someone you have no conversation with yet (from "Message" on a profile). */
function NewChat({ username }: { username: string }) {
  const navigate = useNavigate();
  const start = useStartChat(username);
  const { data: recipient } = useProfile(username);
  const name = recipient ? displayNameOf(recipient) : "";
  return (
    <>
      <div className="chat-head">
        <Link to="/messages" className="icon-btn chat-back" aria-label="К списку переписок">
          ←
        </Link>
        {recipient && <Avatar username={recipient.username} displayName={recipient.displayName}
          url={recipient.avatarUrl} frame={recipient.avatarFrame} size={36} trackOnline online={recipient.online} />}
        <strong>{name ? `Новое сообщение для ${name}` : "Новое сообщение"}</strong>
      </div>
      <div className="chat-messages">
        <p className="muted center">{name && `Поздоровайтесь с ${name}. `} Соблюдайте правила общения: пользователи могут пожаловаться на нарушения.</p>
      </div>
      <Composer
        busy={start.isPending}
        error={start.isError ? start.error.message : null}
        onSend={async (text) => {
          const res = await start.mutateAsync(text);
          navigate(`/messages/${res.conversationId}`, { replace: true });
        }}
      />
    </>
  );
}

export default function MessagesPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const to = params.get("to");
  const { user } = useAuth();
  const navigate = useNavigate();
  const conversations = useConversations();
  const presence = useRealtime((state) => state.presence);
  const list = conversations.data ?? [];

  // "Message @someone" from a profile: reuse the existing conversation when there is one.
  useEffect(() => {
    if (!to || !conversations.data) return;
    const existing = conversations.data.find(
      (c) => c.other.username.toLowerCase() === to.toLowerCase(),
    );
    if (existing) navigate(`/messages/${existing.id}`, { replace: true });
  }, [to, conversations.data, navigate]);

  const showThread = Boolean(id) || Boolean(to);

  return (
    <div className={`chat${showThread ? " chat-open" : ""}`}>
      <section className="card chat-list" aria-label="Переписки">
        <h1 className="chat-title">Сообщения</h1>
        {conversations.isLoading && <RowsSkeleton count={6} />}
        {conversations.isError && <p className="error center">Не удалось загрузить сообщения.</p>}
        {conversations.data && list.length === 0 && (
          <p className="muted center">

            Переписок пока нет. Откройте профиль пользователя и нажмите <strong>Сообщение</strong>.
          </p>
        )}
        {list.map((c) => (
          <Link
            key={c.id}
            to={`/messages/${c.id}`}
            className={`convo${c.id === id ? " active" : ""}${c.unread > 0 ? " unread" : ""}`}
          >
            <Avatar username={c.other.username} displayName={c.other.displayName} url={c.other.avatarUrl} frame={c.other.avatarFrame} size={44} trackOnline online={(c.id === id ? presence[c.other.id] : undefined) ?? c.other.online} />
            <span className="convo-main">
              <span className="convo-top">
                <strong>
                  {displayNameOf(c.other)} <PlusBadge plus={c.other.plus} />
                </strong>
                <span className="muted small">{timeAgo(c.lastMessageAt)}</span>
              </span>
              <span className="convo-last muted">
                {c.lastMessage
                  ? (c.lastMessage.senderId === user?.id ? "Вы: " : "") + c.lastMessage.text
                  : "Нет сообщений"}
              </span>
            </span>
            {c.unread > 0 && <span className="pill">{c.unread}</span>}
          </Link>
        ))}
      </section>

      <section className="card chat-thread" aria-label="Переписка">
        {id ? (
          <Thread id={id} key={id} />
        ) : to && conversations.data ? (
          <NewChat username={to} />
        ) : (
          <p className="muted center chat-empty">Выберите переписку, чтобы начать общение.</p>
        )}
      </section>
    </div>
  );
}
