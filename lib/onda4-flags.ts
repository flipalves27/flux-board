import type { Organization } from "@/lib/kv-organizations";

/** Feature flags persisted per org (`Organization.ui.onda4`) with safe server defaults. */
export type Onda4UiFlags = {
  enabled: boolean;
  omnibar: boolean;
  dailyBriefing: boolean;
  anomalyToasts: boolean;
};

function envTruthy(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw === "") return fallback;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/** Default when org has no override — off in production unless `FLUX_ONDA4_DEFAULT_ENABLED=1`. */
export function envDefaultOnda4Enabled(): boolean {
  return envTruthy(process.env.FLUX_ONDA4_DEFAULT_ENABLED, process.env.NODE_ENV !== "production");
}

/**
 * Effective Onda 4 flags for UI and API.
 * Sub-flags inherit from `enabled` unless explicitly set on the org document.
 */
export function resolveOnda4Flags(org: Organization | null | undefined): Onda4UiFlags {
  const base = envDefaultOnda4Enabled();
  const patch = org?.ui?.onda4;
  const enabled = typeof patch?.enabled === "boolean" ? patch.enabled : base;
  return {
    enabled,
    omnibar: typeof patch?.omnibar === "boolean" ? patch.omnibar : enabled,
    dailyBriefing: typeof patch?.dailyBriefing === "boolean" ? patch.dailyBriefing : enabled,
    anomalyToasts: typeof patch?.anomalyToasts === "boolean" ? patch.anomalyToasts : enabled,
  };
}

export function assertOnda4Enabled(org: Organization | null | undefined): void {
  if (!resolveOnda4Flags(org).enabled) {
    const err = new Error("Recurso Onda 4 desativado para esta organização.");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
}
