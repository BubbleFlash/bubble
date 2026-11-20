import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

type Settings = { available: boolean; enabled: boolean; username: string; configured: boolean };

function Form({ settings }: { settings: Settings }) {
  const client = useQueryClient();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: (body: { enabled: boolean; username?: string; password?: string }) => api<Settings>("/admin/test-gate", { method: "PUT", body }),
    onSuccess: (result) => { client.setQueryData(["admin", "test-gate"], result); setUsername(""); setPassword(""); },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (Boolean(username.trim()) !== Boolean(password)) { setError("Введите и логин, и пароль для изменения доступа."); return; }
    if (enabled && !settings.configured && !password) { setError("Задайте логин и пароль для тестового доступа."); return; }
    setError("");
    save.mutate({ enabled, ...(password ? { username: username.trim(), password } : {}) });
  };
  return <form className="card moderation-card" onSubmit={submit}>
    <h2>Тестовый доступ</h2>
    <p>При включении посетители сначала вводят общий логин и пароль, затем входят в свои аккаунты Bubble.</p>
    <label className="row"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Включить тестовый режим</label>
    <p>Текущий логин: <strong>{settings.username || "не задан"}</strong>. Пароль не отображается.</p>
    <label>Новый логин<input className="aero-input" value={username} maxLength={100} autoComplete="off" onChange={(event) => setUsername(event.target.value)} /></label>
    <label>Новый пароль<input className="aero-input" type="password" value={password} minLength={8} maxLength={128} autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} /></label>
    <p className="muted">Чтобы сохранить прежний логин и пароль, оставьте оба поля пустыми. Изменение доступа завершит прежние тестовые сеансы.</p>
    {(error || save.error) && <p className="error" role="alert">{error || save.error?.message}</p>}
    {save.isSuccess && <p role="status">Настройки сохранены.</p>}
    <button className="btn" disabled={save.isPending}>{save.isPending ? "Сохранение…" : "Сохранить"}</button>
  </form>;
}

export default function TestGateSettings() {
  const settings = useQuery({ queryKey: ["admin", "test-gate"], queryFn: () => api<Settings>("/admin/test-gate"), retry: false });
  if (settings.isLoading) return <p>Загрузка…</p>;
  if (settings.isError) return <p className="error" role="alert">{settings.error.message}</p>;
  if (!settings.data?.available) return <p className="card">Тестовый доступ не настроен на этом сервере.</p>;
  return <Form settings={settings.data} />;
}
