import type { ThemePreference } from "./theme-storage";
import type { OrgMembershipRole, PlatformRole } from "./rbac";

/** Categoria opaca para suporte (sem PII). O servidor regista o mesmo `supportRef` nos logs. */
export type SessionValidateFailureKind =
  | "no_cookies"
  | "token_invalid"
  | "user_not_found"
  | "unknown"
  /** Gerado no cliente quando a validação expira (não aparece nos logs do servidor). */
  | "client_timeout";

export type ValidateResult =
  | {
      ok: true;
      user: {
        id: string;
        username: string;
        name: string;
        email: string;
        /** @deprecated Igual a `seesAllBoardsInOrg`. */
        isAdmin: boolean;
        seesAllBoardsInOrg: boolean;
        isExecutive?: boolean;
        orgId: string;
        platformRole: PlatformRole;
        orgRole: OrgMembershipRole;
        themePreference?: ThemePreference;
        boardProductTourCompleted?: boolean;
        /** @deprecated Alinhado a gestor ou admin da plataforma. */
        isOrgTeamManager?: boolean;
      };
    }
  | {
      ok: false;
      /** Correlação com `[flux-session-validate]` nos logs da Vercel (exceto `client_timeout`). */
      supportRef?: string;
      failureKind?: SessionValidateFailureKind;
    };
