import type { Mail } from "./mailService.js";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

type Content = {
  title: string;
  paragraphs: string[];
  action?: { label: string; href: string; showLink?: boolean };
  note?: string;
};

/** Table layout and solid fallbacks keep the Aero styling usable in mail clients. */
function bubbleMail(to: string, { title, paragraphs, action, note }: Content): Mail {
  const url = action && new URL(action.href);
  const href = url && ["https:", "http:"].includes(url.protocol) ? escapeHtml(url.href) : undefined;
  const subject = `Bubble · ${title}`;
  const logo = escapeHtml(new URL("/bubble-logo-v3.png", process.env.CLIENT_ORIGIN || url?.origin || "http://localhost:5173").href);
  const brandFont = escapeHtml(new URL("/fonts/Coiny-Regular.ttf", process.env.CLIENT_ORIGIN || url?.origin || "http://localhost:5173").href);
  const text = [title, ...paragraphs, ...(action && href ? [`${action.label}: ${url!.href}`] : []), note, "Команда Bubble"]
    .filter(Boolean).join("\n\n");
  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title><style>@font-face{font-family:Coiny;src:url('${brandFont}') format('truetype');font-weight:normal}</style></head>
<body style="margin:0;background:#e4f3fc;color:#123b60;font-family:Segoe UI,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#e4f3fc"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#f2faff" style="max-width:560px;border:1px solid #8bbbd7;border-radius:10px;box-shadow:0 4px 20px #bedff3">
<tr><td bgcolor="#d3eafa" style="padding:13px 20px;border-bottom:1px solid #8bbbd7;border-radius:9px 9px 0 0;background:linear-gradient(#effbff,#a7dafa);font-size:23px;font-weight:bold;color:#0c2d49">
<img src="${logo}" alt="" width="44" height="44" style="display:inline-block;vertical-align:middle;border:0">&nbsp; <span style="font-family:Coiny,Segoe UI,Arial,sans-serif;font-weight:normal">Bubble</span>
</td></tr>
<tr><td style="padding:24px 20px;word-break:break-word">
<h1 style="margin:0 0 14px;font-size:23px;line-height:1.25;color:#123b60">${escapeHtml(title)}</h1>
${paragraphs.map((paragraph) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(paragraph).replace(/\r?\n/g, "<br>")}</p>`).join("\n")}
${action && href ? `<p style="margin:18px 0"><a href="${href}" style="display:inline-block;padding:12px 18px;border:1px solid #75a535;border-radius:6px;background:#bfec67;background:linear-gradient(#efffcf,#a7d846);color:#17340c;font-weight:bold;text-decoration:none">${escapeHtml(action.label)}</a></p>` : ""}
${action?.showLink && href ? `<p style="font-size:13px;color:#405d72;line-height:1.45">Если кнопка не открывается, вставьте ссылку в браузер:<br><a href="${href}" style="color:#165c93;word-break:break-all">${href}</a></p>` : ""}
${note ? `<p style="margin:16px 0 0;font-size:13px;color:#405d72;line-height:1.45">${escapeHtml(note)}</p>` : ""}
</td></tr>
<tr><td bgcolor="#dceff9" style="padding:12px 20px;border-top:1px solid #8bbbd7;border-radius:0 0 9px 9px;font-size:13px;color:#405d72">Команда Bubble</td></tr>
</table></td></tr></table></body></html>`;
  return { to, subject, text, html };
}

export const verifyEmailMail = (to: string, name: string, href: string) => bubbleMail(to, {
  title: "Подтвердите почту",
  paragraphs: [`Привет, ${name}! Подтвердите адрес почты, чтобы завершить настройку аккаунта Bubble. Ссылка действует 24 часа.`],
  action: { label: "Подтвердить почту", href, showLink: true },
  note: "Если вы не регистрировались в Bubble, пропустите это письмо.",
});

export const resetPasswordMail = (to: string, name: string, href: string) => bubbleMail(to, {
  title: "Восстановление пароля",
  paragraphs: [`Привет, ${name}! По этой ссылке можно задать новый пароль для Bubble. Она одноразовая и действует 1 час.`],
  action: { label: "Задать новый пароль", href, showLink: true },
  note: "Если вы не запрашивали восстановление, пропустите это письмо.",
});

export const emailChangeMail = (to: string, name: string, href: string) => bubbleMail(to, {
  title: "Подтвердите новый адрес почты",
  paragraphs: [`Привет, ${name}! Для аккаунта Bubble запрошена смена почты. Новый адрес станет адресом входа после подтверждения. Ссылка действует 1 час.`],
  action: { label: "Подтвердить новый адрес", href, showLink: true },
  note: "Если вы не запрашивали смену почты, пропустите это письмо.",
});

export const emailChangedMail = (to: string, name: string) => bubbleMail(to, {
  title: "Адрес почты изменён",
  paragraphs: [`Для аккаунта ${name} в Bubble подтверждён новый адрес. Вход со старым адресом больше недоступен.`],
  note: "Если вы не меняли адрес, обратитесь в поддержку Bubble.",
});

export const passwordChangedMail = (to: string, name: string, href: string) => bubbleMail(to, {
  title: "Пароль изменён",
  paragraphs: [`Пароль для аккаунта ${name} в Bubble изменён. Для продолжения войдите с новым паролем.`],
  action: { label: "Войти в Bubble", href },
  note: "Если вы не меняли пароль, воспользуйтесь восстановлением пароля.",
});

export const accountDeletedMail = (to: string, name: string, deadline: Date, href: string) => bubbleMail(to, {
  title: "Аккаунт скрыт",
  paragraphs: [`Профиль ${name} в Bubble скрыт. Чтобы восстановить его, войдите в аккаунт до ${new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(deadline)} UTC.`],
  action: { label: "Войти и восстановить аккаунт", href },
  note: "После окончания срока профиль будет обезличен. Опубликованные материалы останутся в Bubble.",
});

export const accountRestoredMail = (to: string, name: string, href: string) => bubbleMail(to, {
  title: "Аккаунт восстановлен",
  paragraphs: [`Вы вошли в аккаунт ${name}. Профиль снова доступен в Bubble.`],
  action: { label: "Открыть Bubble", href },
  note: "Если это были не вы, смените пароль.",
});

export const contactMail = (to: string, name: string, email: string, message: string) => bubbleMail(to, {
  title: "Новое сообщение обратной связи",
  paragraphs: [`Отправитель: ${name} <${email}>`, message],
});

export const errorAlertMail = (to: string, source: string, route: string, message: string, href: string) => bubbleMail(to, {
  title: "Новая ошибка на сайте",
  paragraphs: [`Источник: ${source}${route ? ` · ${route}` : ""}`, message],
  action: { label: "Открыть журнал ошибок", href },
});
