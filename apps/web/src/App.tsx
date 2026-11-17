import { Link, Navigate, Route, Routes, matchPath, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { NotificationDTO } from "@commune/shared";
import { useAuth } from "./store/auth";
import AeroTitlebar from "./components/AeroTitlebar";
import Header, { AUTH_PATHS } from "./components/Header";
import FeedPage from "./pages/FeedPage";
import VerifyBanner from "./components/VerifyBanner";
import PwaBanner from "./components/PwaBanner";
import ExplorePage from "./pages/ExplorePage";
import LeftNav from "./components/LeftNav";
import RightRail from "./components/RightRail";
import BottomNav from "./components/BottomNav";
import Brand from "./components/BrandMark";
import Icon from "./components/Icon";
import { PageSkeleton } from "./components/Skeleton";
import { useNotificationReadSession, useProfile } from "./hooks/useSocial";
import { useStoredFont } from "./lib/siteFont";
import { appearanceStyle } from "./lib/appearance";
import { prefetchLikelyRoutes } from "./lib/prefetch";
import MusicPlayer from "./components/MusicPlayer";
import BackToTop from "./components/BackToTop";

const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const PostPage = lazy(() => import("./pages/PostPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const FriendsPage = lazy(() => import("./pages/FriendsPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
import { inStaffArea } from "./lib/navigation";
import ModerationNotices from "./components/ModerationNotices";

const ModerationPage = lazy(() => import("./pages/ModerationPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const VerifyEmailPage = lazy(() => import("./pages/VerifyEmailPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const CommunitiesPage = lazy(() => import("./pages/CommunitiesPage"));
const CommunityPage = lazy(() => import("./pages/CommunityPage"));
const PlusPage = lazy(() => import("./pages/PlusPage"));
const InsightsPage = lazy(() => import("./pages/InsightsPage"));
const MessagesPage = lazy(() => import("./pages/MessagesPage"));
const NewsPage = lazy(() => import("./pages/NewsPage"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPassword"));
const MusicPage = lazy(() => import("./pages/MusicPage"));
const UserMusicPage = lazy(() => import("./pages/UserMusicPage"));

const TITLES: Record<string, string> = {
  "/": "Bubble — открытая платформа групп",
  "/explore": "Обзор",
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
  "/admin": "Администрирование",
  "/moderation": "Модерация",
  "/admin/errors": "Ошибки",
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
  return user ? <FeedPage /> : <ExplorePage />;
}

function AppRoutes({ onNotificationItems, onWallpaperPreview }: {
  onNotificationItems: (items: NotificationDTO[]) => void;
  onWallpaperPreview?: (path?: string | null) => void;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/" element={<Home />} />
        <Route
          path="/posts/:id"
          element={
            <Protected>
              <PostPage />
            </Protected>
          }
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
        <Route path="/settings" element={<Protected><SettingsPage onWallpaperPreview={onWallpaperPreview} /></Protected>} />
        <Route path="/friends" element={<Protected><FriendsPage /></Protected>} />
        <Route path="/friends/:username" element={<Protected><FriendsPage /></Protected>} />
        <Route
          path="/notifications"
          element={
            <Protected>
              <NotificationsPage onItems={onNotificationItems} />
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
  );
}

/** Left panel of the sign-in screens (hidden on phones). */
function AuthArt() {
  return (
    <aside className="auth-art" aria-hidden="true">
      <Brand size={40} />
      <div className="auth-art-body">
        <p className="art-title">Ваши люди и новости — в одном месте.</p>
        <ul>
          <li>
            <Icon name="users" size={20} /> Вступайте в группы и подписывайтесь на людей
          </li>
          <li>
            <Icon name="mail" size={20} /> Общайтесь с друзьями в личных сообщениях
          </li>
          <li>
            <Icon name="news" size={20} /> Читайте новости рядом с лентой
          </li>
        </ul>
      </div>
      <span className="blob b1" />
      <span className="blob b2" />
      <span className="blob b3" />
    </aside>
  );
}

export default function App() {
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
  const authPage = AUTH_PATHS.includes(pathname);
  const signedIn = Boolean(user);
  const [wallpaperPreview, setWallpaperPreview] = useState<string | null>();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const homeRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
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
  // Once signed in, quietly download the most-used pages so tapping them is instant.
  useEffect(() => {
    if (signedIn) prefetchLikelyRoutes();
  }, [signedIn]);

  const primaryColor = appearance?.primaryColor;
  useLayoutEffect(() => {
    if (authPage || !primaryColor) return;
    const root = document.documentElement;
    root.style.setProperty("--aero-chosen-primary", primaryColor);
    return () => {
      root.style.removeProperty("--aero-chosen-primary");
    };
  }, [authPage, primaryColor]);

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
  }, [authPage]);
  useLayoutEffect(() => {
    const home = homeRef.current;
    const nav = navRef.current;
    if (!home || !nav) return;
    const update = () => home.style.setProperty("--aero-bottom-nav-height", `${nav.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [authPage, signedIn]);
  // Messages need room for two panes, so that page drops the news column.
  const wide = pathname.startsWith("/messages") || inStaffArea(user?.role, pathname);

  const skip = (
    <a href="#main" className="skip-link">
      Skip to content
    </a>
  );

  if (authPage) {
    return (
      <div className="aero-app aero-auth" data-theme="aero-blue">
        {skip}
        <RouteMeta />
        <PwaBanner />
        <div className="auth-split">
          <AuthArt />
          <main id="main" tabIndex={-1} className="auth-main">
            <Link to="/" className="auth-brand" aria-label="На главную Bubble">
              <Brand size={36} />
            </Link>
            <AppRoutes onNotificationItems={remember} />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div
      className="aero-app aero-home"
      ref={homeRef}
      data-theme="aero-blue"
      data-custom-font={Boolean(fontFamily) || undefined}
      data-custom-primary={Boolean(appearance?.primaryColor) || undefined}
      data-custom-wallpaper={Boolean(backgroundUrl) || undefined}
      data-custom-opacity={user?.appearance?.windowOpacity !== undefined || undefined}
      style={appearanceStyle({ ...appearance, backgroundUrl, windowOpacity: user?.appearance?.windowOpacity }, fontFamily, localWallpaper)}
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
          />
          <VerifyBanner />
        </div>
        <PwaBanner />
        <div className={`shell${user ? " has-left" : ""}${wide ? " wide" : ""}`}>
          {user && <LeftNav />}
          <main id="main" tabIndex={-1} className="container">
            {user && <ModerationNotices key={user.id} />}
            <AppRoutes onWallpaperPreview={setWallpaperPreview} onNotificationItems={remember} />
          </main>
          {!wide && <RightRail />}
        </div>
        <BottomNav navRef={navRef} menuOpen={mobileMenuOpen} onToggleMenu={() => setMobileMenuOpen((open) => !open)} />
        {!wide && <BackToTop route={pathname} />}
        <MusicPlayer />
      </div>
    </div>
  );
}
