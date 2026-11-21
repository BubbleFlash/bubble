import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  accountActionRules,
  maxChatCreateLimit,
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
  auth: "Вход и действия с аккаунтом",
  email: "Запросы на отправку писем",
  search: "Поиск людей и записей",
  public: "Публичные страницы по IP",
  "public-account": "Публичные страницы по аккаунту",
  "link-preview": "Предпросмотр ссылок",
  "post-view-account": "Учёт просмотров записей",
  upload: "Загрузка файлов",
  report: "Жалобы",
  "community-create": "Создание сообществ",
  "post-create": "Публикации и репосты",
  "comment-create": "Комментарии и ответы",
  message: "Отправка личных сообщений",
  "chat-create": "Начало новых переписок",
  "messages-read": "Отметка сообщений прочитанными",
  push: "Настройки push-уведомлений",
  "push-test": "Тестовые push-уведомления",
  checkout: "Запросы к платёжному сервису",
  contact: "Сообщения через форму связи",
  "client-error": "Отчёты об ошибках браузера",
  "client-network": "Отчёты о сетевых сбоях",
};
const actionRules = new Set<RateLimitName>(accountActionRules);
const windowUnits = { seconds: 1, minutes: 60, hours: 3600 };
type WindowUnit = keyof typeof windowUnits;

function RuleEditor({ name, rule }: { name: RateLimitName; rule: RateLimitRule }) {
  const client = useQueryClient();
  const defaults = rateLimitDefaults[name];
  const isAction = actionRules.has(name);
  const unit = isAction && rule.windowSeconds % 3600 === 0 ? "hours" : isAction && rule.windowSeconds % 60 === 0 ? "minutes" : "seconds";
  const [draft, setDraft] = useState<{ enabled: boolean; limit: string; window: string; unit: WindowUnit }>();
  const values = draft ?? {
    enabled: rule.enabled,
    limit: String(rule.limit),
    window: String(rule.windowSeconds / windowUnits[unit]),
    unit,
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
      save.mutate({ enabled: values.enabled, limit: Number(values.limit), windowSeconds: Number(values.window) * windowUnits[values.unit] });
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
        {isAction ? "Действий за период" : "Запросов за период"}
        <input
          type="number" min={1} max={name === "chat-create" ? maxChatCreateLimit : undefined} step={1} required
          value={values.limit} disabled={save.isPending}
          onChange={(event) => setDraft({ ...values, limit: event.target.value })}
        />
      </label>
      <label>
        {isAction ? "Период" : "Период (секунды)"}
        <input
          type="number" min={1} max={Math.floor(maxRateLimitWindowSeconds / windowUnits[values.unit])} step={1} required
          value={values.window} disabled={save.isPending}
          onChange={(event) => setDraft({ ...values, window: event.target.value })}
        />
      </label>
      {isAction && <label>
        Единица периода
        <select value={values.unit} disabled={save.isPending}
          onChange={(event) => setDraft({ ...values, unit: event.target.value as WindowUnit })}>
          <option value="seconds">Секунды</option>
          <option value="minutes">Минуты</option>
          <option value="hours">Часы</option>
        </select>
      </label>}
      <p className="muted small">Исходный порог — {defaults.limit} за {defaults.windowSeconds / 60} мин.</p>
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
  const [selected, setSelected] = useState<RateLimitName>("post-create");
  const settings = useQuery({ queryKey, queryFn: () => api<RateLimitSettingsDTO>(path), retry: false });
  const data = settings.data;
  const save = useMutation({
    mutationFn: ({ enabled, captcha }: { enabled: boolean; captcha?: boolean }) =>
      api<Partial<Pick<RateLimitSettingsDTO, "enabled" | "captchaEnabled">>>(captcha ? `${path}/captcha` : path, { method: "PUT", body: { enabled } }),
    onMutate: () => client.cancelQueries({ queryKey }),
    onSuccess: (result) => {
      client.setQueryData<RateLimitSettingsDTO>(queryKey, (current) => current && { ...current, ...result });
    },
  });

  return (
    <section className="card moderation-card">
      <h2>Лимиты и защита от спама</h2>
      {settings.isPending && <p role="status">Загрузка…</p>}
      {settings.isLoadingError && (
        <>
          <p className="error" role="alert">Не удалось загрузить настройку.</p>
          <button className="btn" onClick={() => void settings.refetch()}>Повторить</button>
        </>
      )}
      {data && (
        <>
          <p role="status">{data.enabled ? "Общие лимиты API включены." : "Общие лимиты API выключены."}</p>
          <button
            className="btn"
            disabled={save.isPending}
            onClick={() => save.mutate({ enabled: !data.enabled })}
          >
            {data.enabled ? "Выключить общие лимиты" : "Включить общие лимиты"}
          </button>
          <p>Лимиты действий по аккаунту включаются в каждом правиле отдельно.</p>
          {save.isError && <p className="error" role="alert">Не удалось сохранить настройку.</p>}
          <label>
            Правило API
            <select value={selected} onChange={(event) => setSelected(event.target.value as RateLimitName)}>
              <optgroup label="Действия по аккаунту">
                {accountActionRules.map((name) => (
                  <option key={name} value={name}>{ruleLabels[name]}{data.rules[name].enabled ? "" : " (выкл.)"}</option>
                ))}
              </optgroup>
              <optgroup label="Общие правила API">
                {rateLimitNames.filter((name) => !actionRules.has(name)).map((name) => (
                  <option key={name} value={name}>{ruleLabels[name]}{data.rules[name].enabled ? "" : " (выкл.)"}</option>
                ))}
              </optgroup>
            </select>
          </label>
          <RuleEditor key={selected} name={selected} rule={data.rules[selected]} />
          <h3>Капча при регистрации по почте</h3>
          <p role="status">{data.captchaEnabled ? "Капча включена." : "Капча выключена."}</p>
          <button type="button" className="btn" disabled={save.isPending}
            onClick={() => save.mutate({ enabled: !data.captchaEnabled, captcha: true })}>
            {data.captchaEnabled ? "Выключить капчу" : "Включить капчу"}
          </button>
        </>
      )}
    </section>
  );
}
