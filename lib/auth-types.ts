import type { ThemePreference } from "./theme-storage";

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
        themePreference?: ThemePreference;
        boardProductTourCompleted?: boolean;
      };
    }
  | { ok: false };
