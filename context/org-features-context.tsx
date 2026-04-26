"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/context/auth-context";
import { apiGet, ApiError } from "@/lib/api-client";
import type { OrgFeaturesResponse } from "@/types/org-features";
import { UX_V2_FLAG_DEFAULTS, type UxV2Features } from "@/types/ux-v2-features";
import type { Onda4UiFlags } from "@/lib/onda4-flags";

const defaultOnda4: Onda4UiFlags = {
  enabled: false,
  omnibar: false,
  dailyBriefing: false,
  anomalyToasts: false,
};

type OrgFeaturesContextValue = {
  data: OrgFeaturesResponse | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
};

export const OrgFeaturesContext = createContext<OrgFeaturesContextValue | null>(null);

export function OrgFeaturesProvider({ children }: { children: ReactNode }) {
  const { user, isChecked, getHeaders } = useAuth();
  const [data, setData] = useState<OrgFeaturesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!isChecked || !user?.orgId) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const json = await apiGet<OrgFeaturesResponse>("/api/org/features", getHeaders());
      const onda4 = json?.ui?.onda4;
      const uxMerged: UxV2Features = {
        ...UX_V2_FLAG_DEFAULTS,
        ...json?.ui?.uxV2,
        ux_v2_command_unified: Boolean(json.ux_v2_command_unified ?? json?.ui?.uxV2?.ux_v2_command_unified),
        ux_v2_workbar: Boolean(json.ux_v2_workbar ?? json?.ui?.uxV2?.ux_v2_workbar),
        ux_v2_toolbar: Boolean(json.ux_v2_toolbar ?? json?.ui?.uxV2?.ux_v2_toolbar),
        ux_v2_card_modal_v2: Boolean(json.ux_v2_card_modal_v2 ?? json?.ui?.uxV2?.ux_v2_card_modal_v2),
      };
      setData({
        lss_executive_reports: Boolean(json.lss_executive_reports),
        lss_ai_premium: Boolean(json.lss_ai_premium),
        board_copilot: Boolean(json.board_copilot),
        spec_ai_scope_planner: Boolean(json.spec_ai_scope_planner),
        board_pdf_list_import: Boolean(json.board_pdf_list_import),
        flux_docs: Boolean(json.flux_docs),
        forge_oneshot: Boolean(json.forge_oneshot ?? true),
        forge_tested: Boolean(json.forge_tested),
        forge_autonomous: Boolean(json.forge_autonomous),
        ...uxMerged,
        ui: {
          onda4: onda4
            ? {
                enabled: Boolean(onda4.enabled),
                omnibar: Boolean(onda4.omnibar),
                dailyBriefing: Boolean(onda4.dailyBriefing),
                anomalyToasts: Boolean(onda4.anomalyToasts),
              }
            : defaultOnda4,
          uxV2: uxMerged,
        },
      });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setData(null);
        setError(null);
      } else {
        setError(e instanceof Error ? e : new Error("Failed to load org features"));
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, [isChecked, user?.orgId, getHeaders]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      data,
      loading,
      error,
      refresh,
    }),
    [data, loading, error, refresh]
  );

  return <OrgFeaturesContext.Provider value={value}>{children}</OrgFeaturesContext.Provider>;
}

export function useOrgFeaturesContext(): OrgFeaturesContextValue {
  const ctx = useContext(OrgFeaturesContext);
  if (!ctx) {
    throw new Error("useOrgFeatures must be used within OrgFeaturesProvider");
  }
  return ctx;
}

/** Same as `useOrgFeaturesContext` — hook name from UX v2 plan. */
export function useOrgFeatures(): OrgFeaturesContextValue {
  return useOrgFeaturesContext();
}

export function useOrgFeaturesOptional(): OrgFeaturesContextValue | null {
  return useContext(OrgFeaturesContext);
}
