"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { getApiHeaders, apiFetch, fetchSessionValidate } from "@/lib/api-client";
import { switchOrganizationAction } from "@/app/actions/auth";
import type { SessionValidateFailureKind, ValidateResult } from "@/lib/auth-types";
import { FLUX_SESSION_FAILURE_STORAGE_KEY } from "@/lib/session-support-diagnostic";
import type { ThemePreference } from "@/lib/theme-storage";
import type { OrgMembershipRole, PlatformRole } from "@/lib/rbac";

const LEGACY_AUTH_KEY = "flux_board_auth";

/** Margem para cold start + Mongo; alinhado ao `maxDuration` da rota `GET /api/auth/session`. */
const SESSION_VALIDATE_TIMEOUT_MS = 45_000;

/** Após `ok: false` ou timeout na validação inicial, espera antes de re-tentar (cookies OAuth / GET `/api/auth/session`). ~15s total. */
const INITIAL_SESSION_VALIDATE_RETRY_DELAYS_MS = [500, 800, 1500, 2500, 4000, 5500] as const;

/** Extra antes do delay normal quando o servidor devolveu `server_timeout` (evita rajadas inúteis). */
const SERVER_TIMEOUT_RETRY_EXTRA_MS = 2_800;

function sessionFailureFromValidateResult(
  result: ValidateResult
): { supportRef: string; failureKind: SessionValidateFailureKind } | null {
  if (result.ok || !result.supportRef) return null;
  return {
    supportRef: result.supportRef,
    failureKind: result.failureKind ?? "unknown",
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("session_validate_timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      }
    );
  });
}

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
  /** Última falha de validação de sessão (referência para correlacionar com logs no servidor). */
  sessionFailure: { supportRef: string; failureKind: SessionValidateFailureKind } | null;
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

/**
 * Falhas "suaves" de validação em background: não limpamos o utilizador bootstrapped
 * porque o JWT ainda é válido — o servidor é que estava sobrecarregado/frio.
 */
const SOFT_FAILURE_KINDS: ReadonlySet<string> = new Set([
  "server_timeout",
  "client_timeout",
  "unknown",
]);

export function AuthProvider({
  children,
  initialUser,
}: {
  children: React.ReactNode;
  /** Utilizador pré-validado no servidor (bootstrap JWT sem DB). Elimina o "Confirmando a sessão…". */
  initialUser?: AuthUser | null;
}) {
  const [state, setState] = useState<AuthState>(() => {
    if (initialUser) {
      return { user: initialUser, isLoading: false, isChecked: true, sessionFailure: null };
    }
    return { user: null, isLoading: true, isChecked: false, sessionFailure: null };
  });

  /** Incrementado em login/setAuth/logout e antes de operações de sessão — validações em voo ignoram resultado se a geração mudou. */
  const sessionValidationGenRef = useRef(0);

  const setAuth = useCallback((user: AuthUser, _remember = true) => {
    sessionValidationGenRef.current += 1;
    setState({ user, isLoading: false, isChecked: true, sessionFailure: null });
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    clearLegacyStorage();
    sessionValidationGenRef.current += 1;
    setState({ user: null, isLoading: false, isChecked: true, sessionFailure: null });
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
    const myGen = ++sessionValidationGenRef.current;
    try {
      const result = await withTimeout(fetchSessionValidate(), SESSION_VALIDATE_TIMEOUT_MS);
      if (myGen !== sessionValidationGenRef.current) return;
      if (result.ok) {
        setState({
          user: sessionUserToAuthUser(result.user),
          isLoading: false,
          isChecked: true,
          sessionFailure: null,
        });
      } else {
        setState({
          user: null,
          isLoading: false,
          isChecked: true,
          sessionFailure: sessionFailureFromValidateResult(result),
        });
      }
    } catch {
      if (myGen !== sessionValidationGenRef.current) return;
      const supportRef =
        typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto
          ? globalThis.crypto.randomUUID()
          : `client-${Date.now()}`;
      setState({
        user: null,
        isLoading: false,
        isChecked: true,
        sessionFailure: { supportRef, failureKind: "client_timeout" },
      });
    }
  }, []);

  const switchOrganization = useCallback(async (orgId: string) => {
    const myGen = ++sessionValidationGenRef.current;
    try {
      const result = await switchOrganizationAction(orgId);
      if (myGen !== sessionValidationGenRef.current) return false;
      if (result.ok) {
        setState({
          user: sessionUserToAuthUser(result.user),
          isLoading: false,
          isChecked: true,
          sessionFailure: null,
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

    let cancelled = false;
    const initialGen = sessionValidationGenRef.current;
    const hasBootstrap = !!initialUser;

    const applyValidateResult = (result: ValidateResult) => {
      if (cancelled) return;
      if (initialGen !== sessionValidationGenRef.current) return;
      if (result.ok) {
        setState({
          user: sessionUserToAuthUser(result.user),
          isLoading: false,
          isChecked: true,
          sessionFailure: null,
        });
      } else {
        // Se temos bootstrap e a falha é "suave" (servidor frio/timeout), mantemos o
        // utilizador bootstrapped para não piscar a UI — a sessão pode ainda ser válida.
        if (hasBootstrap && result.failureKind && SOFT_FAILURE_KINDS.has(result.failureKind)) {
          setState((prev) => ({ ...prev, isLoading: false, isChecked: true, sessionFailure: null }));
          return;
        }
        setState({
          user: null,
          isLoading: false,
          isChecked: true,
          sessionFailure: sessionFailureFromValidateResult(result),
        });
      }
    };

    const runInitialValidate = async (retryIndex: number) => {
      try {
        const result = await withTimeout(fetchSessionValidate(), SESSION_VALIDATE_TIMEOUT_MS);
        if (cancelled) return;
        if (initialGen !== sessionValidationGenRef.current) return;
        if (result.ok) {
          applyValidateResult(result);
          return;
        }
        if (retryIndex < INITIAL_SESSION_VALIDATE_RETRY_DELAYS_MS.length) {
          let waitMs = INITIAL_SESSION_VALIDATE_RETRY_DELAYS_MS[retryIndex];
          if (result.failureKind === "server_timeout") waitMs += SERVER_TIMEOUT_RETRY_EXTRA_MS;
          await new Promise((r) => setTimeout(r, waitMs));
          if (cancelled) return;
          if (initialGen !== sessionValidationGenRef.current) return;
          await runInitialValidate(retryIndex + 1);
          return;
        }
        applyValidateResult(result);
      } catch (e) {
        if (cancelled) return;
        if (initialGen !== sessionValidationGenRef.current) return;
        const isTimeout = e instanceof Error && e.message === "session_validate_timeout";
        if (isTimeout && retryIndex < INITIAL_SESSION_VALIDATE_RETRY_DELAYS_MS.length) {
          await new Promise((r) => setTimeout(r, INITIAL_SESSION_VALIDATE_RETRY_DELAYS_MS[retryIndex]));
          if (cancelled) return;
          if (initialGen !== sessionValidationGenRef.current) return;
          await runInitialValidate(retryIndex + 1);
          return;
        }
        // Timeout total esgotado: se temos bootstrap, mantemos o utilizador.
        if (hasBootstrap) {
          setState((prev) => ({ ...prev, isLoading: false, isChecked: true, sessionFailure: null }));
          return;
        }
        const supportRef =
          typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto
            ? globalThis.crypto.randomUUID()
            : `client-${Date.now()}`;
        setState({
          user: null,
          isLoading: false,
          isChecked: true,
          sessionFailure: { supportRef, failureKind: "client_timeout" },
        });
      }
    };

    void runInitialValidate(0);

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (state.sessionFailure) {
        sessionStorage.setItem(FLUX_SESSION_FAILURE_STORAGE_KEY, JSON.stringify(state.sessionFailure));
      } else {
        sessionStorage.removeItem(FLUX_SESSION_FAILURE_STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
  }, [state.sessionFailure]);

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
