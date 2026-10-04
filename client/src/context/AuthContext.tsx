import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { AuthUser, UNAUTHENTICATED_EVENT, getCurrentUser, login as apiLogin, logout as apiLogout } from "../api.js";

// Lab 3 Issue 2 — replaces Lab 2's RequesterContext. Nothing about the user is persisted
// client-side: the httpOnly session cookie is the only credential, and the user object here is
// just a cache of GET /api/auth/me (FR-03). The server is always the authority (FR-07).
interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean; // true until the first /me round-trip settles
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setUser(await getCurrentUser());
    } catch {
      // Network/server failure: treat as signed out for routing purposes; screens show their own
      // failure states when their real requests fail.
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // AC-30 — any 401 from a protected call ends the client session immediately.
  useEffect(() => {
    const onUnauthenticated = () => setUser(null);
    window.addEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
    return () => window.removeEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
  }, []);

  async function login(email: string, password: string) {
    const next = await apiLogin(email, password);
    setUser(next);
    return next;
  }

  async function logout() {
    try {
      await apiLogout();
    } finally {
      setUser(null); // the cookie is cleared server-side either way (BR-09)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setUser, refresh }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

// ui-spec.md §2 — where each role lands after login / on "/".
export function roleHome(role: AuthUser["role"]): string {
  switch (role) {
    case "IT_STAFF":
      return "/staff/queue";
    case "ADMIN":
      return "/admin/users";
    default:
      return "/tickets";
  }
}

export const ROLE_LABEL: Record<AuthUser["role"], string> = {
  REQUESTER: "Requester",
  IT_STAFF: "IT Staff",
  ADMIN: "Administrator",
};
