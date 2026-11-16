import NavigationIcon from "./NavigationIcon";
import { NavLink } from "react-router-dom";
import { prefetchRoute } from "../lib/prefetch";
import { useAuth } from "../store/auth";
import { useUnreadCount } from "../hooks/useSocial";
import { useUnreadMessages } from "../hooks/useMessages";
import { adminNavigation, inStaffArea, navigationFor } from "../lib/navigation";
import { type IconName } from "./Icon";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import type { Ref } from "react";

/** App-style tab bar for members on phones and tablets. The menu button holds everything else. */
export default function BottomNav({ menuOpen, onToggleMenu, navRef }: {
  menuOpen: boolean;
  onToggleMenu: () => void;
  navRef?: Ref<HTMLElement>;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const location = useLocation();
  const inAdmin = inStaffArea(user?.role, location.pathname);
  const notifications = useUnreadCount(Boolean(user));
  const messages = useUnreadMessages(Boolean(user));
  if (!user) return null;

  const n = notifications.data?.count ?? 0;
  const m = messages.data?.count ?? 0;
  const cls = ({ isActive }: { isActive: boolean }) => `tab-link${isActive ? " active" : ""}`;
  const tab = (to: string, icon: IconName, label: string, count = 0, end = false) => (
    <NavLink
      to={to}
      onClick={() => { if (to === "/" && location.pathname === "/") { void qc.invalidateQueries({ queryKey: ["feed", "all"] }); void qc.invalidateQueries({ queryKey: ["feed", "following"] }); } }}
      onPointerEnter={() => prefetchRoute(to)}
      onTouchStart={() => prefetchRoute(to)}
      onFocus={() => prefetchRoute(to)}
      end={end}
      className={cls}
      aria-label={count ? `${label}, непрочитанных: ${count}` : label}
    >
      <span className="tab-icon">
        <NavigationIcon name={icon} size={25} />
        {count > 0 && <span className="dot" aria-hidden="true" />}
      </span>
      <span className="tab-label">{label}</span>
    </NavLink>
  );

  return (
    <nav ref={navRef} className="bottom-nav" aria-label="Вкладки">
      {inAdmin ? adminNavigation.filter((item) => item.id !== "errors" || user.role === "admin").map((entry) => <span key={entry.id}>{tab(entry.to, entry.icon, entry.label, 0, true)}</span>) : navigationFor("member", "bottom").map((entry) => <span key={entry.id}>{tab(entry.to(user.username), entry.icon, entry.label, entry.id === "messages" ? m : entry.id === "notifications" ? n : 0, entry.end)}</span>)}
      {!inAdmin && (
      <button
        type="button"
        className="tab-link bottom-menu-toggle"
        aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
        aria-expanded={menuOpen}
        aria-controls="mobile-menu"
        onClick={onToggleMenu}
      >
        <span className="tab-icon"><NavigationIcon name="menu" size={25} /></span>
        <span className="tab-label">Меню</span>
      </button>
      )}
    </nav>
  );
}
