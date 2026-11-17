import { Navigate } from "react-router-dom";
import { timeAgo } from "../components/PostCard";
import { useErrorEvents, useResolveError } from "../hooks/useErrors";
import { useAuth } from "../store/auth";

function ErrorsPanel() {
  const errors = useErrorEvents(true);
  const resolve = useResolveError();
  const items = errors.data ?? [];
  return (
    <>
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
  const { user } = useAuth();
  if (user?.role !== "admin") return <Navigate to="/" replace />;
  return <>
    <h1 className="page-title">Ошибки приложения</h1>
    <ErrorsPanel />
  </>;
}
