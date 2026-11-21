import { displayNameOf } from "@commune/shared";
import NavigationIcon from "./NavigationIcon";
import ServerFundraiser from "./ServerFundraiser";
import OnlineCount from "./OnlineCount";
import TelegramWidget from "./TelegramWidget";
import { useEffect } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../store/auth";
import { useUnreadCount } from "../hooks/useSocial";
import { useUnreadMessages } from "../hooks/useMessages";
import Avatar from "./Avatar";
import Icon, { type IconName } from "./Icon";
import PlusBadge from "./PlusBadge";
import SearchBox from "./SearchBox";
import NotificationMenu from "./NotificationMenu";
import ReportMenu from "./ReportMenu";
import { navigationFor } from "../lib/navigation";

/** Pages where the navbar is hidden so sign-in flows stay focused. */
export const AUTH_PATHS = ["/login", "/register", "/forgot-password", "/reset-password", "/confirm-email-change"];

export default function Header({ menuOpen: open, setMenuOpen: setOpen, onNavigateToNotification, minimal = false }: {
  menuOpen: boolean;
  setMenuOpen: Dispatch<SetStateAction<boolean>>;
  onNavigateToNotification: () => void;
  minimal?: boolean;
}) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const confirmLogout = () => {
    if (window.confirm("Вы уверены, что хотите выйти из аккаунта?")) void logout();
  };
  const unread = useUnreadCount(Boolean(user && !minimal));
  const msgs = useUnreadMessages(Boolean(user && !minimal));
  const count = unread.data?.count ?? 0;
  const msgCount = msgs.data?.count ?? 0;
  const countLabel = count > 99 ? "99+" : String(count);

  // Close the drawer whenever the page changes.
  useEffect(() => setOpen(false), [pathname, setOpen]);

  // While the drawer is open: Escape closes it and the page behind it does not scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  // If the window grows to desktop size, make sure no stale drawer stays open.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1101px)");
    const onChange = () => mq.matches && setOpen(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [setOpen]);

  if (!minimal && AUTH_PATHS.includes(pathname)) return null;

  const navClass = ({ isActive }: { isActive: boolean }) => `nav-link${isActive ? " active" : ""}`;
  const item = (to: string, icon: IconName, label: string, extra?: ReactNode, end = false) => (
    <NavLink to={to} end={end} className={navClass} onClick={() => setOpen(false)}>
      <NavigationIcon name={icon} size={20} />
      {label}
      {extra}
    </NavLink>
  );

  return (
    <>
      <header className={`header${user && !minimal ? " header-user" : ""}`}>
        <Link to="/" className="brand" aria-label="На главную Bubble">
          <picture className="header-logo">
            <source media="(max-width: 1100px)" srcSet="/bubble-header-mobile.png" />
            <img src="/bubble-header-desktop.png" width="576" height="211" alt="" />
          </picture>
        </Link>

        {!minimal && <>

        {user && (
          <div className="header-search">
            <SearchBox />
          </div>
        )}

        <div className="header-actions">
          {(user?.role === "admin" || user?.role === "moderator") && <ReportMenu key={user.id} />}
          {user && <NotificationMenu key={user.id} count={count} onNavigateToItem={onNavigateToNotification} />}
          <nav className="header-right nav-desktop" aria-label="Основная навигация">
            {!user && navigationFor("guest", "header").map((entry) => <NavLink key={entry.id} to={entry.to("")} className={navClass}>{entry.label}</NavLink>)}
            {user && (
              <>
                <Link to={`/u/${user.username}`} className="nav-link nav-profile">
                  <Avatar username={user.username} displayName={user.displayName} url={user.avatarUrl} frame={user.avatarFrame} size={26} online />
                  <span className="nav-profile-name">{displayNameOf(user)}</span>
                  <PlusBadge plus={user.plus} />
                </Link>
                <button className="btn btn-ghost" onClick={confirmLogout}>Выйти</button>
              </>
            )}
          </nav>

          <div className="nav-mobile">
            {user && navigationFor("member", "header").map((entry) => (
              <Link key={entry.id} to={entry.to(user.username)} className="icon-btn" aria-label={entry.label}>
                <NavigationIcon name={entry.icon} size={22} />
              </Link>
            ))}
            {!user && <button
              type="button"
              className="icon-btn"
              aria-label={open ? "Закрыть меню" : "Открыть меню"}
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen((o) => !o)}
            >
              <NavigationIcon name="menu" size={24} />
            </button>}
          </div>
        </div>
        </>}
      </header>

      {/* Slide-in menu (right side) */}
      <div className={`drawer-root${open ? " open" : ""}`} aria-hidden={!open}>
        <button
          className="drawer-overlay"
          tabIndex={-1}
          aria-label="Закрыть меню"
          onClick={() => setOpen(false)}
        />
        <aside
          id="mobile-menu"
          className="drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Меню"
        >
          {user ? (
            <>
              <nav className="drawer-links" aria-label="Меню">
                {navigationFor("member", "drawer").map((entry) => <span key={entry.id}>{item(entry.to(user.username), entry.icon, entry.label, entry.id === "messages" && msgCount > 0 ? <span className="pill">{msgCount}</span> : entry.id === "notifications" && count > 0 ? <span className="pill">{countLabel}</span> : undefined, entry.end)}</span>)}
                {user.role === "admin" && item("/admin", "shield", "Админка")}
                {user.role === "moderator" && item("/moderation", "shield", "Модерация")}
                {item("/about", "info", "О проекте")}
                {item("/rules", "info", "Правила сообщества")}
              </nav>
              {open && <><OnlineCount /><ServerFundraiser /></>}
              {open && <TelegramWidget />}
              <button className="btn btn-outline block drawer-logout" onClick={confirmLogout}>
                <Icon name="logout" size={18} />  Выйти
              </button>
            </>
          ) : (
            <>
              <nav className="drawer-links" aria-label="Меню">
                {navigationFor("guest", "drawer").map((entry) => <span key={entry.id}>{item(entry.to(""), entry.icon, entry.guestLabel ?? entry.label, undefined, entry.end)}</span>)}
                {item("/about", "info", "О проекте")}
                {item("/rules", "info", "Правила сообщества")}
              </nav>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
