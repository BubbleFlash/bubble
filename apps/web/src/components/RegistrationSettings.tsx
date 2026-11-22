import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

type Settings = { registrationClosed: boolean };
const path = "/admin/registration";
const queryKey = ["admin", "registration"];

export default function RegistrationSettings() {
  const client = useQueryClient();
  const settings = useQuery({ queryKey, queryFn: () => api<Settings>(path), retry: false });
  const save = useMutation({
    mutationFn: (registrationClosed: boolean) => api<Settings>(path, { method: "PUT", body: { registrationClosed } }),
    onSuccess: (result) => client.setQueryData(queryKey, result),
  });

  const closed = settings.data?.registrationClosed;
  return <section className="card moderation-card">
    <h2>Регистрация</h2>
    <p>Пауза действует на создание аккаунтов по почте и через Google. Пользователи с аккаунтом могут войти.</p>
    {settings.isPending && <p role="status">Загрузка…</p>}
    {settings.isError && <p className="error" role="alert">{settings.error.message} <button className="btn" onClick={() => void settings.refetch()}>Повторить</button></p>}
    {closed !== undefined && <>
      <p role="status">{closed ? "Регистрация приостановлена." : "Регистрация открыта."}</p>
      <button className="btn" disabled={save.isPending} onClick={() => save.mutate(!closed)}>
        {closed ? "Открыть регистрацию" : "Приостановить регистрацию"}
      </button>
    </>}
    {save.isError && <p className="error" role="alert">{save.error.message}</p>}
  </section>;
}
