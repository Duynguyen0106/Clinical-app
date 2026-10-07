"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { ApiError, api, clearSession, getToken, setSession } from "@/lib/api";

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
  const [me, setMe] = useState<Me | null>(() =>
    getToken() ? readMeCache() : null,
  );
  const [loading, setLoading] = useState(
    () => !(typeof window !== "undefined" && getToken() && readMeCache()),
  );
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
    if (!getToken()) {
      writeMeCache(null);
      if (aliveRef.current && gen === refreshGen.current) {
        setMe(null);
        setLoading(false);
      }
      return;
    }
    try {
      const data = await Promise.race([
        api<Me>("/auth/me"),
        new Promise<never>((_, reject) => {
          window.setTimeout(
            () => reject(new ApiError(408, "Auth check timed out")),
            5_000,
          );
        }),
      ]);
      if (!aliveRef.current || gen !== refreshGen.current) return;
      writeMeCache(data);
      setMe(data);
    } catch (e) {
      if (!aliveRef.current || gen !== refreshGen.current) return;
      const status = e instanceof ApiError ? e.status : 0;
      if (status === 401 || status === 403) {
        clearSession();
        writeMeCache(null);
        setMe(null);
      } else {
        const cached = readMeCache();
        if (cached) setMe(cached);
      }
    } finally {
      if (aliveRef.current && gen === refreshGen.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const cached = getToken() ? readMeCache() : null;
    if (cached) {
      setMe(cached);
      setLoading(false);
    }
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api<{
        accessToken: string;
        clinic: { id: string };
      }>("/auth/login", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ email, password }),
      });
      setSession(data.accessToken, data.clinic.id);
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
  const [booting, setBooting] = useState(false);

  useEffect(() => {
    if (loading || booting) return;
    if (me) {
      retryRef.current = false;
      return;
    }
    if (getToken() && !retryRef.current) {
      retryRef.current = true;
      setBooting(true);
      void refresh().finally(() => setBooting(false));
      return;
    }
    router.replace("/login");
  }, [loading, booting, me, router, refresh]);

  useEffect(() => {
    if (!loading && !booting) return;
    const t = window.setTimeout(() => setBooting(false), 8_000);
    return () => window.clearTimeout(t);
  }, [loading, booting]);

  if ((loading || booting) && !me) {
    return (
      <div className="book-page">
        <p className="muted">Loading clinic…</p>
      </div>
    );
  }

  if (!me) return null;
  return <>{children}</>;
}
