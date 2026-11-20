import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export default function OnlineCount() {
  const online = useQuery({
    queryKey: ["online-count"],
    queryFn: () => api<{ count: number | null }>("/online-count"),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const count = online.data?.count;
  return <section className="aero-widget online-count" aria-label="Сейчас онлайн">
    <span className="online-count__dot" data-available={typeof count === "number"} aria-hidden="true" />
    <span>{typeof count === "number" ? `${count.toLocaleString("ru-RU")} Онлайн` : online.isPending ? "Онлайн: загрузка…" : "Онлайн: нет данных"}</span>
  </section>;
}
