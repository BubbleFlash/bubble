import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";

type Groups = { developers: string[]; artists: string[]; testers: string[] };
type Draft = { [K in keyof Groups]: string };
const labels: { key: keyof Groups; label: string }[] = [
  { key: "developers", label: "Разработчики" },
  { key: "artists", label: "Художники" },
  { key: "testers", label: "Тестировщики" },
];
const toDraft = (groups: Groups): Draft => ({ developers: groups.developers.join("\n"), artists: groups.artists.join("\n"), testers: groups.testers.join("\n") });

export default function SiteTeamSettings() {
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "site-team"], queryFn: () => api<Groups>("/admin/site-team") });
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => { if (query.data) setDraft(toDraft(query.data)); }, [query.data]);
  const save = useMutation({
    mutationFn: (groups: Groups) => api<Groups>("/admin/site-team", { method: "PUT", body: groups }),
    onSuccess: (groups) => { cache.setQueryData(["admin", "site-team"], groups); void cache.invalidateQueries({ queryKey: ["site-team"] }); },
  });
  const parse = (text: string) => text.split(/[\n,]+/).map((name) => name.trim()).filter(Boolean);
  const error = save.error instanceof ApiError && save.error.serverMessage?.startsWith("Не найдены аккаунты:") ? save.error.serverMessage : save.error?.message;
  return <section className="card moderation-action"><h2>Команда проекта</h2>
    <p>Укажите ID профилей Bubble, по одному в строке. Имена на странице будут обновляться вместе с профилями. Модераторы и администраторы добавляются автоматически по роли.</p>
    {query.isError && <p className="error" role="alert">Не удалось загрузить команду.</p>}
    {draft && <form className="site-content-editor" onSubmit={(event) => { event.preventDefault(); save.mutate({ developers: parse(draft.developers), artists: parse(draft.artists), testers: parse(draft.testers) }); }}>
      {labels.map(({ key, label }) => <label key={key}><span>{label}</span><textarea aria-label={`Аккаунты: ${label}`} rows={3} value={draft[key]} onChange={(event) => { setDraft({ ...draft, [key]: event.target.value }); save.reset(); }} /></label>)}
      <button className="btn" disabled={save.isPending}>{save.isPending ? "Сохранение…" : "Сохранить команду"}</button>
      {save.isSuccess && <p role="status">Команда сохранена.</p>}{save.isError && <p className="error" role="alert">{error}</p>}
    </form>}
  </section>;
}
