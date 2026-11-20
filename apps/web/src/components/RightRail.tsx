import { Link } from "react-router-dom";
import { useAuth } from "../store/auth";
import ServerFundraiser from "./ServerFundraiser";
import OnlineCount from "./OnlineCount";
import DevelopmentWidget from "./DevelopmentWidget";
import TelegramWidget from "./TelegramWidget";

export default function RightRail() {
  const { user, loading } = useAuth();
  return (
    <aside className="right-rail aero-home-rail" aria-label="Bubble">
      {user && <><OnlineCount /><ServerFundraiser /></>}
      {user && <TelegramWidget />}
      {!loading && <DevelopmentWidget />}
      <nav className="rail-links muted small" aria-label="Информация о Bubble"><Link to="/about">О проекте</Link><Link to="/rules">Правила</Link></nav>
      {!user && <><nav className="rail-links muted small" aria-label="Дополнительные ссылки"><Link to="/explore">Обзор</Link><a href="https://github.com/neucorochen/bubble" target="_blank" rel="noopener noreferrer">GitHub</a></nav><p className="muted small">© {new Date().getFullYear()} Bubble</p></>}
    </aside>
  );
}
