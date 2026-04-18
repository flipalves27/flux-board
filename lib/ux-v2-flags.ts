import type { Organization } from "@/lib/kv-organizations";
import { UX_V2_FLAG_DEFAULTS, type UxV2FeatureKey, type UxV2Features } from "@/types/ux-v2-features";

function envTruthy(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw === "") return fallback;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

function envFlagForKey(key: UxV2FeatureKey): boolean | undefined {
  const map: Record<UxV2FeatureKey, string | undefined> = {
    ux_v2_command_unified: process.env.UX_V2_COMMAND_UNIFIED,
    ux_v2_workbar: process.env.UX_V2_WORKBAR,
    ux_v2_toolbar: process.env.UX_V2_TOOLBAR,
    ux_v2_card_modal_v2: process.env.UX_V2_CARD_MODAL_V2,
  };
  const raw = map[key];
  if (raw == null || raw === "") return undefined;
  return envTruthy(raw, false);
}

/**
 * Effective UX v2 flags: defaults, optional org overrides (`Organization.ui.uxV2`),
 * then env (`UX_V2_*`) wins for rollout / emergencies.
 */
export function resolveUxV2Flags(org: Organization | null | undefined): UxV2Features {
  const patch = org?.ui?.uxV2;
  const next = { ...UX_V2_FLAG_DEFAULTS };

  for (const key of Object.keys(UX_V2_FLAG_DEFAULTS) as UxV2FeatureKey[]) {
    if (typeof patch?.[key] === "boolean") {
      next[key] = patch[key];
    }
    const envOverride = envFlagForKey(key);
    if (typeof envOverride === "boolean") {
      next[key] = envOverride;
    }
  }

  return next;
}
