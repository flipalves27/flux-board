"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getApiHeaders, apiFetch } from "@/lib/api-client";
import { validateTokenAction } from "@/app/actions/auth";

const AUTH_KEY = "reborn_auth";

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  email: string;
  isAdmin: boolean;
}

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  isChecked: boolean;
}

interface AuthContextType extends AuthState {
  login: (token: string, user: AuthUser, remember?: boolean) => void;
  logout: () => void;
  setAuth: (token: string, user: AuthUser, remember?: boolean) => void;
  getHeaders: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function getStoredAuth(): { token: string; user?: AuthUser } | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return data?.token ? data : null;
  } catch {
    return null;
  }
}

function clearStoredAuth(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(AUTH_KEY);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    user: null,
    isLoading: true,
    isChecked: false,
  });

  const setAuth = useCallback((token: string, user: AuthUser, remember = true) => {
    const data = { token, user };
    if (typeof window !== "undefined") {
      if (remember) localStorage.setItem(AUTH_KEY, JSON.stringify(data));
      else sessionStorage.setItem(AUTH_KEY, JSON.stringify(data));
    }
    setState({ token, user, isLoading: false, isChecked: true });
  }, []);

  const logout = useCallback(() => {
    clearStoredAuth();
    setState({ token: null, user: null, isLoading: false, isChecked: true });
  }, []);

  const login = useCallback((token: string, user: AuthUser, remember = true) => {
    setAuth(token, user, remember);
  }, [setAuth]);

  const getHeaders = useCallback(() => {
    return getApiHeaders(
      state.token ? { Authorization: `Bearer ${state.token}` } : undefined
    );
  }, [state.token]);

  useEffect(() => {
    const stored = getStoredAuth();
    if (!stored) {
      setState((s) => ({ ...s, isLoading: false, isChecked: true }));
      return;
    }

    // Usa Server Action para validar token (evita 403 da Vercel Protection)
    validateTokenAction(stored.token)
      .then((result) => {
        if (result.ok) {
          setState({
            token: stored.token,
            user: result.user,
            isLoading: false,
            isChecked: true,
          });
        } else {
          clearStoredAuth();
          setState({ token: null, user: null, isLoading: false, isChecked: true });
        }
      })
      .catch(() => {
        clearStoredAuth();
        setState({ token: null, user: null, isLoading: false, isChecked: true });
      });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        setAuth,
        getHeaders,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
