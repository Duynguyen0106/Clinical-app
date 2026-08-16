"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { api, clearSession, getToken, setSession } from "@/lib/api";

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api<Me>("/auth/me");
      setMe(data);
    } catch {
      clearSession();
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Session restore on mount — intentional bootstrap.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auth bootstrap
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
  const { me, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  if (loading) {
    return (
      <div className="book-page">
        <p className="muted">Loading clinic…</p>
      </div>
    );
  }

  if (!me) return null;
  return <>{children}</>;
}
