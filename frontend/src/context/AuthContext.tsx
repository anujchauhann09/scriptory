import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi, userApi, setUnauthorizedHandler } from '../lib/api';

export type Role = 'ADMIN' | 'USER';

export interface AuthUser {
  uuid: string;
  email: string;
  role: Role;
  twoFactorEnabled?: boolean;
  profile?: { name?: string | null; avatarUrl?: string | null; bio?: string | null };
}

interface AuthContextType {
  user: AuthUser | null;
  isAdmin: boolean;
  isLoading: boolean;
  login: (email: string, password: string, totp?: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (profile: { name?: string | null; bio?: string | null; avatarUrl?: string | null }) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// non-sensitive user snapshot for instant paint. The auth token itself lives in
// an httpOnly cookie
const CACHE_KEY = 'auth_user';

const readCachedUser = (): AuthUser | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
};

const cacheUser = (user: AuthUser | null) => {
  try {
    if (user) localStorage.setItem(CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const cached = readCachedUser();
  const [user, setUser] = useState<AuthUser | null>(cached);
  const [isLoading, setIsLoading] = useState(true);

  const applyUser = (u: AuthUser | null) => {
    setUser(u);
    cacheUser(u);
  };

  // on load, confirm the session against the server (the cookie is sent automatically)
  useEffect(() => {
    let cancelled = false;
    userApi
      .me()
      .then((u) => { if (!cancelled) applyUser(u as AuthUser); })
      .catch(() => { if (!cancelled) applyUser(null); }) // 401 / offline → treat as signed out
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  /**
   * Clear the session whenever any API call comes back unauthorised.
   *
   * The server can invalidate a token at any time — the password changed, 2FA
   * was toggled, sessions were revoked elsewhere, or the cookie simply expired.
   * Without this the app kept rendering a signed-in shell against a dead
   * session, and every action failed with a generic error until the user
   * reloaded. The cached snapshot is dropped too, so a refresh does not restore
   * the illusion.
   */
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser((prev) => {
        if (prev) cacheUser(null);
        return null;
      });
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = async (email: string, password: string, totp?: string) => {
    const u = await authApi.login(email, password, totp);
    applyUser(u as AuthUser);
  };

  const register = async (email: string, password: string, name?: string) => {
    const u = await authApi.register(email, password, name);
    applyUser(u as AuthUser);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      /* clear locally regardless */
    }
    applyUser(null);
  };

  const refreshUser = async () => {
    try {
      const u = await userApi.me();
      applyUser(u as AuthUser);
    } catch {
      applyUser(null);
    }
  };

  const updateProfile = (profile: { name?: string | null; bio?: string | null; avatarUrl?: string | null }) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, profile: { ...prev.profile, ...profile } };
      cacheUser(updated);
      return updated;
    });
  };

  return (
    <AuthContext.Provider
      value={{ user, isAdmin: user?.role === 'ADMIN', isLoading, login, register, logout, refreshUser, updateProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
