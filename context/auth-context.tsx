"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getApiHeaders, apiFetch } from "@/lib/api-client";
import { validateSessionAction } from "@/app/actions/auth";
import type { ThemePreference } from "@/lib/theme-storage";

const LEGACY_AUTH_KEY = "flux_board_auth";

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  email: string;
  isAdmin: boolean;
  isExecutive?: boolean;
  orgId: string;
  themePreference?: ThemePreference;
  boardProductTourCompleted?: boolean;
}

export interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isChecked: boolean;
}

interface AuthContextType extends AuthState {
  login: (user: AuthUser, remember?: boolean) => void;
  logout: () => Promise<void>;
  setAuth: (user: AuthUser, remember?: boolean) => void;
  getHeaders: () => Record<string, string>;
  /** Revalida cookies (ex.: após mudar papel admin no servidor). */
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function clearLegacyStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LEGACY_AUTH_KEY);
    sessionStorage.removeItem(LEGACY_AUTH_KEY);
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isChecked: false,
  });

  const setAuth = useCallback((user: AuthUser, _remember = true) => {
    setState({ user, isLoading: false, isChecked: true });
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    clearLegacyStorage();
    setState({ user: null, isLoading: false, isChecked: true });
  }, []);

  const login = useCallback(
    (user: AuthUser, remember = true) => {
      clearLegacyStorage();
      setAuth(user, remember);
    },
    [setAuth]
  );

  const getHeaders = useCallback(() => {
    return getApiHeaders(undefined);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const result = await validateSessionAction();
      if (result.ok) {
        setState({
          user: result.user,
          isLoading: false,
          isChecked: true,
        });
      } else {
        setState({ user: null, isLoading: false, isChecked: true });
      }
    } catch {
      setState({ user: null, isLoading: false, isChecked: true });
    }
  }, []);

  useEffect(() => {
    clearLegacyStorage();

    validateSessionAction()
      .then((result) => {
        if (result.ok) {
          setState({
            user: result.user,
            isLoading: false,
            isChecked: true,
          });
        } else {
          setState({ user: null, isLoading: false, isChecked: true });
        }
      })
      .catch(() => {
        setState({ user: null, isLoading: false, isChecked: true });
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
        refreshSession,
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
