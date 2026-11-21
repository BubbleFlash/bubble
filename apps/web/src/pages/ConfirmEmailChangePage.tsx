import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { confirmEmailChangeSchema } from "@commune/shared";
import { api } from "../lib/api";

export default function ConfirmEmailChangePage() {
  const [params] = useSearchParams();
  const parsed = confirmEmailChangeSchema.safeParse({ token: params.get("token") });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (!parsed.success || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/auth/confirm-email-change", { method: "POST", body: parsed.data });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось подтвердить адрес.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="card auth">
    <h1>{done ? "Почта изменена" : "Подтверждение новой почты"}</h1>
    {done ? <><p>Теперь войдите с новым адресом.</p><a href="/login" className="btn block">Перейти ко входу</a></> : parsed.success ? (
      <button type="button" className="btn block" disabled={busy} onClick={() => void confirm()}>Подтвердить новый адрес</button>
    ) : <p className="error" role="alert">Ссылка подтверждения недействительна.</p>}
    {error && <p className="error" role="alert">{error} <Link to="/settings?tab=account">Запросить новую ссылку</Link></p>}
  </div>;
}
