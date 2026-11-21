import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

type Settings = { goalId: number | null; goals: { id?: number; title: string; current: number; target: number }[] };

export default function FundraiserSettings() {
  const client = useQueryClient();
  const key = ["admin", "fundraiser"];
  const settings = useQuery({ queryKey: key, queryFn: () => api<Settings>("/admin/fundraiser"), retry: false });
  const [goalId, setGoalId] = useState("");
  useEffect(() => { if (settings.data) setGoalId(String(settings.data.goalId ?? "")); }, [settings.data]);
  const save = useMutation({
    mutationFn: () => api("/admin/fundraiser", { method: "PUT", body: { goalId: Number(goalId) } }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: key }); void client.invalidateQueries({ queryKey: ["server-fundraiser"] }); },
  });
  return <section className="card moderation-card">
    <h2>Цель сбора</h2>
    <p>Данные с Boosty обновляются на GitHub каждые 15 минут. Сайт также обновляет их раз в 15 минут, поэтому новая цель может появиться с задержкой до 30 минут.</p>
    {settings.isPending && <p role="status">Загрузка…</p>}
    {settings.isError && <p className="error" role="alert">Не удалось загрузить цели. <button className="btn" onClick={() => void settings.refetch()}>Повторить</button></p>}
    {settings.data && <form className="moderation-action" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <label>Цель на сайте<select value={goalId} onChange={(event) => setGoalId(event.target.value)}>
        {settings.data.goals.filter((goal) => goal.id != null).map((goal) => <option key={goal.id} value={goal.id}>{goal.title} — {goal.current} из {goal.target} ₽</option>)}
      </select></label>
      {!settings.data.goals.some((goal) => goal.id === settings.data.goalId) && <p className="error">Выбранная цель отсутствует в данных.</p>}
      <button className="btn" disabled={!settings.data.goals.some((goal) => String(goal.id) === goalId) || save.isPending}>Сохранить</button>
      {save.isSuccess && <p role="status">Сохранено.</p>}
      {save.isError && <p className="error" role="alert">Не удалось сохранить цель.</p>}
    </form>}
  </section>;
}
