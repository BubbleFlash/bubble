import { useQuery } from "@tanstack/react-query";
import type { ServerFundraiserDTO } from "@commune/shared";
import { api } from "../lib/api";
import AeroProgress from "./AeroProgress";

const formatAmount = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const FRESH_MS = 15 * 60 * 1000;

export default function ServerFundraiser() {
  const goal = useQuery({
    queryKey: ["server-fundraiser"],
    queryFn: () => api<ServerFundraiserDTO>("/server-fundraiser"),
    refetchInterval: (query) => query.state.status === "error" ? 60 * 1000 : FRESH_MS,
    refetchOnWindowFocus: true,
    staleTime: FRESH_MS,
  });
  return <section className="aero-widget server-fundraiser">
    <strong>{goal.data?.title ?? "Сбор на сервер"}</strong>
    <div className="server-fundraiser__body">
      {goal.data ? <>
        <p className="server-fundraiser__amount"><b>{formatAmount.format(goal.data.current)} ₽ из {formatAmount.format(goal.data.target)} ₽</b> собрано</p>
        <AeroProgress label={goal.data.title} value={goal.data.current} max={goal.data.target} valueText={`${formatAmount.format(goal.data.current)} ₽ из ${formatAmount.format(goal.data.target)} ₽`} />
        {goal.isError && <p className="server-fundraiser__status" role="status">Не удалось обновить данные.</p>}
      </> : goal.isPending ? <p role="status">Загрузка сбора…</p> : <p className="server-fundraiser__status" role="status">Не удалось загрузить данные сбора.</p>}
      <a className="server-fundraiser__support" href="https://boosty.to/bubblesocial" target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M2.661 14.337 6.801 0h6.362L11.88 4.444l-.038.077-3.378 11.733h3.15c-1.321 3.289-2.35 5.867-3.086 7.733-5.816-.063-7.442-4.228-6.02-9.155M8.554 24l7.67-11.035h-3.25l2.83-7.073c4.852.508 7.137 4.33 5.791 8.952C20.16 19.81 14.344 24 8.68 24h-.127z" /></svg>
        Поддержать
      </a>
    </div>
  </section>;
}
