import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  maxRateLimitWindowSeconds,
  rateLimitDefaults,
  rateLimitNames,
  type RateLimitName,
  type RateLimitRule,
  type RateLimitSettingsDTO,
} from "@commune/shared";
import { api } from "../lib/api";

const path = "/admin/rate-limits";
const queryKey = ["admin", "rate-limits"];
const ruleLabels: Record<RateLimitName, string> = {
  "global-ip": "Общий лимит по IP",
  "global-account": "Общий лимит по аккаунту",
  "refresh-lookup-ip": "Восстановление сеанса: проверка cookie",
  "refresh-ip": "Восстановление сеанса без действительной cookie",
  "refresh-account": "Восстановление сеанса по аккаунту",
  auth: "Вход, регистрация и действия с аккаунтом",
  email: "Запросы на отправку писем",
  search: "Поиск людей и записей",
  public: "Публичные страницы по IP",
  "public-account": "Публичные страницы по аккаунту",
  "link-preview": "Предпросмотр ссылок",
  "post-view-account": "Учёт просмотров записей",
  upload: "Загрузка файлов",
  report: "Жалобы",
  "community-create": "Создание сообществ",
  message: "Отправка, правка и удаление сообщений",
  "chat-create": "Создание переписок",
  "messages-read": "Отметка сообщений прочитанными",
  push: "Настройки push-уведомлений",
  "push-test": "Тестовые push-уведомления",
  checkout: "Запросы к платёжному сервису",
  contact: "Сообщения через форму связи",
  "client-error": "Отчёты об ошибках браузера",
  "client-network": "Отчёты о сетевых сбоях",
};

function RuleEditor({ name, rule }: { name: RateLimitName; rule: RateLimitRule }) {
  const client = useQueryClient();
  const defaults = rateLimitDefaults[name];
  const [draft, setDraft] = useState<{ enabled: boolean; limit: string; windowSeconds: string }>();
  const values = draft ?? {
    enabled: rule.enabled,
    limit: String(rule.limit),
    windowSeconds: String(rule.windowSeconds),
  };
  const save = useMutation({
    mutationFn: (body: RateLimitRule) => api<RateLimitRule>(`${path}/${name}`, { method: "PUT", body }),
    onMutate: () => client.cancelQueries({ queryKey }),
    onSuccess: (result) => {
      client.setQueryData<RateLimitSettingsDTO>(queryKey, (current) => current && {
        ...current,
        rules: { ...current.rules, [name]: result },
      });
      setDraft(undefined);
    },
  });

  return (
    <form className="moderation-action" onSubmit={(event) => {
      event.preventDefault();
      save.mutate({ enabled: values.enabled, limit: Number(values.limit), windowSeconds: Number(values.windowSeconds) });
    }}>
      <label>
        <span className="row">
          <input
            type="checkbox"
            checked={values.enabled}
            disabled={save.isPending}
            onChange={(event) => setDraft({ ...values, enabled: event.target.checked })}
          />
          Использовать это правило
        </span>
      </label>
      <label>
        Запросов за окно
        <input
          type="number" min={1} step={1} required
          value={values.limit} disabled={save.isPending}
          onChange={(event) => setDraft({ ...values, limit: event.target.value })}
        />
      </label>
      <label>
        Окно (секунды)
        <input
          type="number" min={1} max={maxRateLimitWindowSeconds} step={1} required
          value={values.windowSeconds} disabled={save.isPending}
          onChange={(event) => setDraft({ ...values, windowSeconds: event.target.value })}
        />
      </label>
      <p className="muted small">Исходный порог — {defaults.limit} запросов за {defaults.windowSeconds} с.</p>
      <button className="btn" disabled={!draft || save.isPending}>
        {save.isPending ? "Сохранение…" : "Сохранить правило"}
      </button>
      {save.isSuccess && !draft && <p role="status">Правило сохранено.</p>}
      {save.isError && <p className="error" role="alert">Не удалось сохранить правило.</p>}
    </form>
  );
}

export default function RateLimitSettings() {
  const client = useQueryClient();
  const [selected, setSelected] = useState<RateLimitName>("global-ip");
  const settings = useQuery({ queryKey, queryFn: () => api<RateLimitSettingsDTO>(path), retry: false });
  const data = settings.data;
  const save = useMutation({
    mutationFn: (enabled: boolean) => api<Pick<RateLimitSettingsDTO, "enabled">>(path, { method: "PUT", body: { enabled } }),
    onMutate: () => client.cancelQueries({ queryKey }),
    onSuccess: ({ enabled }) => {
      client.setQueryData<RateLimitSettingsDTO>(queryKey, (current) => current && { ...current, enabled });
    },
  });

  return (
    <section className="card moderation-card">
      <h2>Лимиты запросов</h2>
      <p>Общий переключатель включает выбранные правила. Редактировать их можно в любом режиме.</p>
      {settings.isPending && <p role="status">Загрузка…</p>}
      {settings.isLoadingError && (
        <>
          <p className="error" role="alert">Не удалось загрузить настройку.</p>
          <button className="btn" onClick={() => void settings.refetch()}>Повторить</button>
        </>
      )}
      {data && (
        <>
          <p role="status">{data.enabled ? "Лимиты включены." : "Лимиты выключены."}</p>
          <button
            className="btn"
            disabled={save.isPending}
            onClick={() => save.mutate(!data.enabled)}
          >
            {save.isPending ? "Сохранение…" : data.enabled ? "Выключить лимиты" : "Включить лимиты"}
          </button>
          {save.isError && <p className="error" role="alert">Не удалось сохранить настройку.</p>}
          <label>
            Правило API
            <select value={selected} onChange={(event) => setSelected(event.target.value as RateLimitName)}>
              {rateLimitNames.map((name) => (
                <option key={name} value={name}>{ruleLabels[name]}{data.rules[name].enabled ? "" : " (выкл.)"}</option>
              ))}
            </select>
          </label>
          <p className="muted small">Один запрос может учитываться в общем лимите и в правиле для действия.</p>
          <RuleEditor key={selected} name={selected} rule={data.rules[selected]} />
        </>
      )}
    </section>
  );
}
