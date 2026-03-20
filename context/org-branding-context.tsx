"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { apiGet, ApiError } from "@/lib/api-client";
import type { OrgBranding } from "@/lib/org-branding";
import { orgBrandingAllowsCustomDomain, orgBrandingAllowsTheming, shadePrimaryDark, sanitizeHexColor } from "@/lib/org-branding";

type OrgPayload = {
  _id: string;
  name: string;
  slug: string;
  plan: "free" | "pro" | "business";
  branding?: OrgBranding | null;
};

type OrgBrandingContextValue = {
  org: OrgPayload | null;
  loading: boolean;
  branding: OrgBranding | null;
  allowsTheming: boolean;
  allowsCustomDomain: boolean;
  refresh: () => Promise<void>;
};

const OrgBrandingContext = createContext<OrgBrandingContextValue | null>(null);

function applyBrandingToDocument(branding: OrgBranding | null | undefined, allowsTheming: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!allowsTheming || !branding) {
    root.style.removeProperty("--flux-org-primary");
    root.style.removeProperty("--flux-org-primary-dark");
    root.style.removeProperty("--flux-org-secondary");
    root.style.removeProperty("--org-branding-active");
    return;
  }
  const primary = sanitizeHexColor(branding.primaryColor);
  const secondary = sanitizeHexColor(branding.secondaryColor);
  if (primary) {
    root.style.setProperty("--flux-org-primary", primary);
    root.style.setProperty("--flux-org-primary-dark", shadePrimaryDark(primary));
    root.style.setProperty("--flux-primary", primary);
    root.style.setProperty("--flux-primary-dark", shadePrimaryDark(primary));
  } else {
    root.style.removeProperty("--flux-org-primary");
    root.style.removeProperty("--flux-org-primary-dark");
  }
  if (secondary) {
    root.style.setProperty("--flux-org-secondary", secondary);
    root.style.setProperty("--flux-secondary", secondary);
  } else {
    root.style.removeProperty("--flux-org-secondary");
  }
  root.style.setProperty("--org-branding-active", primary || secondary ? "1" : "0");

  let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
  const fav = branding.faviconUrl?.trim();
  if (fav) {
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = fav;
  }
}

export function OrgBrandingProvider({ children }: { children: React.ReactNode }) {
  const { user, getHeaders, isChecked } = useAuth();
  const [org, setOrg] = useState<OrgPayload | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setOrg(null);
      return;
    }
    setLoading(true);
    try {
      const data = await apiGet<{ organization: OrgPayload }>("/api/organizations/me", getHeaders());
      setOrg(data?.organization ?? null);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setOrg(null);
        return;
      }
      setOrg(null);
    } finally {
      setLoading(false);
    }
  }, [user, getHeaders]);

  useEffect(() => {
    if (!isChecked || !user) {
      setOrg(null);
      applyBrandingToDocument(null, false);
      return;
    }
    void refresh();
  }, [isChecked, user, refresh]);

  const allowsTheming = orgBrandingAllowsTheming(org);
  const allowsCustomDomain = orgBrandingAllowsCustomDomain(org);

  useEffect(() => {
    applyBrandingToDocument(org?.branding ?? null, allowsTheming);
    return () => {
      applyBrandingToDocument(null, false);
    };
  }, [org?.branding, allowsTheming]);

  const value = useMemo<OrgBrandingContextValue>(
    () => ({
      org,
      loading,
      branding: org?.branding ?? null,
      allowsTheming,
      allowsCustomDomain,
      refresh,
    }),
    [org, loading, allowsTheming, allowsCustomDomain, refresh]
  );

  return <OrgBrandingContext.Provider value={value}>{children}</OrgBrandingContext.Provider>;
}

export function useOrgBranding(): OrgBrandingContextValue | null {
  return useContext(OrgBrandingContext);
}
