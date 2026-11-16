import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import type { AvatarFrame, ReportReason } from "@commune/shared";
import { api } from "../lib/api";
import Avatar from "./Avatar";
import NavigationIcon from "./NavigationIcon";
import { REASON_LABELS } from "./ReportForm";

type Report = {
  _id: string;
  kind: "post" | "comment" | "wallpaper";
  reason: ReportReason;
  createdAt: string;
  reporter?: { username: string; displayName?: string; avatarUrl?: string | null; avatarFrame?: AvatarFrame | null };
  author?: { username: string; displayName?: string };
  target?: { content?: string; name?: string };
  snapshot?: { content?: string };
};
type Reports = { items: Report[]; nextCursor: string | null };

export default function ReportMenu() {
  const location = useLocation();
  const [openedAt, setOpenedAt] = useState<typeof location | null>(null);
  const open = openedAt === location;
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const reports = useQuery({
    queryKey: ["moderation", "reports", "all", "open", undefined],
    queryFn: () => api<Reports>("/moderation/reports?kind=all&status=open"),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (openedAt && !open) setOpenedAt(null);
  }, [open, openedAt]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpenedAt(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setOpenedAt(null);
      if (root.current?.contains(document.activeElement)) button.current?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const count = reports.data?.items.length ?? 0;
  return <div className="notification-menu" ref={root} onBlur={(event) => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpenedAt(null);
  }}>
    <button type="button" ref={button} className="icon-btn" aria-label="Жалобы пользователей"
      aria-description={count ? `Открытых жалоб: ${reports.data?.nextCursor ? "более 30" : count}` : undefined}
      aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { if (open) setOpenedAt(null); else { setOpenedAt(location); void reports.refetch(); } }}>
      <NavigationIcon name="flag" size={22} />
      {count > 0 && <span aria-hidden="true" className="badge">{reports.data?.nextCursor ? "30+" : count}</span>}
    </button>
    {open && <section className="notification-popup" id={id} aria-label="Последние жалобы">
      <div className="notification-filter"><strong>Открытые жалобы</strong></div>
      <div className="notification-list notification-list-compact report-popup-list">
        {reports.isLoading && <p role="status">Загрузка…</p>}
        {reports.isError && <p className="error" role="alert">{reports.error.message} <button type="button" className="link-btn" onClick={() => void reports.refetch()}>Повторить</button></p>}
        {reports.isSuccess && count === 0 && <p className="muted">Открытых жалоб нет.</p>}
        {reports.data?.items.map((report) => <Link className="notification report-popup-item" key={report.kind + report._id}
          to={`/moderation?report=${report._id}&kind=${report.kind}`} onClick={() => setOpenedAt(null)}>
          {report.reporter && <Avatar username={report.reporter.username} displayName={report.reporter.displayName} url={report.reporter.avatarUrl} frame={report.reporter.avatarFrame} size={32} />}
          <span><strong>{REASON_LABELS[report.reason]}</strong><br />
            {report.kind === "post" ? "Запись" : report.kind === "comment" ? "Комментарий" : "Фон"} · {report.reporter?.displayName || report.reporter?.username || "Аккаунт удалён"}
            {report.author && <> → {report.author.displayName || report.author.username}</>}
            {(report.target?.content || report.target?.name || report.snapshot?.content) && <span className="report-popup-preview">{report.target?.content || report.target?.name || report.snapshot?.content}</span>}
          </span>
          <time className="muted" dateTime={report.createdAt}>{new Date(report.createdAt).toLocaleDateString("ru-RU")}</time>
        </Link>)}
      </div>
      <Link className="notification-popup-link" to="/moderation" onClick={() => setOpenedAt(null)}>Открыть все жалобы</Link>
    </section>}
  </div>;
}
