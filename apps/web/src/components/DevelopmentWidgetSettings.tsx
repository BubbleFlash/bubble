import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export default function DevelopmentWidgetSettings() {
  const cache = useQueryClient();
  const settings = useQuery({ queryKey: ["admin", "development-widget"], queryFn: () => api<{ communitySlug: string }>("/admin/development-widget") });
  const [slug, setSlug] = useState("");
  useEffect(() => { if (settings.data) setSlug(settings.data.communitySlug); }, [settings.data]);
  const save = useMutation({ mutationFn: () => api<{ communitySlug: string }>("/admin/development-widget", { method: "PUT", body: { communitySlug: slug.trim().toLowerCase() } }), onSuccess: (data) => { cache.setQueryData(["admin", "development-widget"], data); void cache.invalidateQueries({ queryKey: ["development-widget"] }); void cache.invalidateQueries({ queryKey: ["site-updates"] }); } });
  return <section className="card moderation-action"><h2>Дневник разработки</h2>
    <p>Укажите адрес сообщества без c/. Последняя запись появится в виджете. Пустое поле отключает выбор сообщества.</p>
    {settings.isError ? <p className="error" role="alert">Не удалось загрузить настройку.</p> : <form className="moderation-action" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <label>Адрес сообщества<input value={slug} maxLength={24} onChange={(event) => setSlug(event.target.value)} placeholder="bubble" /></label>
      <button className="btn" disabled={settings.isPending || save.isPending}>Сохранить</button>
      {save.isSuccess && <p role="status">Сохранено.</p>}{save.isError && <p className="error" role="alert">{save.error.message}</p>}
    </form>}
  </section>;
}
