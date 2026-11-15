import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useSearchParams } from "react-router-dom";
import { api, API_BASE, getAccessToken, tryRefresh, withQuery } from "../lib/api";
import { useAuth } from "../store/auth";
import { REASON_LABELS } from "../components/ReportForm";
import type { AvatarFrame, MusicAttachmentDTO, ReportReason } from "@commune/shared";
import Avatar from "../components/Avatar";
import { LinkedText } from "../components/LinkContent";
import ImageGallery from "../components/ImageGallery";
import MusicAttachments from "../components/MusicAttachments";
import Icon, { type IconName } from "../components/Icon";
import AeroTitlebar from "../components/AeroTitlebar";

type Kind = "post" | "comment" | "wallpaper";
type State = "published" | "hidden" | "removed" | "withdrawn";
const states: Record<State, string> = {
  published: "Опубликовано",
  hidden: "Скрыто",
  removed: "Удалено",
  withdrawn: "Удалено автором или управляющим группы",
};
type Status = "open" | "resolved" | "dismissed";
type Person = {
  _id: string;
  username: string;
  displayName?: string;
  role?: string;
  avatarUrl?: string | null;
  avatarFrame?: AvatarFrame | null;
};
type Restriction = { reason: string; until?: string | null };
type User = Person & {
  accountRestriction?: Restriction;
  publishingRestriction?: Restriction;
  warnings?: Array<{ _id: string; reason: string; time: string }>;
};
type Report = {
  _id: string;
  status?: Status;
  kind: "post" | "comment" | "wallpaper";
  post: string;
  reason: ReportReason;
  details?: string;
  decision?: string;
  reporter?: Person;
  author?: Person;
  snapshot?: { content?: string };
  target?: {
    _id: string;
    content?: string;
    name?: string;
    imageUrl?: string;
    imageUrls?: string[];
    createdAt?: string;
    moderationState?: State;
    purgedAt?: string;
    deletionPending?: boolean;
  };
};
type History = {
  kind: string;
  target: string;
  actorName?: string;
  event: {
    _id: string;
    action: string;
    reason: string;
    actor: string;
    actorRole: string;
    time: string;
    until?: string;
  };
};
type Page<T> = { items: T[]; nextCursor: string | null };

const measures = {
  warning: "Предупреждение",
  publishing: "Запрет публикаций",
  temporary: "Временная блокировка",
  permanent: "Бессрочная блокировка",
  liftPublishing: "Снять запрет публикаций",
  liftAccount: "Разблокировать",
};
const actions: Record<string, string> = {
  ...measures,
  liftWarning: "Снятие предупреждения",
  published: "Восстановление",
  hidden: "Скрытие",
  removed: "Удаление",
  dismissed: "Жалоба отклонена",
  resolved: "Жалоба рассмотрена",
  "role:moderator": "Назначение модератора",
  "role:user": "Снятие роли модератора",
};
const entities: Record<string, string> = {
  user: "Пользователь",
  post: "Запись",
  comment: "Комментарий",
  wallpaper: "Фон",
  postReport: "Жалоба на запись",
  commentReport: "Жалоба на комментарий",
  wallpaperReport: "Жалоба на фон",
};

function ActionForm({
  label,
  onAction,
  timed = false,
  icon,
}: {
  label: string;
  onAction: (reason: string, minutes?: number) => Promise<void>;
  timed?: boolean;
  icon?: IconName;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  const [selectedReason, setSelectedReason] = useState("");
  const mutation = useMutation({
    mutationFn: ({ reason, minutes }: { reason: string; minutes?: number }) =>
      onAction(reason, minutes),
    onSuccess: () => setOpen(false),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    mutation.mutate({
      reason: selectedReason === "other" ? String(fields.get("reason")).trim() : selectedReason,
      minutes: timed ? Number(fields.get("minutes")) : undefined,
    });
  }
  return (
    <>
      <button
        type="button"
        className={icon ? "btn btn-outline moderation-icon-action" : "btn btn-outline"}
        aria-label={icon ? label : undefined}
        title={icon ? label : undefined}
        onClick={() => {
          mutation.reset();
          setOpen(true);
        }}
      >
        {icon ? <Icon name={icon} size={19} /> : label}
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="aero-dialog moderation-dialog"
          aria-labelledby={titleId}
          onCancel={(event) => {
            event.preventDefault();
            if (!mutation.isPending) setOpen(false);
          }}
        >
          <AeroTitlebar
            closeLabel="Закрыть окно"
            onClose={() => {
              if (!mutation.isPending) setOpen(false);
            }}
          >
            <h2 id={titleId}>{label}</h2>
          </AeroTitlebar>
          <form className="aero-dialog__body moderation-action" onSubmit={submit}>
            {label === "Скрыть" && <p>Материал исчезнет с сайта. Его можно будет восстановить в разделе «Контент».</p>}
            {label === "Удалить" && <p>Материал будет удалён без возможности восстановления. Общие вложения сохранятся, если используются в других материалах. Запись об удалении останется в журнале.</p>}
            <label>
              Причина
              <select
                required
                value={selectedReason}
                onChange={(event) => setSelectedReason(event.target.value)}
              >
                <option value="">Выберите причину</option>
                <option value="Спам">Спам</option>
                <option value="Оскорбления или травля">Оскорбления или травля</option>
                <option value="Разжигание ненависти">Разжигание ненависти</option>
                <option value="Насилие или угрозы">Насилие или угрозы</option>
                <option value="Нарушение правил сообщества">Нарушение правил сообщества</option>
                <option value="Жалоба необоснованна">Жалоба необоснованна</option>
                <option value="Пересмотр решения">Пересмотр решения</option>
                <option value="other">Другая причина</option>
              </select>
            </label>
            {selectedReason === "other" && (
              <label>
                Укажите причину
                <textarea name="reason" required maxLength={500} />
              </label>
            )}
            {timed && (
              <label>
                Срок в минутах
                <input
                  name="minutes"
                  type="number"
                  min={1}
                  max={525600}
                  required
                  defaultValue={60}
                />
              </label>
            )}
            <div className="moderation-buttons">
              <button className="btn" disabled={mutation.isPending}>
                Подтвердить
              </button>
              <button
                className="btn btn-outline"
                type="button"
                disabled={mutation.isPending}
                onClick={() => setOpen(false)}
              >
                Отмена
              </button>
            </div>
            {mutation.error && (
              <p className="error" role="alert">
                {mutation.error.message}
              </p>
            )}
          </form>
        </dialog>
      )}
    </>
  );
}

function UserActions({
  target,
  admin,
  self,
  send,
}: {
  target: User;
  admin: boolean;
  self: string;
  send: Send;
}) {
  if (target._id === self || target.role === "admin" || (!admin && target.role === "moderator"))
    return null;
  const permanent = target.accountRestriction && !target.accountRestriction.until;
  const available: Array<keyof typeof measures> = ["warning", "publishing"];
  if (admin || !permanent) available.push("temporary");
  if (admin) available.push("permanent");
  if (target.publishingRestriction) available.push("liftPublishing");
  if (target.accountRestriction && (admin || !permanent)) available.push("liftAccount");
  return (
    <div className="moderation-buttons">
      {available.map((action) => (
        <ActionForm
          key={action}
          label={measures[action]}
          timed={action === "publishing" || action === "temporary"}
          onAction={(reason, minutes) =>
            send("/moderation/users/" + target._id + "/measures", { action, reason, minutes })
          }
        />
      ))}
      {admin && (
        <ActionForm
          label={target.role === "moderator" ? "Снять роль модератора" : "Назначить модератором"}
          onAction={(reason) =>
            send(
              "/moderation/users/" + target._id + "/role",
              {
                role: target.role === "moderator" ? "user" : "moderator",
                reason,
              },
              "PATCH",
            )
          }
        />
      )}
    </div>
  );
}

type Send = (path: string, body: object, method?: string) => Promise<void>;

function ModerationHelp() {
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  return <>
    <button ref={button} type="button" className="btn btn-outline moderation-help-button"
      aria-label="Информация о модерации" title="Информация о модерации"
      onClick={() => dialog.current?.showModal()}>
      <Icon name="info" size={20} />
    </button>
    <dialog ref={dialog} className="aero-dialog moderation-dialog" aria-labelledby={titleId}
      onClose={() => button.current?.focus()}>
      <AeroTitlebar closeLabel="Закрыть справку" onClose={() => dialog.current?.close()}>
        <h2 id={titleId}>Информация о модерации</h2>
      </AeroTitlebar>
      <div className="aero-dialog__body moderation-help-body">
        <p><strong>Жалобы.</strong> Просматривайте сообщения о записях, комментариях и фонах. Скрывайте или удаляйте материал, отклоняйте жалобу либо закрывайте её как решённую.</p>
        <p><strong>Пользователи.</strong> Ищите аккаунты, просматривайте историю и применяйте или снимайте ограничения и предупреждения.</p>
        <p><strong>Контент.</strong> Просматривайте скрытые и удалённые материалы. Скрытые материалы можно восстановить.</p>
        <p><strong>Журнал.</strong> Проверяйте действия модераторов и администраторов и причины решений.</p>
        <button type="button" className="btn" onClick={() => dialog.current?.close()}>Понятно</button>
      </div>
    </dialog>
  </>;
}

function ModeratedImages({ postId, count, kind = "post" }: { postId: string; count: number; kind?: "post" | "wallpaper" }) {
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    const load = async (index: number) => {
      const url = API_BASE + "/moderation/content/" + kind + "/" + postId + "/images/" + index;
      const request = () => fetch(url, { headers: { Authorization: "Bearer " + getAccessToken() } });
      let response = await request();
      if (response.status === 401 && await tryRefresh()) response = await request();
      if (!response.ok) throw new Error("Image unavailable");
      const objectUrl = URL.createObjectURL(await response.blob());
      if (!active) URL.revokeObjectURL(objectUrl);
      else urls.push(objectUrl);
      return objectUrl;
    };
    setImages([]);
    setError(false);
    void Promise.allSettled(Array.from({ length: count }, (_, index) => load(index)))
      .then((results) => {
        if (!active) return;
        setImages(results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []));
        setError(results.some((result) => result.status === "rejected"));
      });
    return () => { active = false; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [postId, count, kind]);
  return <>
    {images.length > 0 && <ImageGallery images={images} alt="Вложение записи" />}
    {error && <p className="error">Не удалось загрузить вложения.</p>}
    {!error && images.length === 0 && <p className="muted">Загрузка вложений…</p>}
  </>;
}

function Pager({
  cursor,
  next,
  setCursor,
}: {
  cursor?: string;
  next?: string | null;
  setCursor: (next?: string) => void;
}) {
  return (
    <div className="moderation-buttons">
      {cursor && (
        <button className="btn btn-outline" onClick={() => setCursor()}>
          К первой странице
        </button>
      )}
      {next && (
        <button className="btn btn-outline" onClick={() => setCursor(next)}>
          Следующая страница
        </button>
      )}
    </div>
  );
}

function HistoryList({ user }: { user?: string }) {
  const [cursor, setCursor] = useState<string>();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const history = useQuery({
    queryKey: ["moderation", "history", user, cursor, filters],
    queryFn: () =>
      api<Page<History>>(withQuery("/moderation/history", { user, cursor, ...filters })),
  });
  return (
    <>
      {!user && (
        <form
          className="card moderation-card"
          onSubmit={(event) => {
            event.preventDefault();
            const entries = Array.from(
              new FormData(event.currentTarget),
              ([key, value]) => [key, String(value).trim()] as const,
            );
            setFilters(
              Object.fromEntries(
                entries
                  .filter(([, value]) => value)
                  .map(([key, value]) => [
                    key,
                    key === "from" || key === "to" ? new Date(value).toISOString() : value,
                  ]),
              ),
            );
            setCursor(undefined);
          }}
        >
          <div className="moderation-buttons">
            <label>
              Исполнитель <input name="actor" maxLength={32} />
            </label>
            <label>
              ID цели <input name="target" pattern="[a-fA-F0-9]{24}" />
            </label>
            <label>
              Действие{" "}
              <select name="action">
                <option value="">Все</option>
                {Object.entries(actions).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              С <input type="datetime-local" name="from" />
            </label>
            <label>
              По <input type="datetime-local" name="to" />
            </label>
          </div>
          <div className="moderation-buttons">
            <button className="btn">Применить</button>
          </div>
        </form>
      )}
      {history.isLoading && <p>Загрузка…</p>}
      {history.error && (
        <p role="alert" className="error">
          {history.error.message}
        </p>
      )}
      {history.data?.items.length === 0 && <p>История пуста.</p>}
      {history.data?.items.map(({ kind, target, actorName, event }) => (
        <article className="card moderation-card" key={event._id}>
          <strong>{actions[event.action] ?? event.action}</strong>
          <p>{event.reason}</p>
          <p className="muted">
            {actorName ? "@" + actorName : event.actor} ·{" "}
            {new Date(event.time).toLocaleString("ru-RU")}
          </p>
          {!user && (
            <p className="muted">
              {entities[kind]} · {target}
            </p>
          )}
          {event.until && <p>До {new Date(event.until).toLocaleString("ru-RU")}</p>}
        </article>
      ))}
      <Pager cursor={cursor} next={history.data?.nextCursor} setCursor={setCursor} />
    </>
  );
}

function Reports({ send, openUser }: { send: Send; openUser: (account: Person) => void }) {
  const [params, setParams] = useSearchParams();
  const reportId = /^[a-f0-9]{24}$/i.test(params.get("report") ?? "") ? params.get("report")! : undefined;
  const reportKind = params.get("kind");
  const selectedKind = reportId && (reportKind === "post" || reportKind === "comment" || reportKind === "wallpaper") ? reportKind : undefined;
  const [kind, setKind] = useState<Kind | "all" | "wallpaper">("all");
  const [status, setStatus] = useState<Status>("open");
  const [cursor, setCursor] = useState<string>();
  const queue = useQuery({
    queryKey: selectedKind ? ["moderation", "report", selectedKind, reportId] : ["moderation", "reports", kind, status, cursor],
    queryFn: () => api<Page<Report>>(withQuery("/moderation/reports", selectedKind ? { kind: selectedKind, status: "all", report: reportId } : { kind, status, cursor })),
    refetchOnMount: "always",
    staleTime: 0,
  });
  return (
    <>
      {selectedKind && <button type="button" className="btn btn-outline" onClick={() => setParams({})}>Все жалобы</button>}
      {!selectedKind && <div className="moderation-buttons">
        <label>
          Тип{" "}
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as Kind | "all" | "wallpaper");
              setCursor(undefined);
            }}
          >
            <option value="all">Все жалобы</option>
            <option value="post">Записи</option>
            <option value="comment">Комментарии</option>
            <option value="wallpaper">Фоны</option>
          </select>
        </label>
        <label>
          Статус{" "}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as Status);
              setCursor(undefined);
            }}
          >
            <option value="open">Открытые</option>
            <option value="resolved">Решённые</option>
            <option value="dismissed">Отклонённые</option>
          </select>
        </label>
      </div>}
      {queue.isLoading && <p>Загрузка…</p>}
      {queue.error && (
        <p className="error" role="alert">
          {queue.error.message}
        </p>
      )}
      {queue.data?.items.length === 0 && <p>{selectedKind ? "Жалоба не найдена." : "Жалоб в этом разделе нет."}</p>}
      {queue.data?.items.map((report) => {
        const contentState = report.target?.moderationState ?? "published";
        const reportKind = report.kind;
        const path = "/moderation/content/" + reportKind + "/" + report.post;
        return (
          <article className="card moderation-card" key={report._id}>
            <div className="moderation-report-header">
              <strong>{REASON_LABELS[report.reason]}</strong>
            <div className="moderation-buttons moderation-report-actions">
              {report.target && contentState !== "withdrawn" && (
                <>
                  {contentState === "published" && (
                    <ActionForm
                      label="Скрыть"
                      icon="eye"
                      onAction={(reason) =>
                        send(path, { state: "hidden", reason, reportId: report._id })
                      }
                    />
                  )}
                  {(contentState !== "removed" || !report.target?.purgedAt || report.target?.deletionPending) && (
                    <ActionForm
                      label="Удалить"
                      icon="trash"
                      onAction={(reason) =>
                        send(path, { state: "removed", reason, reportId: report._id })
                      }
                    />
                  )}
                  {contentState === "hidden" && (
                    <ActionForm
                      label="Восстановить"
                      icon="back"
                      onAction={(reason) =>
                        send(path, { state: "published", reason, reportId: report._id })
                      }
                    />
                  )}
                </>
              )}
              {(selectedKind ? !report.status || report.status === "open" : status === "open") && (
                <>
                  <ActionForm
                    label="Отклонить"
                    icon="close"
                    onAction={(reason) =>
                      send("/moderation/reports/" + reportKind + "/" + report._id, {
                        status: "dismissed",
                        reason,
                      })
                    }
                  />
                  <ActionForm
                    label="Закрыть как решённую"
                    icon="check"
                    onAction={(reason) =>
                      send("/moderation/reports/" + reportKind + "/" + report._id, {
                        status: "resolved",
                        reason,
                      })
                    }
                  />
                </>
              )}
            </div>
            </div>
            {reportKind === "wallpaper" && <p><strong>Жалоба на фон{report.target?.name ? " · " + report.target.name : ""}</strong></p>}
            {selectedKind && <p className="muted">{report.status === "resolved" ? "Решённая" : report.status === "dismissed" ? "Отклонённая" : "Открытая"}</p>}
            <div className="moderation-person">
              {report.reporter && (
                <Avatar
                  username={report.reporter.username}
                  displayName={report.reporter.displayName}
                  url={report.reporter.avatarUrl}
                  frame={report.reporter.avatarFrame}
                  size={36}
                />
              )}
              <div>
                <span className="muted">Заявитель</span>
                <p>
                  {report.reporter?.displayName || report.reporter?.username || "Аккаунт удалён"}
                </p>
              </div>
            </div>
            {report.details && <p>{report.details}</p>}
            <aside
              className="repost-card"
              aria-label={
                reportKind === "post"
                  ? "Запись в жалобе"
                  : reportKind === "comment"
                    ? "Комментарий в жалобе"
                    : "Фон в жалобе"
              }
            >
              {report.author && (
                <div className="repost-card__header">
                  <Avatar
                    username={report.author.username}
                    displayName={report.author.displayName}
                    url={report.author.avatarUrl}
                    frame={report.author.avatarFrame}
                    size={36}
                  />
                  <div>
                    <button className="link-btn" onClick={() => openUser(report.author!)}>
                      {report.author.displayName || report.author.username}
                    </button>
                    <span className="repost-card__date muted">
                      {reportKind === "post"
                        ? "Запись"
                        : reportKind === "comment"
                          ? "Комментарий"
                          : "Фон"}
                      {report.target?.createdAt &&
                        " · " + new Date(report.target.createdAt).toLocaleString("ru-RU")}
                    </span>
                  </div>
                </div>
              )}
              {reportKind !== "wallpaper" && <p className="post-body">
                <LinkedText text={report.target?.content || report.snapshot?.content || "Текст недоступен"} />
              </p>}
              {contentState !== "published" && reportKind === "wallpaper" && report.target?.imageUrl && <ModeratedImages postId={report.post} kind="wallpaper" count={1} />}
              {contentState === "published" &&
                Boolean(report.target?.imageUrls?.length || report.target?.imageUrl) && (
                  <ImageGallery
                    images={
                      report.target?.imageUrls?.length
                        ? report.target.imageUrls
                        : [report.target!.imageUrl!]
                    }
                    alt="Вложение в жалобе"
                  />
                )}
            </aside>
            {report.decision && <p>Решение · {report.decision}</p>}

          </article>
        );
      })}
      {!selectedKind && <Pager cursor={cursor} next={queue.data?.nextCursor} setCursor={setCursor} />}
    </>
  );
}

function Content({ send }: { send: Send }) {
  const [kind, setKind] = useState<Kind | "all">("all");
  const [target, setTarget] = useState("");
  const [cursor, setCursor] = useState<string>();
  const contents = useQuery({
    queryKey: ["moderation", "content", kind, target, cursor],
    queryFn: () =>
      api<Page<NonNullable<Report["target"]> & { kind: Kind; author?: Person; musicAttachments?: MusicAttachmentDTO[] }>>(
        withQuery("/moderation/content", { kind, target: target || undefined, cursor }),
      ),
  });
  return (
    <>
      <form
        className="card moderation-card"
        onSubmit={(event) => {
          event.preventDefault();
          setTarget(String(new FormData(event.currentTarget).get("target")).trim());
          setCursor(undefined);
        }}
      >
        <label>
          Тип материала{" "}
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as Kind | "all");
              setCursor(undefined);
            }}
          >
            <option value="all">Все материалы</option>
            <option value="post">Записи</option>
            <option value="comment">Комментарии</option>
            <option value="wallpaper">Фоны</option>
          </select>
        </label>
        <label>
          ID материала <input name="target" pattern="[a-fA-F0-9]{24}" />
        </label>
        <div className="moderation-buttons">
          <button className="btn">Найти</button>
        </div>
      </form>
      {contents.error && (
        <p className="error" role="alert">
          {contents.error.message}
        </p>
      )}
      {contents.isLoading && <p>Загрузка…</p>}
      {contents.data?.items.length === 0 && <p>Материалы не найдены.</p>}
      {contents.data?.items.map((item) => {
        const path = "/moderation/content/" + item.kind + "/" + item._id;
        const state = item.moderationState ?? "published";
        return (
          <article key={item._id} className="card moderation-card">
            <strong>{states[state]}</strong>
            {state === "removed" && !item.purgedAt && <p>Материал удалён по прежним правилам и его содержимое сохранено. Чтобы удалить содержимое безвозвратно, нажмите «Удалить».</p>}
            {item.deletionPending && <p className="error">Удаление не завершено. Повторите действие.</p>}
            <span className="muted">
              {item.kind === "post" ? "Запись" : item.kind === "comment" ? "Комментарий" : "Фон"}
              {item.createdAt && " · " + new Date(item.createdAt).toLocaleString("ru-RU")}
            </span>
            {item.author && (
              <div className="moderation-person">
                <Avatar
                  username={item.author.username}
                  displayName={item.author.displayName}
                  url={item.author.avatarUrl}
                  frame={item.author.avatarFrame}
                  size={36}
                />
                <span>{item.author.displayName || item.author.username}</span>
              </div>
            )}
            {item.content && <p><LinkedText text={item.content} /></p>}
            {item.kind === "wallpaper" && item.name && <p>{item.name}</p>}
            {item.kind === "wallpaper" && item.imageUrl && <ModeratedImages postId={item._id} kind="wallpaper" count={1} />}
            {item.kind === "post" && Boolean(item.imageUrls?.length || item.imageUrl) && (
              <ModeratedImages postId={item._id} count={item.imageUrls?.length || 1} />
            )}
            {item.musicAttachments && item.musicAttachments.length > 0 && (
              <MusicAttachments attachments={item.musicAttachments} source={"moderation:" + item._id} />
            )}
            {!item.content && !item.name && !item.imageUrls?.length && !item.imageUrl && !item.musicAttachments?.length && (
              <p className="muted">Содержимое недоступно.</p>
            )}
            <div className="moderation-buttons">
              {state === "published" && (
                <ActionForm
                  label="Скрыть"
                  onAction={(reason) => send(path, { state: "hidden", reason })}
                />
              )}
              {(state === "published" || state === "hidden" || (state === "removed" && (!item.purgedAt || item.deletionPending))) && (
                <ActionForm
                  label="Удалить"
                  onAction={(reason) => send(path, { state: "removed", reason })}
                />
              )}
              {state === "hidden" && (
                <ActionForm
                  label="Восстановить"
                  onAction={(reason) => send(path, { state: "published", reason })}
                />
              )}
            </div>
          </article>
        );
      })}
      <Pager cursor={cursor} next={contents.data?.nextCursor} setCursor={setCursor} />
    </>
  );
}

export default function ModerationPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const cache = useQueryClient();
  const [section, setSection] = useState("Жалобы");
  useEffect(() => {
    if (params.has("report")) setSection("Жалобы");
  }, [params]);
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string>();
  const [selected, setSelected] = useState<Person>();
  const staff = user?.role === "admin" || user?.role === "moderator";
  const users = useQuery({
    queryKey: ["moderation", "users", search, cursor],
    queryFn: () => api<Page<User>>(withQuery("/moderation/users", { q: search, cursor })),
    enabled: staff && section === "Пользователи" && !selected,
  });
  const detail = useQuery({
    queryKey: ["moderation", "user", selected?._id],
    queryFn: () => api<User>("/moderation/users/" + selected?._id),
    enabled: staff && section === "Пользователи" && Boolean(selected),
  });
  const send: Send = async (path, body, method = "POST") => {
    await api(path, { method, body });
    await cache.invalidateQueries();
  };
  if (!staff || !user) return <Navigate to="/" replace />;
  return (
    <section className="moderation">
      <div className="moderation-page-header">
        <h1 className="page-title">Панель модерации</h1>
        <ModerationHelp />
      </div>
      <nav className="tabs feed-tabs moderation-tabs" aria-label="Панель модерации">
        {["Жалобы", "Пользователи", "Контент", "Журнал"].map((name) => (
          <button
            key={name}
            className={"tab" + (section === name ? " active" : "")}
            aria-pressed={section === name}
            onClick={() => {
              setSelected(undefined);
              setSection(name);
              if (name === "Жалобы") {
                if (params.has("report")) setParams({});
                void cache.invalidateQueries({ queryKey: ["moderation", "reports"] });
                void cache.invalidateQueries({ queryKey: ["moderation", "report"] });
              }
            }}
          >
            {name}
          </button>
        ))}
      </nav>
      {section === "Жалобы" && (
        <Reports
          send={send}
          openUser={(account) => {
            setSelected(account);
            setSection("Пользователи");
          }}
        />
      )}
      {section === "Журнал" && <HistoryList />}
      {section === "Контент" && <Content send={send} />}
      {section === "Пользователи" &&
        (selected ? (
          <>
            <button className="btn btn-outline" onClick={() => setSelected(undefined)}>
              К списку пользователей
            </button>
            {detail.error && (
              <p role="alert" className="error">
                {detail.error.message}
              </p>
            )}
            {detail.isLoading && <p>Загрузка…</p>}
            {detail.data && (
              <article className="card moderation-card">
                <div className="moderation-person">
                  <Avatar
                    username={detail.data.username}
                    displayName={detail.data.displayName}
                    url={detail.data.avatarUrl}
                    frame={detail.data.avatarFrame}
                    size={44}
                  />
                  <strong>
                    {detail.data.displayName || detail.data.username} · @{detail.data.username}
                  </strong>
                </div>
                <p>
                  {detail.data.role === "moderator"
                    ? "Модератор"
                    : detail.data.role === "admin"
                      ? "Администратор"
                      : "Пользователь"}
                </p>
                {(
                  [
                    ["Блокировка", detail.data.accountRestriction],
                    ["Запрет публикаций", detail.data.publishingRestriction],
                  ] as const
                ).map(
                  ([name, restriction]) =>
                    restriction && (
                      <p key={name}>
                        {name} · {restriction.reason} ·{" "}
                        {restriction.until
                          ? new Date(restriction.until).toLocaleString("ru-RU")
                          : "Бессрочно"}
                      </p>
                    ),
                )}
                {detail.data.warnings?.map((warning) => (
                  <div className="moderation-warning" key={warning._id}>
                    <p><strong>Предупреждение</strong> · {warning.reason} · {new Date(warning.time).toLocaleString("ru-RU")}</p>
                    {user.id !== detail.data!._id && detail.data!.role !== "admin" &&
                      (user.role === "admin" || detail.data!.role !== "moderator") && (
                      <ActionForm label="Снять предупреждение"
                        onAction={(reason) => send("/moderation/users/" + detail.data!._id + "/warnings/" + warning._id + "/lift", { reason })} />
                    )}
                  </div>
                ))}
                <UserActions
                  target={detail.data}
                  admin={user.role === "admin"}
                  self={user.id}
                  send={send}
                />
              </article>
            )}
            <h2>История наказаний</h2>
            <HistoryList key={selected._id} user={selected._id} />
          </>
        ) : (
          <>
            <form
              className="moderation-buttons"
              onSubmit={(event) => {
                event.preventDefault();
                setSearch(String(new FormData(event.currentTarget).get("search")));
                setCursor(undefined);
              }}
            >
              <label>
                Имя или ID профиля <input name="search" maxLength={75} defaultValue={search} />
              </label>
              <button className="btn">Найти</button>
            </form>
            {users.error && (
              <p role="alert" className="error">
                {users.error.message}
              </p>
            )}
            {users.isLoading && <p>Загрузка…</p>}
            {users.data?.items.length === 0 && <p>Пользователи не найдены.</p>}
            {users.data?.items.map((account) => (
              <article className="card moderation-card" key={account._id}>
                <div className="moderation-person">
                  <Avatar
                    username={account.username}
                    displayName={account.displayName}
                    url={account.avatarUrl}
                    frame={account.avatarFrame}
                    size={40}
                  />
                  <button className="link-btn" onClick={() => setSelected(account)}>
                    {account.displayName || account.username} · @{account.username}
                  </button>
                </div>
                {account.accountRestriction && <p>Аккаунт заблокирован</p>}
                {account.publishingRestriction && <p>Публикации запрещены</p>}
              </article>
            ))}
            <Pager cursor={cursor} next={users.data?.nextCursor} setCursor={setCursor} />
          </>
        ))}
    </section>
  );
}
