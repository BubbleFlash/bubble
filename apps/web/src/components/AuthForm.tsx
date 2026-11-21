import { useId, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { loginSchema, registerSchema, type RegistrationCaptcha } from "@commune/shared";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../store/auth";
import GoogleButton, { GOOGLE_CLIENT_ID } from "./GoogleButton";

export default function AuthForm({ mode, compact = false }: { mode: "login" | "register"; compact?: boolean }) {
  const { user, login, register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const [fields, setFields] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [registrationSent, setRegistrationSent] = useState(false);
  const [answer, setAnswer] = useState("");
  const formId = useId();
  const captcha = useQuery({
    queryKey: ["registration-captcha", formId],
    queryFn: ({ signal }) => api<RegistrationCaptcha>("/auth/register/captcha", { method: "POST", signal }),
    enabled: mode === "register" && !user,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const refreshCaptcha = () => {
    setAnswer("");
    void captcha.refetch();
  };
  const challenge = captcha.data?.required ? captcha.data : null;
  const registrationReady = captcha.isSuccess && !captcha.isFetching && (!challenge || /^\d{6}$/.test(answer.trim()));

  if (user) return <Navigate to="/" replace />;
  if (registrationSent) return (
    <div className={`card auth${compact ? " auth--compact" : ""}`} role="status">
      <h2>Проверьте почту</h2>
      <p>Мы отправили письмо на <span className="auth-confirmation-email">{fields.email}</span>. Откройте его и перейдите по ссылке, чтобы подтвердить адрес и войти в Bubble. Если письма нет, проверьте папку «Спам» — оно могло попасть туда.</p>
    </div>
  );

  const set = (key: keyof typeof fields) => (e: ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || (mode === "register" && !registrationReady)) return;
    setError(null);
    const parsed =
      mode === "login" ? loginSchema.safeParse(fields) : registerSchema.safeParse(fields);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      setError(field === "username"
        ? "ID профиля должен содержать от 3 до 24 латинских букв, цифр или знаков подчёркивания."
        : field === "email"
          ? "Введите корректный адрес почты."
          : mode === "register"
            ? "Пароль должен содержать минимум 8 символов."
            : "Введите пароль.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") await login(loginSchema.parse(fields));
      else await register({ ...registerSchema.parse(fields), ...(challenge && { captcha: { id: challenge.id, answer } }) });
      if (mode === "register") setRegistrationSent(true);
      else navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Что-то пошло не так");
      if (mode === "register" && !(err instanceof ApiError && err.status === 429)) refreshCaptcha();
    } finally {
      setBusy(false);
    }
  };

  const google = async (credential: string) => {
    setError(null);
    setBusy(true);
    try {
      await loginWithGoogle(credential);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти через Google");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={`card auth${compact ? " auth--compact" : ""}`} onSubmit={(e) => void submit(e)}>
      {!compact && <h1>{mode === "login" ? "С возвращением" : "Присоединяйтесь к Bubble"}</h1>}
      {GOOGLE_CLIENT_ID && (
        <>
          <GoogleButton
            onCredential={(c) => void google(c)}
            text={mode === "login" ? "signin_with" : "signup_with"}
          />
          <p className="divider">
            <span>или используйте электронную почту</span>
          </p>
        </>
      )}
      {mode === "register" && (
        <label>

          ID профиля
          <input value={fields.username} onChange={set("username")} autoComplete="username" />
        </label>
      )}
      <label>

        Электронная почта
        <input type="email" value={fields.email} onChange={set("email")} autoComplete="email" />
      </label>
      <label>

        Пароль
        <input
          type="password"
          value={fields.password}
          onChange={set("password")}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </label>
      {notice && mode === "login" && <p className="notice">{notice}</p>}
      {mode === "register" && (challenge || captcha.isFetching || captcha.isError) && (
        <div className="auth-captcha">
          {captcha.isFetching && <p role="status">Загружаем проверочный код…</p>}
          {captcha.isError && <p className="error" role="alert">{captcha.error.message}</p>}
          {challenge && !captcha.isError && !captcha.isFetching && (
            <>
              <div className="auth-captcha__image-row">
                <img width={200} height={64} src={challenge.image} alt="Картинка с проверочным кодом" />
                <button type="button" className="btn auth-captcha__refresh" onClick={refreshCaptcha} disabled={busy}
                  aria-label="Обновить картинку" title="Обновить картинку">
                  <span className="material-symbols-rounded" aria-hidden="true">&#xe5d5;</span>
                </button>
              </div>
              <label>
                Код с картинки
                <input value={answer} onChange={(event) => setAnswer(event.target.value)}
                  inputMode="numeric" maxLength={6} autoComplete="off" disabled={busy} />
              </label>
            </>
          )}
          {captcha.isError && <button type="button" className="btn" onClick={refreshCaptcha} disabled={busy || captcha.isFetching}>Загрузить код</button>}
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {mode === "login" && (
        <p className="muted right">
          <Link to="/forgot-password">Забыли пароль?</Link>
        </p>
      )}
      <button className="btn block" disabled={busy || (mode === "register" && !registrationReady)}>
        {busy ? "Подождите…" : mode === "login" ? "Войти" : "Создать аккаунт"}
      </button>
      {mode === "register" && <p className="muted">Нажимая «Создать аккаунт», вы принимаете <Link to="/rules" target="_blank" rel="noopener noreferrer">Правила сообщества</Link>.</p>}
      {!compact && <p className="muted center">
        {mode === "login" ? (
          <>

            Впервые здесь? <Link to="/register">Создать аккаунт</Link>
          </>
        ) : (
          <>

            Уже есть аккаунт? <Link to="/login">Войти</Link>
          </>
        )}
      </p>}
    </form>
  );
}
