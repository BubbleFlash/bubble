import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { AccountUser } from "@commune/shared";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import { useDialogBackdrop } from "../hooks/useDialogBackdrop";
import AeroTitlebar from "./AeroTitlebar";

type Action = "email" | "password" | "delete";
const errorText = (error: unknown) => error instanceof Error ? error.message : "Не удалось выполнить действие.";

function AccountDialog({ action, busy, onClose, children }: { action: Action; busy: boolean; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => { if (!busy) onClose(); };
  const backdrop = useDialogBackdrop(close);
  const title = action === "email" ? "Изменить почту" : action === "password" ? "Изменить пароль" : "Удалить аккаунт";

  useEffect(() => {
    const element = dialog.current!;
    const trigger = document.activeElement;
    element.showModal();
    element.querySelector("input")?.focus();
    return () => {
      element.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog ref={dialog} {...backdrop} className="aero-dialog account-settings-dialog" aria-labelledby="account-dialog-title"
      onCancel={(event) => { event.preventDefault(); close(); }}>
      <AeroTitlebar onClose={close} closeLabel="Закрыть окно"><h2 id="account-dialog-title">{title}</h2></AeroTitlebar>
      <div className="aero-dialog__body">{children}</div>
    </dialog>
  );
}

export default function AccountSettings({ user }: { user: AccountUser }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [action, setAction] = useState<Action>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || busy) return;
    const form = new FormData(event.currentTarget);
    const currentPassword = form.get("currentPassword");
    const password = form.get("password");
    if (action === "password" && password !== form.get("confirmPassword")) {
      setError("Пароли не совпадают.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      if (action === "email") {
        await api("/auth/change-email", { method: "POST", body: { email: form.get("email"), currentPassword } });
        setNotice("Письмо отправлено на новый адрес. Текущая почта изменится после подтверждения.");
        setAction(undefined);
      } else if (action === "password") {
        await api("/auth/change-password", { method: "POST", body: { password, currentPassword } });
        await logout();
        navigate("/login", { replace: true, state: { accountNotice: "Пароль изменён. Войдите с новым паролем." } });
      } else {
        const result = await api<{ restoreUntil: string }>("/auth/delete-account", {
          method: "POST", body: { confirmation: form.get("confirmation") },
        });
        await logout();
        const date = new Date(result.restoreUntil).toLocaleDateString("ru-RU", { dateStyle: "long" });
        navigate("/login", { replace: true, state: { accountNotice: `Профиль скрыт. Для восстановления войдите до ${date}.` } });
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  function choose(next?: Action) {
    setAction(next);
    setError("");
    setNotice("");
  }

  return (
    <section className="card appearance-section" aria-labelledby="account-title">
      <h2 id="account-title">Аккаунт</h2>
      {user.email && <p>Почта для входа: <strong>{user.email}</strong></p>}
      <div className="row">
        <button type="button" className="btn" disabled={busy} onClick={() => choose("email")}>Изменить почту</button>
        <button type="button" className="btn" disabled={busy} onClick={() => choose("password")}>Изменить пароль</button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {action && (
        <AccountDialog action={action} busy={busy} onClose={() => choose()}>
        <form key={action} className="account-settings-form" onSubmit={(event) => void submit(event)}>
          <fieldset disabled={busy}>
            {action === "delete" ? (
              <>
                <p>Профиль будет скрыт. В течение 7 месяцев его можно восстановить входом в аккаунт. После этого профиль будет обезличен, а опубликованные материалы останутся.</p>
                <label>Введите «УДАЛИТЬ» для подтверждения
                  <input name="confirmation" autoComplete="off" required pattern="УДАЛИТЬ" />
                </label>
              </>
            ) : (
              <>
                <label>Текущий пароль<input name="currentPassword" type="password" autoComplete="current-password" maxLength={128} required /></label>
                {action === "email" ? (
                  <label>Новый адрес почты<input name="email" type="email" autoComplete="email" required /></label>
                ) : (
                  <>
                    <label>Новый пароль<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label>
                    <label>Повторите новый пароль<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label>
                  </>
                )}
              </>
            )}
            {error && <p className="error" role="alert">{error}</p>}
            <div className="row">
              <button type="submit" className={`btn${action === "delete" ? " btn-danger" : ""}`}>
                {busy ? "Подождите…" : action === "email" ? "Отправить ссылку" : action === "password" ? "Сохранить пароль" : "Скрыть аккаунт"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => choose()}>Отмена</button>
            </div>
          </fieldset>
        </form>
        </AccountDialog>
      )}
      <button type="button" className="btn btn-ghost danger account-delete-button" disabled={busy} onClick={() => choose("delete")}>Удалить аккаунт</button>
    </section>
  );
}
