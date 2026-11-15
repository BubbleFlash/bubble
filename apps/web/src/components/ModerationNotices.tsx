import { useQuery } from "@tanstack/react-query";
import { api, restrictionText } from "../lib/api";

type Notices = {
  warnings: Array<{ _id: string; reason: string; time: string }>;
  publishing?: { reason: string; until?: string };
};

export default function ModerationNotices() {
  const notices = useQuery({
    queryKey: ["own-moderation-notices"],
    queryFn: () => api<Notices>("/moderation/notices"),
    refetchInterval: 30000,
    retry: false,
  });
  const warning = notices.data?.warnings[0];
  const publishing = notices.data?.publishing;
  return (
    <>
      {warning && (
        <p className="notice" role="status">
          Предупреждение · {warning.reason} · {new Date(warning.time).toLocaleString("ru-RU")}
        </p>
      )}
      {publishing?.until && (
        <p className="notice" role="status">
          Публикации запрещены ·{" "}
          {restrictionText({ ...publishing, kind: "publishing", until: publishing.until })}
        </p>
      )}
    </>
  );
}
