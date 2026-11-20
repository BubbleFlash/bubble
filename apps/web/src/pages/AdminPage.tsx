import { Link, Navigate, useSearchParams } from "react-router-dom";
import { telemetryMethods, telemetryPage, telemetryRoute } from "@commune/shared";
import { TelemetryPanel } from "../components/AdminTelemetry";
import { timeAgo } from "../components/PostCard";
import { useErrorEvents, useResolveError } from "../hooks/useErrors";
import { downloadCsv } from "../lib/csv";
import { useAuth } from "../store/auth";
import "../styles/admin-monitor.css";

const tabs = [
  { id: "errors", label: "Ошибки приложения" },
  { id: "metrics", label: "Метрики API" },
  { id: "network", label: "Сеть и 429" },
] as const;

function ErrorsPanel() {
  const errors = useErrorEvents(true);
  const resolve = useResolveError();
  const items = errors.data ?? [];
  const exportErrors = () =>
    downloadCsv(
      "application-errors",
      [
        "id",
        "source",
        "method",
        "route",
        "status",
        "category",
        "upstream_status",
        "request_id",
        "count",
        "first_seen_utc",
        "last_seen_utc",
        "resolved",
      ],
      items.map((event) => {
        const [method, path] = event.route.split(" ", 2);
        const verb = telemetryMethods.find((value) => value === method);
        return [
          event.id,
          event.source,
          verb,
          event.source === "web" ? telemetryPage(event.route) : telemetryRoute(verb ? (path ?? "") : event.route),
          event.status,
          event.category ?? "unknown",
          event.upstreamStatus,
          event.requestId,
          event.count,
          event.firstSeen,
          event.lastSeen,
          event.resolved,
        ];
      }),
    );
  return (
    <>
      <div className="card admin-monitor-toolbar">
        <p className="muted small">
          До 100 активных групп. CSV содержит сводку без текста и трассировок ошибок.
        </p>
        <div className="row admin-monitor-actions">
          <button
            className="btn btn-outline"
            type="button"
            disabled={errors.isFetching}
            onClick={() => void errors.refetch()}
          >
            Обновить
          </button>
          <button className="btn" type="button" disabled={!errors.data} onClick={exportErrors}>
            Скачать CSV
          </button>
        </div>
      </div>
      {errors.isLoading && <p className="muted center">Загрузка…</p>}
      {errors.isError && <p className="error center">{errors.error.message}</p>}
      {errors.isSuccess && items.length === 0 && (
        <p className="muted center">Активных ошибок нет.</p>
      )}
      {items.map((e) => (
        <article key={e.id} className="card report">
          <div className="report-head">
            <strong>{e.message}</strong>
            <span className="muted">
              {e.source === "web" ? "Браузер" : "API"} · {e.count}× · {timeAgo(e.lastSeen)}
            </span>
          </div>
          <p className="muted">{e.route}</p>
          {(e.category && e.category !== "unknown" || e.upstreamStatus || e.requestId) && <p className="muted small">
            {e.category && e.category !== "unknown" && `Категория: ${e.category} `}
            {e.upstreamStatus && `· Ответ внешнего сервиса: ${e.upstreamStatus} `}
            {e.requestId && `· Request ID: ${e.requestId}`}
          </p>}
          {e.stack && (
            <details>
              <summary className="muted">Трассировка ошибки</summary>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, overflowWrap: "anywhere" }}>
                {e.stack}
              </pre>
            </details>
          )}
          <div className="row report-actions">
            <button
              className="btn btn-outline"
              onClick={() => resolve.mutate(e.id)}
              disabled={resolve.isPending}
            >
              Отметить исправленной
            </button>
          </div>
        </article>
      ))}
    </>
  );
}

export default function AdminPage() {
  const { user, confirmed } = useAuth();
  const [params] = useSearchParams();
  const activeTab = tabs.find((tab) => tab.id === params.get("tab"))?.id ?? "errors";
  if (user?.role === "admin" && !confirmed)
    return (
      <p className="muted" role="status">
        Проверяем сеанс…
      </p>
    );
  if (user?.role !== "admin") return <Navigate to="/" replace />;
  return (
    <section className="admin-monitor">
      <h1 className="page-title">Мониторинг</h1>
      <nav className="tabs feed-tabs moderation-tabs" aria-label="Разделы мониторинга">
        {tabs.map(({ id, label }) => (
          <Link
            key={id}
            className={`tab${activeTab === id ? " active" : ""}`}
            to={id === "errors" ? "/admin/errors" : `/admin/errors?tab=${id}`}
            aria-current={activeTab === id ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      {activeTab === "errors" ? (
        <ErrorsPanel />
      ) : (
        <TelemetryPanel key={activeTab} view={activeTab} />
      )}
    </section>
  );
}
