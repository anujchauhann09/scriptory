import React, { createContext, useContext, useEffect, useState } from 'react';

export type Role = 'ADMIN' | 'USER';

export interface AuthUser {
  id: number;
  uuid: string;
  email: string;
  role: Role;
  profile?: { name?: string | null; avatarUrl?: string | null };
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAdmin: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
  updateProfile: (profile: { name?: string | null; bio?: string | null; avatarUrl?: string | null }) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('auth');
      if (stored) {
        const { user, token } = JSON.parse(stored);
        setUser(user);
        setToken(token);
      }
    } catch {
      localStorage.removeItem('auth');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = async (email: string, password: string, name?: string) => {
    let res: Response;
    try {
      res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
    } catch {
      throw new Error('Unable to connect to the server. Please try again later.');
    }
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Registration failed');

    const { user, token } = json.data;
    setUser(user);
    setToken(token);
    localStorage.setItem('auth', JSON.stringify({ user, token }));
  };

  const login = async (email: string, password: string) => {
    let res: Response;
    try {
      res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new Error('Unable to connect to the server. Please try again later.');
    }
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Login failed');

    const { user, token } = json.data;
    setUser(user);
    setToken(token);
    localStorage.setItem('auth', JSON.stringify({ user, token }));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('auth');
  };

  const updateProfile = (profile: { name?: string | null; bio?: string | null; avatarUrl?: string | null }) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, profile: { ...prev.profile, ...profile } };
      const stored = localStorage.getItem('auth');
      if (stored) {
        const parsed = JSON.parse(stored);
        localStorage.setItem('auth', JSON.stringify({ ...parsed, user: updated }));
      }
      return updated;
    });
  };

  return (
    <AuthContext.Provider
      value={{ user, token, isAdmin: user?.role === 'ADMIN', isLoading, login, register, logout, updateProfile }}
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
