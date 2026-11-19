import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { AccountUser, AuthResponse, LoginInput, RegisterInput, UpdateAppearanceInput } from "@commune/shared";
import { releasePushOnLogout } from "../lib/push";
import { api, ApiError, restrictionText, type Restriction, bootSession, readSessionHint, SessionRestoreError, setAccessToken, writeSessionHint } from "../lib/api";
import { PageSkeleton } from "../components/Skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { announceSessionChange, SessionChanged, sessionGeneration, subscribeSessionChanges, withSessionCookie } from "../lib/browserSession";
import { closeTabQueries, startTabQueries } from "../lib/tabQueries";

// The last known profile, shown instantly on the next visit while the session is re-checked.
const USER_KEY = "commune_user";
function readCachedUser(): AccountUser | null {
  if (readSessionHint() !== "1") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AccountUser) : null;
  } catch {
    return null;
  }
}
function cacheUser(user: AccountUser | null) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

interface AuthState {
  user: AccountUser | null;
  loading: boolean;
  confirmed: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: AccountUser | null) => void;
  isCurrentAccount: (userId: string) => boolean;
  applyAppearance: (userId: string, changes: UpdateAppearanceInput) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUserState] = useState<AccountUser | null>(readCachedUser);
  const currentUser = useRef(user);
  // Wait only when there is nothing to show yet: first visit (unknown) or a session without a cached profile.
  const [loading, setLoading] = useState(() => {
    const hint = readSessionHint();
    return hint === null || (hint === "1" && readCachedUser() === null);
  });
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [blocked, setBlocked] = useState<Restriction>();
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const setUser = useCallback((next: AccountUser | null) => {
    if (currentUser.current?.id !== next?.id) {
      qc.removeQueries({ queryKey: ["profile-music"] });
      qc.removeQueries({ queryKey: ["music-settings"] });
      qc.removeQueries({ queryKey: ["music"] });
      qc.removeQueries({ queryKey: ["music-picker"] });
      qc.removeQueries({ queryKey: ["link-preview"] });
    }
    currentUser.current = next;
    cacheUser(next);
    setUserState(next);
  }, [qc]);

  useEffect(() => {
    const onBlocked = (event: Event) => {
      setBlocked((event as CustomEvent<Restriction>).detail);
      setAccessToken(null);
      setConfirmed(false);
      closeTabQueries();
      qc.clear();
      setUser(null);
    };
    window.addEventListener("account-restricted", onBlocked);
    return () => window.removeEventListener("account-restricted", onBlocked);
  }, [qc, setUser]);

  useEffect(() => subscribeSessionChanges((change) => {
    setAccessToken(null);
    setConfirmed(false);
    closeTabQueries();
    setBlocked(undefined);
    setRestoreFailed(false);
    qc.clear();
    // The other tab has already written the new cached profile. Clear only this tab's view.
    currentUser.current = null;
    setUserState(null);
    writeSessionHint(change.state === "guest" ? "guest" : "1");
    setLoading(change.state === "active");
    setRestoreAttempt((attempt) => attempt + 1);
  }), [qc]);

  const isCurrentAccount = useCallback((userId: string) => currentUser.current?.id === userId, []);

  const applyAppearance = useCallback((userId: string, changes: UpdateAppearanceInput) => {
    const active = currentUser.current;
    if (active?.id !== userId) return;
    setUser({
      ...active,
      appearance: { ...active.appearance, ...changes.appearance },
      profileAppearanceVisibility: changes.profileAppearanceVisibility ?? active.profileAppearanceVisibility,
      avatarFrame: changes.avatarFrame === undefined ? active.avatarFrame : changes.avatarFrame ?? undefined,
    });
  }, [setUser]);

  useEffect(() => {
    let alive = true;
    const generation = sessionGeneration();
    let timer: number | undefined;
    const retry = () => setRestoreAttempt((attempt) => attempt + 1);
    setRestoreFailed(false);
    const restore = readSessionHint() === "guest" ? Promise.resolve(null) : bootSession(restoreAttempt > 0);
    void restore.then((res) => {
      if (!alive || generation !== sessionGeneration()) return;
      if (res) {
        if (readCachedUser()?.id !== res.user.id) qc.clear();
        writeSessionHint("1");
        startTabQueries(qc, res.user.id);
        setUser(res.user);
      } else {
        closeTabQueries();
        qc.clear();
        writeSessionHint("guest");
        setUser(null);
      }
      setConfirmed(Boolean(res));
      setLoading(false);
    }).catch((error: unknown) => {
      if (!alive) return;
      if (error instanceof SessionChanged) {
        retry();
        return;
      }
      if (error instanceof ApiError && error.restriction?.kind === "account") {
        setBlocked(error.restriction);
        setAccessToken(null);
        setUser(null);
        setLoading(false);
        return;
      }
      setRestoreFailed(true);
      // Honour the API's cooldown. Other transient failures get one automatic retry.
      const delay = error instanceof SessionRestoreError ? error.retryAfterMs : undefined;
      if (delay || restoreAttempt === 0) timer = window.setTimeout(retry, delay ?? 3000);
      window.addEventListener("online", retry, { once: true });
    });
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener("online", retry);
    };
  }, [setUser, qc, restoreAttempt]);

  const apply = useCallback(
    (res: AuthResponse) => {
      qc.clear();
      qc.removeQueries({ queryKey: ["friends-access"] });
      qc.removeQueries({ queryKey: ["friends-list"] });
      qc.removeQueries({ queryKey: ["relationships"] });
      qc.removeQueries({ queryKey: ["profile"] });
      writeSessionHint("1");
      announceSessionChange("active");
      setAccessToken(res.accessToken);
      startTabQueries(qc, res.user.id);
      setUser(res.user);
      setConfirmed(true);
      setLoading(false);
    },
    [setUser, qc],
  );

  const login = useCallback(
    (input: LoginInput) => withSessionCookie(async () => {
      apply(await api<AuthResponse>("/auth/login", { method: "POST", body: input, signal: AbortSignal.timeout(10_000) }));
    }),
    [apply],
  );

  const register = useCallback(
    (input: RegisterInput) => withSessionCookie(async () => {
      apply(await api<AuthResponse>("/auth/register", { method: "POST", body: input, signal: AbortSignal.timeout(10_000) }));
    }),
    [apply],
  );

  const loginWithGoogle = useCallback(
    (credential: string) => withSessionCookie(async () => {
      apply(await api<AuthResponse>("/auth/google", { method: "POST", body: { credential }, signal: AbortSignal.timeout(10_000) }));
    }),
    [apply],
  );

  const logout = useCallback(async () => {
    const generation = sessionGeneration();
    // While the access token is still valid: stop this device receiving this person's notifications.
    await releasePushOnLogout();
    await withSessionCookie(async () => {
      if (generation !== sessionGeneration()) return;
      await api("/auth/logout", { method: "POST", signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
      setAccessToken(null);
      setConfirmed(false);
      closeTabQueries();
      qc.clear();
      writeSessionHint("guest");
      setUser(null);
      announceSessionChange("guest");
    });
  }, [setUser, qc]);

  const value = useMemo(
    () => ({ user, loading, confirmed, login, register, loginWithGoogle, logout, setUser, applyAppearance, isCurrentAccount }),
    [user, loading, confirmed, login, register, loginWithGoogle, logout, setUser, applyAppearance, isCurrentAccount],
  );
  if (blocked) return <main className="card" role="alert">
    <h1>Аккаунт заблокирован</h1>
    <p>{restrictionText(blocked)}</p>
    <button className="btn" onClick={() => void logout().then(() => { location.assign("/login"); })}>Ко входу</button>
  </main>;
  if (restoreFailed) return (
    <main role="alert" className="card">
      <p>Не удалось проверить сеанс. Попробуйте ещё раз чуть позже.</p>
      <button className="btn" onClick={() => setRestoreAttempt((attempt) => attempt + 1)}>Повторить</button>
    </main>
  );
  if (loading) return <PageSkeleton />;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
