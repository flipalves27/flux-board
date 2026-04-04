import type { ThemePreference } from "./theme-storage";
import type { OrgMembershipRole, PlatformRole } from "./rbac";

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
  | { ok: false };
