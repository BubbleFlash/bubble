import { useQuery } from "@tanstack/react-query";
import { useRef, useState, type KeyboardEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { useSiteContent } from "../lib/siteContent";
import { useAuth } from "../store/auth";
import { LinkedText } from "../components/LinkContent";
import AuthForm from "../components/AuthForm";
import Avatar from "../components/Avatar";
import DevelopmentWidget from "../components/DevelopmentWidget";
import ForgotPasswordPage from "./ForgotPasswordPage";
import ResetPasswordPage from "./ResetPassword";
import ConfirmEmailChangePage from "./ConfirmEmailChangePage";
import VerifyEmailPage from "./VerifyEmailPage";

function GuestAccess({ initialMode = "login" }: { initialMode?: "login" | "register" }) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const { state } = useLocation();
  const tabs = useRef<Partial<Record<"login" | "register", HTMLButtonElement>>>({});
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "login" : event.key === "End" ? "register" : mode === "login" ? "register" : "login";
    setMode(next);
    tabs.current[next]?.focus();
  };
  return <section className="guest-access" aria-label="Вход и регистрация">
    <div className="tabs feed-tabs guest-access__tabs" role="tablist" aria-label="Вход и регистрация">
      <button ref={(node) => { tabs.current.login = node ?? undefined; }} type="button" role="tab" tabIndex={mode === "login" ? 0 : -1} aria-selected={mode === "login"} className={`tab${mode === "login" ? " active" : ""}`} onClick={() => setMode("login")} onKeyDown={onKeyDown}>Войти</button>
      <button ref={(node) => { tabs.current.register = node ?? undefined; }} type="button" role="tab" tabIndex={mode === "register" ? 0 : -1} aria-selected={mode === "register"} className={`tab${mode === "register" ? " active" : ""}`} onClick={() => setMode("register")} onKeyDown={onKeyDown}>Регистрация</button>
    </div>
    <div className="aero-widget guest-access__panel">
      {typeof state?.accountNotice === "string" && <p className="notice" role="status">{state.accountNotice}</p>}
      <AuthForm key={mode} mode={mode} compact />
    </div>
  </section>;
}

function aboutPart(text: string, heading: string, next: string) {
  const start = text.indexOf(`\n${heading}\n`);
  if (start < 0) return "";
  const from = start + heading.length + 2;
  const end = text.indexOf(`\n${next}\n`, from);
  return text.slice(from, end < 0 ? undefined : end).trim();
}

function AccessPanel({ path }: { path: string }) {
  const views: Record<string, JSX.Element> = {
    "/forgot-password": <ForgotPasswordPage />,
    "/reset-password": <ResetPasswordPage />,
    "/confirm-email-change": <ConfirmEmailChangePage />,
    "/verify-email": <VerifyEmailPage />,
  };
  if (views[path]) return <div className="aero-widget auth-flow">{views[path]}</div>;
  return <GuestAccess key={path} initialMode={path === "/register" ? "register" : "login"} />;
}

export default function SiteInfoPage() {
  const { pathname } = useLocation();
  const rulesOnly = pathname === "/rules";
  const { user } = useAuth();
  const content = useSiteContent();
  type TeamMember = { username: string; displayName: string };
  type TeamGroups = { developers: TeamMember[]; artists: TeamMember[]; testers: TeamMember[]; moderators: TeamMember[]; administrators: TeamMember[] };
  const team = useQuery({ queryKey: ["site-team"], queryFn: () => api<{ groups: TeamGroups }>("/site-team"), enabled: !rulesOnly });
  const benefits = content.data?.benefits.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean) ?? [];
  const about = content.data?.about ?? "";
  const structuredAbout = ["Почему Bubble?", "Присоединяйся к разработке", "История обновлений", "Связаться с нами"].every((heading) => about.includes(`\n${heading}\n`));
  const firstHeading = structuredAbout ? about.indexOf("\nПочему Bubble?\n") : -1;
  const intro = (firstHeading < 0 ? about : about.slice(0, firstHeading)).replace(/^Bubble\s*[-—]\s*твой уголок интернета\s*\n/i, "").trim();
  const contribution = structuredAbout ? aboutPart(about, "Присоединяйся к разработке", "История обновлений") : "";
  const contact = structuredAbout ? aboutPart(about, "Связаться с нами", "") : "";
  const workflow = ["/forgot-password", "/reset-password", "/confirm-email-change", "/verify-email"].includes(pathname);
  return <div className="project-page">
    <div className="project-layout">
      <section className="project-hero">
        <h1>{rulesOnly ? "Правила сообщества" : "Твой уголок интернета"}</h1>
        {rulesOnly && content.isPending && <p role="status">Загрузка…</p>}
        {rulesOnly && content.isError && <p className="error" role="alert">Не удалось загрузить правила. <button className="link-btn" onClick={() => void content.refetch()}>Повторить</button></p>}
        {!rulesOnly && (content.isPending ? <p role="status">Загрузка…</p> : content.isError ? <p className="error" role="alert">Не удалось загрузить информацию. <button className="link-btn" onClick={() => void content.refetch()}>Повторить</button></p> : <div className="site-information__text"><LinkedText text={intro} /></div>)}
      </section>
      <aside className="project-sidebar" aria-label="Информация о Bubble">
        {(!user || workflow) && <AccessPanel path={pathname} />}
        {user && <Link to="/" className="btn btn-outline project-return">← Вернуться на сайт</Link>}
        <DevelopmentWidget />
        <nav className="project-sidebar__links" aria-label="Информация о Bubble"><Link to="/rules">Правила</Link><a href="https://github.com/BubbleFlash/bubble" target="_blank" rel="noopener noreferrer">GitHub</a></nav>
        <p className="muted small">© {new Date().getFullYear()} Bubble</p>
      </aside>
      <div className="project-content">
        {content.data && (rulesOnly ? <div className="site-information__text"><LinkedText text={content.data.rules} /></div> : <>
          <section className="project-benefits"><h2>Почему Bubble?</h2><div className="project-benefits__grid">{benefits.map((item, index) => { const [title, ...body] = item.split("\n"); return <article className="project-benefit" key={index}><h3>{title}</h3><p><LinkedText text={body.join("\n")} /></p></article>; })}</div></section>
          <section className="project-section project-team"><h2>Наша команда</h2>
            {team.isPending ? <p>Загрузка…</p> : team.isError ? <p>Не удалось загрузить список.</p> : ([
              ["Разработчики", team.data.groups.developers], ["Художники", team.data.groups.artists], ["Тестировщики", team.data.groups.testers], ["Модераторы", team.data.groups.moderators], ["Администраторы", team.data.groups.administrators],
            ] as [string, TeamMember[]][]).map(([label, members]) => <div className="project-team__group" key={label}><h3>{label}</h3>{members.length ? <ul>{members.map((member) => <li key={member.username}><Link className="row" to={`/u/${member.username}`}><Avatar username={member.username} displayName={member.displayName} size={24} trackOnline />{member.displayName}</Link></li>)}</ul> : <p className="muted">Пока не указаны</p>}</div>)}
          </section>
          {contribution && <section className="project-section"><h2>Присоединяйся к разработке</h2><div className="site-information__text"><LinkedText text={contribution} /></div></section>}
          <details className="project-accordion"><summary>Основные принципы</summary><div className="site-information__text"><LinkedText text={content.data.principles.replace(/^Bubble\s*[-—]\s*твой уголок интернета\s*\n[^\n]*\n?/i, "").trimStart()} /></div></details>
          {contact && <section className="project-section"><h2>Связаться с нами</h2><div className="site-information__text"><LinkedText text={contact} /></div><a href="mailto:bubblewebsocial@gmail.com">Написать нам</a></section>}
        </>)}
      </div>
    </div>
  </div>;
}
