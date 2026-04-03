"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getApiHeaders, apiFetch } from "@/lib/api-client";
import { validateSessionAction, switchOrganizationAction } from "@/app/actions/auth";
import type { ValidateResult } from "@/lib/auth-types";
import type { ThemePreference } from "@/lib/theme-storage";
import type { OrgMembershipRole, PlatformRole } from "@/lib/rbac";

const LEGACY_AUTH_KEY = "flux_board_auth";

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  email: string;
  /** @deprecated Preferir `seesAllBoardsInOrg` ou `sessionCanManageOrgBilling`. */
  isAdmin: boolean;
  seesAllBoardsInOrg?: boolean;
  isExecutive?: boolean;
  orgId: string;
  platformRole: PlatformRole;
  orgRole: OrgMembershipRole;
  themePreference?: ThemePreference;
  boardProductTourCompleted?: boolean;
  /** @deprecated Usar `sessionCanManageOrgBilling(user)`. */
  isOrgTeamManager?: boolean;
}

function sessionUserToAuthUser(u: Extract<ValidateResult, { ok: true }>["user"]): AuthUser {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    email: u.email,
    isAdmin: u.isAdmin,
    seesAllBoardsInOrg: u.seesAllBoardsInOrg,
    ...(u.isExecutive ? { isExecutive: true } : {}),
    orgId: u.orgId,
    platformRole: u.platformRole,
    orgRole: u.orgRole,
    ...(u.isOrgTeamManager ? { isOrgTeamManager: true } : {}),
    ...(u.themePreference ? { themePreference: u.themePreference } : {}),
    ...(u.boardProductTourCompleted ? { boardProductTourCompleted: true } : {}),
  };
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
  /** Troca a organização ativa na sessão (várias orgs). */
  switchOrganization: (orgId: string) => Promise<boolean>;
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
          user: sessionUserToAuthUser(result.user),
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

  const switchOrganization = useCallback(async (orgId: string) => {
    try {
      const result = await switchOrganizationAction(orgId);
      if (result.ok) {
        setState({
          user: sessionUserToAuthUser(result.user),
          isLoading: false,
          isChecked: true,
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    clearLegacyStorage();

    validateSessionAction()
      .then((result) => {
        if (result.ok) {
          setState({
            user: sessionUserToAuthUser(result.user),
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
        switchOrganization,
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
