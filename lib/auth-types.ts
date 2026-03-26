import type { ThemePreference } from "./theme-storage";
import type { OrgRole, PlatformRole } from "./rbac";

export type ValidateResult =
  | {
      ok: true;
      user: {
        id: string;
        username: string;
        name: string;
        email: string;
        isAdmin: boolean;
        isExecutive?: boolean;
        orgId: string;
        platformRole: PlatformRole;
        orgRole: OrgRole;
        themePreference?: ThemePreference;
        boardProductTourCompleted?: boolean;
      };
    }
  | { ok: false };
