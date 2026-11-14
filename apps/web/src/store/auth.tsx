import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { AuthResponse, LoginInput, PublicUser, RegisterInput } from "@commune/shared";
import { releasePushOnLogout } from "../lib/push";
import { api, bootSession, readSessionHint, SessionRestoreError, setAccessToken, writeSessionHint } from "../lib/api";
import { PageSkeleton } from "../components/Skeleton";
import { useQueryClient } from "@tanstack/react-query";

// The last known profile, shown instantly on the next visit while the session is re-checked.
const USER_KEY = "commune_user";
function readCachedUser(): PublicUser | null {
  if (readSessionHint() !== "1") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as PublicUser) : null;
  } catch {
    return null;
  }
}
function cacheUser(user: PublicUser | null) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: PublicUser | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUserState] = useState<PublicUser | null>(readCachedUser);
  const queryClient = useQueryClient();
  const previousUserId = useRef(user?.id);
  // Wait only when there is nothing to show yet: first visit (unknown) or a session without a cached profile.
  const [loading, setLoading] = useState(() => {
    const hint = readSessionHint();
    return hint === null || (hint === "1" && readCachedUser() === null);
  });
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [restoreFailed, setRestoreFailed] = useState(false);

  const setUser = useCallback((next: PublicUser | null) => {
    if (previousUserId.current !== next?.id) {
      queryClient.removeQueries({ queryKey: ["profile-music"] });
      queryClient.removeQueries({ queryKey: ["music-settings"] });
      queryClient.removeQueries({ queryKey: ["music"] });
      queryClient.removeQueries({ queryKey: ["music-picker"] });
      queryClient.removeQueries({ queryKey: ["link-preview"] });
      previousUserId.current = next?.id;
    }
    cacheUser(next);
    setUserState(next);
  }, [queryClient]);

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const retry = () => setRestoreAttempt((attempt) => attempt + 1);
    setRestoreFailed(false);
    void bootSession(restoreAttempt > 0).then((res) => {
      if (!alive) return;
      if (res) {
        if (readCachedUser()?.id !== res.user.id) qc.clear();
        writeSessionHint("1");
        setUser(res.user);
      } else {
        qc.clear();
        writeSessionHint("guest");
        setUser(null);
      }
      setLoading(false);
    }).catch((error: unknown) => {
      if (!alive) return;
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
      setAccessToken(res.accessToken);
      writeSessionHint("1");
      setUser(res.user);
    },
    [setUser, qc],
  );

  const login = useCallback(
    async (input: LoginInput) => {
      apply(await api<AuthResponse>("/auth/login", { method: "POST", body: input }));
    },
    [apply],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      apply(await api<AuthResponse>("/auth/register", { method: "POST", body: input }));
    },
    [apply],
  );

  const loginWithGoogle = useCallback(
    async (credential: string) => {
      apply(await api<AuthResponse>("/auth/google", { method: "POST", body: { credential } }));
    },
    [apply],
  );

  const logout = useCallback(async () => {
    // While the access token is still valid: stop this device receiving this person's notifications.
    await releasePushOnLogout();
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    setAccessToken(null);
    qc.clear();
    qc.removeQueries({ queryKey: ["friends-access"] });
    qc.removeQueries({ queryKey: ["friends-list"] });
    qc.removeQueries({ queryKey: ["relationships"] });
    qc.removeQueries({ queryKey: ["profile"] });
    writeSessionHint("guest");
    setUser(null);
  }, [setUser, qc]);

  const value = useMemo(
    () => ({ user, loading, login, register, loginWithGoogle, logout, setUser }),
    [user, loading, login, register, loginWithGoogle, logout, setUser],
  );
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
