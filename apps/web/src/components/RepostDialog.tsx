import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { COMMUNITY_POST_LENGTH, displayNameOf, FREE_POST_LENGTH, MESSAGE_MAX_LENGTH, PLUS_POST_LENGTH } from "@commune/shared";
import type { MessageDTO, PostDTO, RepostSource } from "@commune/shared";
import { useCommunities } from "../hooks/useCommunities";
import { useConversations } from "../hooks/useMessages";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import AeroTitlebar from "./AeroTitlebar";
import Icon from "./Icon";
import RepostSelect from "./RepostSelect";
import { useDialogBackdrop } from "../hooks/useDialogBackdrop";

const DESTINATIONS = [
  { id: "profile", label: "Профиль", icon: "user" },
  { id: "community", label: "Группа", icon: "users" },
  { id: "message", label: "Сообщение", icon: "mail" },
] as const;
type Destination = (typeof DESTINATIONS)[number]["id"];

export default function RepostDialog({ source, onClose, onSuccess }: {
  source: RepostSource;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [destination, setDestination] = useState<Destination>("profile");
  const [content, setContent] = useState("");
  const [selectedCommunity, setCommunity] = useState("");
  const [recipient, setRecipient] = useState("");
  const communities = useCommunities({ publishable: true }, destination === "community");
  const conversations = useConversations(destination === "message");
  const community = selectedCommunity
    ? communities.data?.find((item) => item.slug === selectedCommunity)?.slug ?? ""
    : communities.data?.[0]?.slug ?? "";
  const maxLength = destination === "message" ? MESSAGE_MAX_LENGTH : destination === "community" ? COMMUNITY_POST_LENGTH : user?.plus ? PLUS_POST_LENGTH : FREE_POST_LENGTH;
  const mutation = useMutation({
    mutationFn: async () => {
      if (destination === "message") {
        await api<MessageDTO>(
          `/messages/${encodeURIComponent(recipient)}`,
          { method: "POST", body: { text: content, repost: source } },
        );
        void qc.invalidateQueries({ queryKey: ["conversations"] });
        void qc.invalidateQueries({ queryKey: ["thread", recipient] });
        for (const key of [["feed"], ["post"], ["search", "posts"], ["public", "posts"]]) {
          void qc.invalidateQueries({ queryKey: key });
        }
        return "Репост отправлен";
      }
      await api<PostDTO>("/posts/reposts", {
        method: "POST",
        body: { source, content, ...(destination === "community" ? { community } : {}) },
      });
      for (const key of [["feed"], ["post"], ["search", "posts"], ["public", "posts"]]) {
        void qc.invalidateQueries({ queryKey: key });
      }
      return "Репост опубликован";
    },
    onSuccess,
  });
  const backdrop = useDialogBackdrop(() => {
    if (!mutation.isPending) onClose();
  });

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    element.querySelector<HTMLInputElement>("input[type=radio]:checked")?.focus();
    return () => element.close();
  }, []);

  function close() {
    if (!mutation.isPending) {
      dialog.current?.close();
      onClose();
    }
  }

  const canSubmit = content.length <= maxLength && !mutation.isPending
    && (destination !== "community" || Boolean(community))
    && (destination !== "message" || Boolean(recipient));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (canSubmit) mutation.mutate();
  }

  return (
    <dialog ref={dialog} {...backdrop} className="aero-dialog repost-dialog" aria-labelledby={titleId} onCancel={(event) => {
      event.preventDefault();
      close();
    }}>
      <AeroTitlebar onClose={close} closeLabel="Закрыть окно репоста">
        <h2 id={titleId}>{source.comment ? "Поделиться комментарием" : "Поделиться записью"}</h2>
      </AeroTitlebar>
      <form className="aero-dialog__body repost-dialog__body" onSubmit={submit}>
        <fieldset disabled={mutation.isPending}>
          <legend>Поделиться в</legend>
          <div className="repost-dialog__destinations">
            {DESTINATIONS.map(({ id, label, icon }) => (
              <label key={id} className="aero-button">
                <input type="radio" name="destination" value={id} checked={destination === id} onChange={() => {
                  mutation.reset();
                  setDestination(id);
                }} />
                <Icon name={icon} size={18} /> {label}
              </label>
            ))}
          </div>
          {destination === "community" && (
            <>
              <RepostSelect label="Группа" value={community} onChange={setCommunity} options={(communities.data ?? []).map((item) => ({ value: item.slug, username: item.slug, name: item.name, avatarUrl: item.avatarUrl }))} />
              {communities.isPending && <p role="status">Загрузка групп…</p>}
              {communities.isError && <p role="alert" className="error">{communities.error.message}</p>}
              {communities.isSuccess && communities.data.length === 0 && <p className="muted">У вас пока нет групп, в которых вы можете публиковать репосты.</p>}
            </>
          )}
          {destination === "message" && (
            <>
              <RepostSelect label="Диалог" searchable value={recipient} onChange={setRecipient} options={(conversations.data ?? []).map((item) => ({ value: item.id, username: item.other.username, name: displayNameOf(item.other), avatarUrl: item.other.avatarUrl, online: item.other.online ?? false }))} />
              {conversations.isLoading && <p role="status">Загрузка диалогов…</p>}
              {conversations.isError && <p role="alert" className="error">{conversations.error.message}</p>}
              {conversations.isSuccess && !conversations.data.length && <p className="muted">Диалогов пока нет.</p>}
            </>
          )}
          <label className="repost-dialog__field">
            Ваш текст <span className="muted">(необязательно)</span>
            <textarea rows={3} maxLength={maxLength} value={content} onChange={(event) => setContent(event.target.value)} />
          </label>
          <span className={content.length > maxLength ? "error" : "muted"}>{content.length}/{maxLength}</span>
        </fieldset>
        {mutation.error && <p className="error" role="alert">{mutation.error.message}</p>}
        <div className="repost-dialog__actions">
          <button className="aero-button" type="button" disabled={mutation.isPending} onClick={close}>Отмена</button>
          <button className="aero-button" disabled={!canSubmit}>
            {mutation.isPending ? "Отправляем…" : destination === "message" ? "Отправить" : "Опубликовать"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
