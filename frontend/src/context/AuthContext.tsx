import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as api from "@/api/client";
import type { User } from "@/api/types";

type AuthState = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (u: string, p: string) => Promise<void>;
  logout: () => void;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!api.getAccess()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.fetchMe();
      setUser(me);
    } catch {
      api.setTokens(null, null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    await api.login(username, password);
    const me = await api.fetchMe();
    setUser(me);
  }, []);

  const logout = useCallback(() => {
    api.setTokens(null, null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, refresh, login, logout }),
    [user, loading, refresh, login, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth fuera de AuthProvider");
  return v;
}
