import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";

type Period = { from: string; to: string };
type ExportRecord = Period & { exportedAt: string };
type ExportGroup = { id: string; name: string; slug: string };
type ExportFile = ExportRecord & { community: Pick<ExportGroup, "name" | "slug">; posts: unknown[] };
const endpoint = "/admin/feedback-export";
const key = ["admin", "feedback-export"];

function formatDay(value: string) {
  return new Date(value).toLocaleDateString("ru-RU", { timeZone: "UTC" });
}

export default function AdminFeedbackExport() {
  const cache = useQueryClient();
  const { user } = useAuth();
  const storageKey = `bubble-feedback-group-${user?.id ?? ""}`;
  const groups = useQuery({ queryKey: [...key, "groups"], queryFn: () => api<ExportGroup[]>(`${endpoint}/groups`) });
  const [selectedId, setSelectedId] = useState<string>(() => {
    try { return localStorage.getItem(storageKey) ?? ""; } catch { return ""; }
  });
  const [search, setSearch] = useState("");
  const feedbackGroups = groups.data?.filter((group) => group.name === "Жалобы и предложения Bubble");
  const defaultId = feedbackGroups?.length === 1 ? feedbackGroups[0]?.id : undefined;
  const groupId = groups.data?.some((group) => group.id === selectedId) ? selectedId : defaultId ?? "";
  const selectedGroup = groups.data?.find((group) => group.id === groupId);
  const matchingGroups = groups.data?.filter((group) => group.id === groupId || `${group.name} ${group.slug}`.toLocaleLowerCase("ru").includes(search.trim().toLocaleLowerCase("ru")));
  const last = useQuery({
    queryKey: [...key, "last", groupId],
    queryFn: ({ signal }) => api<ExportRecord | null>(`${endpoint}/${groupId}`, { signal }),
    enabled: Boolean(selectedGroup),
  });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const download = useMutation({
    mutationFn: ({ id, period }: { id: string; period: Period }) => api<ExportFile>(`${endpoint}/${id}`, { method: "POST", body: period }),
    onSuccess: (data, { id }) => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `bubble-${data.community.slug}-${data.from}-${data.to}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      void cache.invalidateQueries({ queryKey: [...key, "last", id], exact: true });
    },
  });
  const canDownload = selectedGroup && from && to && from <= to && !download.isPending;

  return (
    <section aria-label="Выгрузка записей группы">
      <form className="card admin-monitor-toolbar" onSubmit={(event) => {
        event.preventDefault();
        if (canDownload) download.mutate({ id: selectedGroup.id, period: { from, to } });
      }}>
        <label className="admin-monitor-control">Поиск группы
          <input className="aero-input" type="search" value={search} placeholder="Название или адрес" onChange={(event) => setSearch(event.target.value)} />
        </label>
        <label className="admin-monitor-control">Группа
          <select className="aero-input" required value={selectedGroup?.id ?? ""} disabled={groups.isPending || download.isPending} onChange={(event) => {
            setSelectedId(event.target.value);
            try { localStorage.setItem(storageKey, event.target.value); } catch { /* Selection remains available in this tab. */ }
            download.reset();
          }}>
            <option value="" disabled>{groups.isPending ? "Загрузка групп…" : "Выберите группу"}</option>
            {matchingGroups?.map((group) => <option key={group.id} value={group.id}>{group.name} · {group.slug}</option>)}
          </select>
        </label>
        <label className="admin-monitor-control">С даты (UTC)
          <input className="aero-input" lang="ru-RU" type="date" required value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
          {from && <small>{formatDay(from)}</small>}
        </label>
        <label className="admin-monitor-control">По дату включительно (UTC)
          <input className="aero-input" lang="ru-RU" type="date" required value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
          {to && <small>{formatDay(to)}</small>}
        </label>
        <button className="btn" disabled={!canDownload}>
          {download.isPending ? "Готовим выгрузку…" : "Скачать JSON"}
        </button>
      </form>
      <p className="muted admin-monitor-note">В файл попадут записи выбранной группы за указанные даты и комментарии к ним.</p>
      {groups.isError && <p className="error" role="alert">Не удалось загрузить группы. <button className="link-btn" type="button" onClick={() => void groups.refetch()}>Повторить</button></p>}
      {groups.isSuccess && !groups.data.length && <p className="muted admin-monitor-note">Групп пока нет.</p>}
      {last.data && <p className="admin-monitor-note">Последняя выгрузка за {formatDay(last.data.from)} — {formatDay(last.data.to)} (UTC). Сформирована {new Date(last.data.exportedAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}.</p>}
      {last.isSuccess && !last.data && <p className="muted admin-monitor-note">Выгрузок пока нет.</p>}
      {last.isError && <p className="error" role="alert">Не удалось получить период последней выгрузки.</p>}
      {download.isSuccess && <p role="status">Выгружено записей: {download.data.posts.length}.</p>}
      {download.isError && <p className="error" role="alert">{download.error.message}</p>}
    </section>
  );
}
