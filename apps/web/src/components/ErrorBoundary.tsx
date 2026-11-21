import { Component, useEffect, type ReactNode } from "react";
import { Link, useRouteError } from "react-router-dom";
import { isChunkError, reportError } from "../lib/report";
import { OFFICIAL_TELEGRAM_URL } from "../lib/support";

const RELOAD_KEY = "bubble_chunk_reloaded_at";
const RELOAD_COOLDOWN_MS = 10 * 60_000;

function recover(error: unknown, preservePlayback = false) {
  reportError("react", error);
  if (preservePlayback || !isChunkError(error) || navigator.onLine === false) return;
  try {
    const now = Date.now();
    if (now - Number(sessionStorage.getItem(RELOAD_KEY)) < RELOAD_COOLDOWN_MS) return;
    sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    return;
  }
  window.location.reload();
}

interface State {
  failed: boolean;
}

/**
 * Report a render failure and offer a way back. A failed module load may recover on reload
 * when the tab has an outdated entry point after a deployment.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode; routeKey?: string; preservePlayback?: boolean }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    recover(error, this.props.preservePlayback);
  }

  componentDidUpdate(previous: Readonly<{ routeKey?: string }>) {
    if (this.state.failed && previous.routeKey !== this.props.routeKey) this.setState({ failed: false });
  }

  render() {
    return this.state.failed
      ? <RecoveryCard embedded={this.props.routeKey !== undefined} preservePlayback={this.props.preservePlayback} />
      : this.props.children;
  }
}

export function RouteErrorBoundary() {
  const error = useRouteError();
  useEffect(() => recover(error), [error]);
  return <RecoveryCard />;
}

function RecoveryCard({ embedded, preservePlayback }: { embedded?: boolean; preservePlayback?: boolean }) {
  const reload = () => {
    try {
      // This document request already serves as the retry.
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch { /* The user can still reload when storage is disabled. */ }
    window.location.reload();
  };
  return (
    <div
      className="card center"
      role="alert"
      style={{ margin: embedded ? "1rem auto" : "20vh auto 0", maxWidth: 420, padding: 24 }}
    >
      <h1 className="page-title">Страница не загрузилась</h1>
      <p className="muted">{preservePlayback ? "После обновления страницы плеер восстановит очередь." : "Обновите страницу или вернитесь на главную."}</p>
      <button type="button" className="btn btn-primary" onClick={reload}>
        Обновить страницу
      </button>
      <p>{embedded ? <Link to="/">На главную</Link> : <a href="/">На главную</a>}</p>
      <p><a href={OFFICIAL_TELEGRAM_URL} target="_blank" rel="noopener noreferrer">Bubble в Telegram</a></p>
    </div>
  );
}
