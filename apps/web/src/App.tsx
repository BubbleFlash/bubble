import { Navigate, Route, Routes, matchPath, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { NotificationDTO } from "@commune/shared";
import { useAuth } from "./store/auth";
import { useMusicPlayer } from "./store/music";
import AeroTitlebar from "./components/AeroTitlebar";
import Header, { AUTH_PATHS } from "./components/Header";
import FeedPage from "./pages/FeedPage";
import VerifyBanner from "./components/VerifyBanner";
import PwaBanner from "./components/PwaBanner";
import LeftNav from "./components/LeftNav";
import RightRail from "./components/RightRail";
import BottomNav from "./components/BottomNav";
import { PageSkeleton } from "./components/Skeleton";
import ErrorBoundary from "./components/ErrorBoundary";
import { useNotificationReadSession, useProfile } from "./hooks/useSocial";
import { useStoredFont } from "./lib/siteFont";
import { appearanceStyle } from "./lib/appearance";
import { prefetchLikelyRoutes } from "./lib/prefetch";
import MusicPlayer from "./components/MusicPlayer";
import BackToTop from "./components/BackToTop";
import { useStickyTabs } from "./hooks/useStickyTabs";

const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const PostPage = lazy(() => import("./pages/PostPage"));
const SiteInfoPage = lazy(() => import("./pages/SiteInfoPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const FriendsPage = lazy(() => import("./pages/FriendsPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
import { inStaffArea } from "./lib/navigation";
import ModerationNotices from "./components/ModerationNotices";

const ModerationPage = lazy(() => import("./pages/ModerationPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const CommunitiesPage = lazy(() => import("./pages/CommunitiesPage"));
const CommunityPage = lazy(() => import("./pages/CommunityPage"));
const PlusPage = lazy(() => import("./pages/PlusPage"));
const InsightsPage = lazy(() => import("./pages/InsightsPage"));
const MessagesPage = lazy(() => import("./pages/MessagesPage"));
const NewsPage = lazy(() => import("./pages/NewsPage"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const MusicPage = lazy(() => import("./pages/MusicPage"));
const UserMusicPage = lazy(() => import("./pages/UserMusicPage"));

const TITLES: Record<string, string> = {
  "/": "Bubble — открытая платформа групп",
  "/explore": "Обзор",
  "/about": "О проекте",
  "/rules": "Правила сообщества",
  "/news": "Последние новости",
  "/contact": "Связаться",
  "/plus": "Bubble Plus",
  "/insights": "Статистика",
  "/messages": "Сообщения",
  "/communities": "Группы",
  "/notifications": "Уведомления",
  "/search": "Поиск",
  "/friends": "Друзья",
  "/settings": "Настройки",
  "/login": "Вход",
  "/register": "Регистрация",
  "/forgot-password": "Восстановление пароля",
  "/reset-password": "Сброс пароля",
  "/confirm-email-change": "Смена почты",
  "/admin": "Администрирование",
  "/moderation": "Модерация",
  "/admin/errors": "Мониторинг",
  "/music": "Музыка",
};

/** Per-page browser title and canonical link, so tabs, history and search engines get real names. */
function RouteMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    const user = /^\/u\/([^/]+)/.exec(pathname)?.[1];
    const community = /^\/c\/([^/]+)/.exec(pathname)?.[1];
    const name =
      TITLES[pathname] ??
      (user
        ? "Профиль"
        : community
          ? `c/${decodeURIComponent(community)}`
          : pathname.startsWith("/messages")
            ? "Сообщения"
            : pathname.startsWith("/posts/")
              ? "Запись"
              : "Bubble");
    if (!user) document.title = pathname === "/" ? name : `${name} · Bubble`;

    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = `${window.location.origin}${pathname}`;

    // Move keyboard and screen-reader focus to the page content after navigating.
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageSkeleton />;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

/** "/" shows the feed to members and the public Explore page to everyone else. */
function Home() {
  const { user, loading } = useAuth();
  if (loading) return <PageSkeleton />;
  return user ? <FeedPage /> : <SiteInfoPage />;
}

function AppRoutes({ onNotificationItems, onNavigateToNotification, onWallpaperPreview, onOpacityPreview }: {
  onNotificationItems: (items: NotificationDTO[]) => void;
  onNavigateToNotification: () => void;
  onWallpaperPreview?: (path?: string | null) => void;
  onOpacityPreview?: (value?: number) => void;
}) {
  const { pathname } = useLocation();
  const { track } = useMusicPlayer();
  return (
    <ErrorBoundary routeKey={pathname} preservePlayback={Boolean(track)}>
      <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/login" element={<SiteInfoPage />} />
        <Route path="/register" element={<SiteInfoPage />} />
        <Route path="/explore" element={<SiteInfoPage />} />
        <Route path="/about" element={<SiteInfoPage />} />
        <Route path="/rules" element={<SiteInfoPage />} />
        <Route path="/forgot-password" element={<SiteInfoPage />} />
        <Route path="/reset-password" element={<SiteInfoPage />} />
        <Route path="/verify-email" element={<SiteInfoPage />} />
        <Route path="/confirm-email-change" element={<SiteInfoPage />} />
        <Route path="/" element={<Home />} />
        <Route
          path="/posts/:id"
          element={<PostPage />}
        />
        <Route
          path="/u/:username/music"
          element={<Protected><UserMusicPage /></Protected>}
        />
        <Route
          path="/u/:username"
          element={
            <Protected>
              <ProfilePage />
            </Protected>
          }
        />
        <Route path="/settings" element={<Protected><SettingsPage onWallpaperPreview={onWallpaperPreview} onOpacityPreview={onOpacityPreview} /></Protected>} />
        <Route path="/friends" element={<Protected><FriendsPage /></Protected>} />
        <Route path="/friends/:username" element={<Protected><FriendsPage /></Protected>} />
        <Route
          path="/notifications"
          element={
            <Protected>
              <NotificationsPage onItems={onNotificationItems} onNavigateToItem={onNavigateToNotification} />
            </Protected>
          }
        />
        <Route
          path="/admin"
          element={
            <Protected>
              <Navigate to="/moderation" replace />
            </Protected>
          }
        />
        <Route path="/moderation" element={<Protected><ModerationPage /></Protected>} />
        <Route path="/admin/errors" element={<Protected><AdminPage /></Protected>} />

        <Route
          path="/communities"
          element={
            <Protected>
              <CommunitiesPage />
            </Protected>
          }
        />
        <Route
          path="/c/:slug"
          element={
            <Protected>
              <CommunityPage />
            </Protected>
          }
        />
        <Route
          path="/search"
          element={
            <Protected>
              <SearchPage />
            </Protected>
          }
        />
        <Route
          path="/music"
          element={
            <Protected>
              <MusicPage />
            </Protected>
          }
        />
        <Route
          path="/plus"
          element={
            <Protected>
              <PlusPage />
            </Protected>
          }
        />
        <Route
          path="/insights"
          element={
            <Protected>
              <InsightsPage />
            </Protected>
          }
        />
        <Route path="/news" element={<NewsPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route
          path="/messages"
          element={
            <Protected>
              <MessagesPage />
            </Protected>
          }
        />
        <Route
          path="/messages/:id"
          element={
            <Protected>
              <MessagesPage />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  useStickyTabs();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const onNotificationsPage = Boolean(matchPath("/notifications", pathname));
  const notificationVisit = useRef<string>();
  const { remember, finish } = useNotificationReadSession();
  const userId = user?.id;
  useLayoutEffect(() => {
    const previousUser = notificationVisit.current;
    if (previousUser && previousUser !== userId) finish([]);
    else if (previousUser && !onNotificationsPage) finish();
    notificationVisit.current = onNotificationsPage ? userId : undefined;
  }, [onNotificationsPage, userId, finish]);
  useEffect(() => {
    if (!onNotificationsPage || !userId) return;
    const leave = () => finish();
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, [onNotificationsPage, userId, finish]);
  const projectLanding = ["/about", "/rules", "/explore", "/verify-email", ...AUTH_PATHS].includes(pathname) || (!user && pathname === "/");
  const signedIn = Boolean(user);
  const containedScroll = signedIn && !projectLanding && /\bAndroid\b.*\bFirefox\//.test(navigator.userAgent);
  const [wallpaperPreview, setWallpaperPreview] = useState<string | null>();
  const [opacityPreview, setOpacityPreview] = useState<number>();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const homeRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const profileName = matchPath("/u/:username", pathname)?.params.username;
  const visitingProfile = Boolean(user && profileName && profileName.toLowerCase() !== user.username.toLowerCase());
  const { data: profile, isError: profileError } = useProfile(profileName ?? "", visitingProfile);
  const profileTheme = visitingProfile && !profileError ? profile?.profileAppearance : undefined;
  const appearance = profileTheme ?? user?.appearance;
  const fontFamily = useStoredFont(appearance?.font);
  const preview = pathname === "/settings" ? wallpaperPreview : undefined;
  const localWallpaper = preview?.startsWith("blob:") ? preview : undefined;
  const backgroundUrl = preview === undefined ? appearance?.backgroundUrl : preview;
  useLayoutEffect(() => {
    const root = document.documentElement;
    const update = () => root.toggleAttribute("data-aero-no-scroll", root.scrollHeight <= root.clientHeight);
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    if (homeRef.current) observer.observe(homeRef.current);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      root.removeAttribute("data-aero-no-scroll");
    };
  }, [projectLanding]);
  // Once signed in, quietly download the most-used pages so tapping them is instant.
  useEffect(() => {
    if (signedIn) prefetchLikelyRoutes();
  }, [signedIn]);

  const primaryColor = appearance?.primaryColor;
  useLayoutEffect(() => {
    if (!primaryColor) return;
    const root = document.documentElement;
    root.style.setProperty("--aero-chosen-primary", primaryColor);
    return () => {
      root.style.removeProperty("--aero-chosen-primary");
    };
  }, [projectLanding, primaryColor]);

  useLayoutEffect(() => {
    const home = homeRef.current;
    const chrome = chromeRef.current;
    if (!home || !chrome) return;
    const update = () => {
      home.style.setProperty("--aero-chrome-height", `${chrome.getBoundingClientRect().height}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(chrome);
    return () => observer.disconnect();
  }, [projectLanding]);
  useLayoutEffect(() => {
    // Firefox uses the stationary wallpaper mask. Clipping the full feed on every
    // scroll frame can leave a gap while its compositor moves the sticky header.
    if (CSS.supports("-moz-appearance", "none")) return;
    const home = homeRef.current;
    const chrome = chromeRef.current;
    const content = home?.querySelector<HTMLElement>(".aero-window > .shell");
    if (!chrome || !content) return;
    const narrow = window.matchMedia("(max-width: 1100px)");
    let frame = 0;
    const update = () => {
      frame = 0;
      const overlap = chrome.getBoundingClientRect().bottom - content.getBoundingClientRect().top;
      content.style.clipPath = overlap > 0 ? `inset(${Math.ceil(overlap)}px -100vmax -100vmax -100vmax)` : "";
    };
    const schedule = () => { if (narrow.matches && !frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    const stop = () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      content.style.removeProperty("clip-path");
    };
    const sync = () => {
      stop();
      // Desktop already has a fixed wallpaper mask above the scrolling shell.
      if (!narrow.matches) return;
      observer.observe(chrome);
      observer.observe(content);
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", schedule);
      update();
    };
    sync();
    narrow.addEventListener("change", sync);
    return () => {
      narrow.removeEventListener("change", sync);
      stop();
    };
  }, [projectLanding, pathname]);
  useLayoutEffect(() => {
    const home = homeRef.current;
    const dock = dockRef.current;
    const nav = navRef.current;
    if (!home || !dock || !nav) return;
    const update = () => {
      home.style.setProperty("--aero-bottom-nav-height", `${nav.getBoundingClientRect().height}px`);
      const dockHeight = dock.getBoundingClientRect().height;
      if (dockHeight) home.style.setProperty("--aero-bottom-dock-height", `${dockHeight}px`);
      else home.style.removeProperty("--aero-bottom-dock-height");
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(dock);
    observer.observe(nav);
    return () => {
      observer.disconnect();
      home.style.removeProperty("--aero-bottom-nav-height");
      home.style.removeProperty("--aero-bottom-dock-height");
    };
  }, [projectLanding, signedIn]);
  useLayoutEffect(() => {
    const home = homeRef.current;
    if (!home || !containedScroll) return;
    const firefoxWindow = window as Window & { mozInnerScreenY?: number };
    const update = () => {
      const top = firefoxWindow.mozInnerScreenY;
      if (top === undefined) return;
      const outsideViewport = Math.max(0, Math.ceil(window.screen.height - top - window.innerHeight));
      home.style.setProperty("--aero-android-bottom-gap", `${outsideViewport}px`);
    };
    update();
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      home.style.removeProperty("--aero-android-bottom-gap");
    };
  }, [containedScroll]);
  // Messages need room for two panes, so that page drops the news column.
  const wide = pathname.startsWith("/messages") || inStaffArea(user?.role, pathname);
  const guestLanding = projectLanding;

  const skip = (
    <a href="#main" className="skip-link">
      Skip to content
    </a>
  );

  return (
    <div
      className="aero-app aero-home"
      ref={homeRef}
      data-theme="aero-blue"
      data-aero-contained-scroll={containedScroll || undefined}
      data-custom-font={Boolean(fontFamily) || undefined}
      data-custom-primary={Boolean(appearance?.primaryColor) || undefined}
      data-custom-wallpaper={Boolean(backgroundUrl) || undefined}
      data-custom-opacity={(pathname === "/settings" && opacityPreview !== undefined) || user?.appearance?.windowOpacity !== undefined || undefined}
      style={appearanceStyle({ ...appearance, backgroundUrl, windowOpacity: pathname === "/settings" ? opacityPreview ?? user?.appearance?.windowOpacity : user?.appearance?.windowOpacity }, fontFamily, localWallpaper)}
    >
      <div className="aero-fixed-frame" aria-hidden="true" />
      <div className="aero-window">
        {skip}
        <RouteMeta />
        <div className="aero-window-chrome" ref={chromeRef}>
          <AeroTitlebar />
          <Header
            menuOpen={mobileMenuOpen}
            setMenuOpen={setMobileMenuOpen}
            onNavigateToNotification={() => finish([])}
            minimal={projectLanding}
          />
          {!projectLanding && <VerifyBanner />}
        </div>
        <PwaBanner />
        <div className={`shell${user && !projectLanding ? " has-left" : ""}${wide ? " wide" : ""}${guestLanding ? " guest-landing-shell" : ""}`}>
          {user && !projectLanding && <LeftNav />}
          <main id="main" tabIndex={-1} className="container">
            {user && !projectLanding && <ModerationNotices key={user.id} />}
            <AppRoutes onWallpaperPreview={setWallpaperPreview} onOpacityPreview={setOpacityPreview} onNotificationItems={remember} onNavigateToNotification={() => finish([])} />
          </main>
          {!wide && !guestLanding && <RightRail />}
        </div>
        {!wide && <BackToTop route={pathname} />}
        {!projectLanding && <div className="aero-bottom-dock" ref={dockRef}>
          <MusicPlayer />
          <BottomNav navRef={navRef} menuOpen={mobileMenuOpen} onToggleMenu={() => setMobileMenuOpen((open) => !open)} />
        </div>}
      </div>
    </div>
  );
}
