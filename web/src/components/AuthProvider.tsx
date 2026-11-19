"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  api,
  clearSession,
  hasSessionHint,
  setSession,
} from "@/lib/api";

type Me = {
  user: { id: string; email: string; name: string };
  clinic: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    brandColour?: string | null;
    hasLogo?: boolean;
    logoUrl?: string | null;
    calendarPrivacyMode?: "FULL_NAME" | "INITIALS";
  };
  role: string;
  practitionerProfileId: string | null;
};

type AuthState = {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);
const ME_CACHE_KEY = "treow_me_cache";

function readMeCache(): Me | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ME_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Me;
  } catch {
    return null;
  }
}

function writeMeCache(me: Me | null) {
  if (typeof window === "undefined") return;
  try {
    if (!me) sessionStorage.removeItem(ME_CACHE_KEY);
    else sessionStorage.setItem(ME_CACHE_KEY, JSON.stringify(me));
  } catch {
    /* ignore quota */
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Always start logged-out on server + first client paint so SSR HTML matches
  // hydration. Reading sessionStorage in useState caused React #418 and broke
  // client-side App Router navigation (Calendar link bounced back to Today).
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const aliveRef = useRef(true);
  const refreshGen = useRef(0);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      refreshGen.current += 1;
    };
  }, []);

  const refresh = useCallback(async () => {
    const gen = ++refreshGen.current;
    // Cookie session may exist even without a local hint (first paint) — always try /me
    const fetchMe = () =>
      Promise.race([
        api<Me>("/auth/me"),
        new Promise<never>((_, reject) => {
          window.setTimeout(
            () => reject(new ApiError(408, "Auth check timed out")),
            5_000,
          );
        }),
      ]);

    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const data = await fetchMe();
        if (!aliveRef.current || gen !== refreshGen.current) return;
        writeMeCache(data);
        setMe(data);
        setSession(data.clinic.id);
        if (aliveRef.current && gen === refreshGen.current) setLoading(false);
        return;
      } catch (e) {
        lastErr = e;
        if (!aliveRef.current || gen !== refreshGen.current) return;
        const status = e instanceof ApiError ? e.status : 0;
        // Auth failure — clear and stop. Transient 5xx/timeout — retry then keep cache.
        if (status === 401 || status === 403) {
          clearSession();
          writeMeCache(null);
          setMe(null);
          if (aliveRef.current && gen === refreshGen.current) setLoading(false);
          return;
        }
        if (attempt < 2 && (status === 0 || status === 408 || status >= 500)) {
          await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt)));
          continue;
        }
        break;
      }
    }

    if (!aliveRef.current || gen !== refreshGen.current) return;
    // Non-auth failure after retries: keep last-good me (do not bounce to login).
    const cached = readMeCache();
    if (cached) setMe(cached);
    void lastErr;
    if (aliveRef.current && gen === refreshGen.current) setLoading(false);
  }, []);

  useLayoutEffect(() => {
    const cached = hasSessionHint() ? readMeCache() : null;
    if (cached) {
      setMe(cached);
      setLoading(false);
    }
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api<{
        accessToken?: string;
        clinic: { id: string };
      }>("/auth/login", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ email, password }),
      });
      // Cookie is set by the server; do not persist accessToken in JS storage.
      setSession(data.clinic.id);
      setLoading(true);
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    try {
      await api("/auth/login", { method: "DELETE" });
    } catch {
      /* ignore */
    }
    clearSession();
    writeMeCache(null);
    setMe(null);
  }, []);

  const value = useMemo(
    () => ({ me, loading, login, logout, refresh }),
    [me, loading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { me, loading, refresh } = useAuth();
  const router = useRouter();
  const retryRef = useRef(false);
  const softRetries = useRef(0);
  const [booting, setBooting] = useState(false);

  useEffect(() => {
    if (loading || booting) return;
    if (me) {
      retryRef.current = false;
      softRetries.current = 0;
      return;
    }
    // Session cookie/hint present but /me flaked (Neon 1101) — retry and stay
    // on the boot screen instead of bouncing to /login.
    if (hasSessionHint() && !retryRef.current) {
      retryRef.current = true;
      setBooting(true);
      void refresh().finally(() => setBooting(false));
      return;
    }
    if (hasSessionHint() && softRetries.current < 4) {
      softRetries.current += 1;
      setBooting(true);
      const t = window.setTimeout(() => {
        void refresh().finally(() => setBooting(false));
      }, 1500);
      return () => window.clearTimeout(t);
    }
    router.replace("/login");
  }, [loading, booting, me, router, refresh]);

  useEffect(() => {
    if (!loading && !booting) return;
    const t = window.setTimeout(() => setBooting(false), 8_000);
    return () => window.clearTimeout(t);
  }, [loading, booting]);

  if ((loading || booting) && !me) {
    // Keep this tree identical on server + first client paint — do not read
    // sessionStorage here (that caused React #418 and broke soft navigation).
    return (
      <div className="book-page auth-boot">
        <div className="auth-boot-card" role="status" aria-live="polite">
          <span className="auth-boot-spinner" aria-hidden />
          <p className="brand-word">Treow</p>
          <p className="muted">Loading clinic…</p>
        </div>
      </div>
    );
  }

  if (!me) return null;
  return <>{children}</>;
}
