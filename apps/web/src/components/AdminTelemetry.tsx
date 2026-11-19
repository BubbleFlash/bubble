import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  ApiMetricRow,
  MetricsReport,
  NetworkIncidentRow,
  NetworkReport,
  TelemetryHours,
} from "@commune/shared";
import { api } from "../lib/api";
import { downloadCsv } from "../lib/csv";

const dates = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "medium" });
const numbers = new Intl.NumberFormat("ru-RU");
const formatLatency = (value: number | null) =>
  value === null ? "—" : value < 0 ? "> 30 000" : numbers.format(value);
const exportLatency = (value: number | null) => (value === -1 ? ">30000" : value);
const kinds: Record<NetworkIncidentRow["kind"], string> = {
  http: "HTTP",
  network: "Ошибка сети",
  offline: "Офлайн",
  timeout: "Тайм-аут",
  closed: "Ответ прерван",
  "socket-connect": "Socket.IO не подключился",
  "socket-drop": "Socket.IO оборвался",
  "socket-limit": "Лимит соединений Socket.IO",
};

export function TelemetryPanel({ view }: { view: "metrics" | "network" }) {
  const [hours, setHours] = useState<TelemetryHours>("24");
  const [filter, setFilter] = useState("all");
  const query = useQuery({
    queryKey: ["admin-telemetry", view, hours],
    queryFn: ({ signal }) =>
      api<MetricsReport | NetworkReport>(`/admin/telemetry/${view}?hours=${hours}`, { signal }),
    refetchInterval: 60_000,
  });
  const report = query.data;
  const network =
    report && !("total" in report)
      ? report.rows.filter((row) => {
          if (filter === "429") return row.status === 429;
          if (filter === "5xx") return (row.status ?? 0) >= 500;
          if (filter === "connection") return row.kind !== "http";
          return true;
        })
      : [];

  const exportReport = () => {
    if (!report) return;
    const period = [report.from, report.until];
    if ("total" in report) {
      downloadCsv(
        "api-metrics",
        [
          "from_utc",
          "until_utc",
          "scope",
          "method",
          "endpoint",
          "requests",
          "4xx",
          "429",
          "5xx",
          "p95_upper_ms",
          "p99_upper_ms",
        ],
        [report.total, ...report.rows].map((row, index) => [
          ...period,
          index === 0 ? "total" : "endpoint",
          row.method,
          row.route,
          row.count,
          row.clientErrors,
          row.limited,
          row.serverErrors,
          exportLatency(row.p95Ms),
          exportLatency(row.p99Ms),
        ]),
      );
    } else {
      downloadCsv(
        "network-incidents",
        [
          "from_utc",
          "until_utc",
          "source",
          "kind",
          "method",
          "endpoint",
          "status",
          "limiter",
          "limit",
          "window_seconds",
          "retry_after_seconds",
          "request_id",
          "cf_ray",
          "count",
          "first_seen_utc",
          "last_seen_utc",
        ],
        network.map((row) => [
          ...period,
          row.source,
          row.kind,
          row.method,
          row.route,
          row.status,
          row.limiter,
          row.limit,
          row.windowSeconds,
          row.retryAfter,
          row.requestId,
          row.cfRay,
          row.count,
          row.firstSeen,
          row.lastSeen,
        ]),
      );
    }
  };

  return (
    <>
      <div className="card admin-monitor-toolbar">
        <div className="admin-monitor-control">
          <label htmlFor="monitor-period">Период</label>
          <select
            id="monitor-period"
            value={hours}
            onChange={(event) => setHours(event.target.value as TelemetryHours)}
          >
            <option value="1">Последний час</option>
            <option value="24">Последние сутки</option>
            <option value="168">Последние 7 дней</option>
          </select>
        </div>
        {view === "network" && (
          <div className="admin-monitor-control">
            <label htmlFor="monitor-events">События</label>
            <select id="monitor-events" value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="all">Все события</option>
              <option value="429">HTTP 429</option>
              <option value="5xx">HTTP 5xx</option>
              <option value="connection">Сбои соединения</option>
            </select>
          </div>
        )}
        <div className="row admin-monitor-actions">
          <button
            className="btn btn-outline"
            type="button"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Обновить
          </button>
          <button className="btn" type="button" disabled={!report} onClick={exportReport}>
            Скачать CSV
          </button>
        </div>
      </div>
      {query.isPending && (
        <p className="muted" role="status">
          Загрузка…
        </p>
      )}
      {query.isError && (
        <p className="error" role="alert">
          {query.error.message}
        </p>
      )}
      {report && (
        <p className="muted small admin-monitor-note">
          {dates.format(new Date(report.from))} — {dates.format(new Date(report.until))}
        </p>
      )}
      {report &&
        ("total" in report ? (
          <MetricsTable key={hours} total={report.total} rows={report.rows} />
        ) : (
          <NetworkTable key={`${hours}:${filter}`} rows={network} />
        ))}
    </>
  );
}

function MetricsTable({ total, rows }: { total: ApiMetricRow; rows: ApiMetricRow[] }) {
  const [visible, setVisible] = useState(30);
  return (
    <>
      <dl className="admin-monitor-kpis">
        {[
          ["Запросы API", numbers.format(total.count)],
          ["HTTP 429", numbers.format(total.limited)],
          ["HTTP 5xx", numbers.format(total.serverErrors)],
          ["p95, мс", formatLatency(total.p95Ms)],
          ["p99, мс", formatLatency(total.p99Ms)],
        ].map(([label, value]) => (
          <div className="card" key={label}>
            <dt className="muted">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="muted small admin-monitor-note">
        p95 и p99 — верхние границы интервалов длительности на стороне API.
      </p>
      {!rows.length ? (
        <p className="muted" role="status">
          За этот период запросов пока нет.
        </p>
      ) : (
        <div
          className="card admin-monitor-table-wrap"
          role="region"
          aria-label="Метрики по маршрутам"
          tabIndex={0}
        >
          <table className="admin-monitor-table">
            <thead>
              <tr>
                <th scope="col">Маршрут</th>
                <th scope="col">Запросы</th>
                <th scope="col">4xx</th>
                <th scope="col">429</th>
                <th scope="col">5xx</th>
                <th scope="col">p95, мс</th>
                <th scope="col">p99, мс</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, visible).map((row) => (
                <tr key={`${row.method} ${row.route}`}>
                  <th scope="row">
                    <code>
                      {row.method} {row.route}
                    </code>
                  </th>
                  <td>{numbers.format(row.count)}</td>
                  <td>{numbers.format(row.clientErrors)}</td>
                  <td>{numbers.format(row.limited)}</td>
                  <td>{numbers.format(row.serverErrors)}</td>
                  <td>{formatLatency(row.p95Ms)}</td>
                  <td>{formatLatency(row.p99Ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {visible < rows.length && (
        <button
          className="btn btn-outline admin-monitor-more"
          type="button"
          onClick={() => setVisible(visible + 30)}
        >
          Показать ещё
        </button>
      )}
    </>
  );
}

function NetworkTable({ rows }: { rows: NetworkIncidentRow[] }) {
  const [visible, setVisible] = useState(30);
  return (
    <>
      <p className="muted small admin-monitor-note">
        Один сбой может быть виден и API, и браузеру. Лимитер и его параметры указываются, когда их
        сообщил API.
      </p>
      {!rows.length ? (
        <p className="muted" role="status">
          За этот период событий по фильтру нет.
        </p>
      ) : (
        <div
          className="card admin-monitor-table-wrap"
          role="region"
          aria-label="Сетевые события"
          tabIndex={0}
        >
          <table className="admin-monitor-table admin-monitor-network">
            <thead>
              <tr>
                <th scope="col">Событие</th>
                <th scope="col">Маршрут</th>
                <th scope="col">Лимитер</th>
                <th scope="col">Число</th>
                <th scope="col">Последнее событие</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, visible).map((row) => (
                <tr
                  key={JSON.stringify([
                    row.source,
                    row.kind,
                    row.status,
                    row.method,
                    row.route,
                    row.limiter,
                    row.limit,
                    row.windowSeconds,
                  ])}
                >
                  <th scope="row">
                    <strong>{row.status ? `HTTP ${row.status}` : kinds[row.kind]}</strong>
                    <span className="muted small">{row.source === "api" ? "API" : "Браузер"}</span>
                  </th>
                  <td>
                    <code>{row.method === "OTHER" ? row.route : `${row.method} ${row.route}`}</code>
                  </td>
                  <td>
                    {row.limiter || (row.status === 429 ? "Причина неизвестна" : "—")}
                    {row.limit !== null && (
                      <span className="muted small">
                        {row.limit} за {row.windowSeconds} с
                      </span>
                    )}
                    {row.retryAfter !== null && (
                      <span className="muted small">Retry-After {row.retryAfter} с</span>
                    )}
                  </td>
                  <td>{numbers.format(row.count)}</td>
                  <td>
                    {dates.format(new Date(row.lastSeen))}
                    {(row.requestId || row.cfRay) && (
                      <details>
                        <summary>Идентификаторы</summary>
                        {row.requestId && (
                          <span className="small">
                            Request ID <code>{row.requestId}</code>
                          </span>
                        )}
                        {row.cfRay && (
                          <span className="small">
                            CF-Ray <code>{row.cfRay}</code>
                          </span>
                        )}
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {visible < rows.length && (
        <button
          className="btn btn-outline admin-monitor-more"
          type="button"
          onClick={() => setVisible(visible + 30)}
        >
          Показать ещё
        </button>
      )}
    </>
  );
}
