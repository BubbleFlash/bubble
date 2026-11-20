import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { siteContentFields, useSiteContent, type SiteContent } from "../lib/siteContent";

export default function SiteContentSettings() {
  const query = useSiteContent();
  const cache = useQueryClient();
  const [draft, setDraft] = useState<SiteContent | null>(null);
  useEffect(() => { if (query.data) setDraft(query.data); }, [query.data]);
  const save = useMutation({
    mutationFn: (content: SiteContent) => api<SiteContent>("/admin/site-content", { method: "PUT", body: content }),
    onSuccess: (content) => cache.setQueryData(["site-content"], content),
  });
  return <section className="card moderation-action"><h2>Тексты сайта</h2>
    <p>Изменения появятся на страницах правил и информации о Bubble.</p>
    {query.isError && <p role="alert" className="error">Не удалось загрузить тексты.</p>}
    {draft && <form className="site-content-editor" onSubmit={(event) => { event.preventDefault(); save.mutate(draft); }}>
      {siteContentFields.map(({ key, title }) => <label key={key}><span>{title}</span><textarea aria-label={title} rows={8} maxLength={30000} required value={draft[key]} onChange={(event) => { setDraft({ ...draft, [key]: event.target.value }); save.reset(); }} /></label>)}
      <button className="btn" disabled={save.isPending}>{save.isPending ? "Сохранение…" : "Сохранить"}</button>
      {save.isSuccess && <p role="status">Сохранено.</p>}{save.isError && <p role="alert" className="error">{save.error.message}</p>}
    </form>}
  </section>;
}
