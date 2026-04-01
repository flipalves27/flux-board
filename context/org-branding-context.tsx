"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { apiGet, ApiError } from "@/lib/api-client";
import type { OrgBranding } from "@/lib/org-branding";
import {
  DEFAULT_PLATFORM_NAME,
  orgBrandingAllowsCustomDomain,
  orgBrandingAllowsTheming,
  resolvePlatformDisplayName,
  sanitizeHexColor,
  shadeAccentDark,
  shadePrimaryDark,
  defaultAppHostnameFromEnv,
} from "@/lib/org-branding";

type OrgPayload = {
  _id: string;
  name: string;
  slug: string;
  plan: "free" | "trial" | "pro" | "business";
  trialEndsAt?: string | null;
  downgradeGraceEndsAt?: string | null;
  downgradeFromTier?: "pro" | "business" | null;
  billingNotice?: { kind: "trial_ended" | "downgrade_grace_ended"; at: string } | null;
  branding?: OrgBranding | null;
};

type PublicBrandingPayload = {
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  platformName?: string;
  faviconUrl?: string;
  customDomainVerified?: boolean;
};

type OrgBrandingContextValue = {
  org: OrgPayload | null;
  loading: boolean;
  branding: OrgBranding | null;
  /** Sessão + / ou branding público (domínio customizado). */
  effectiveBranding: OrgBranding | null;
  platformDisplayName: string;
  allowsTheming: boolean;
  allowsCustomDomain: boolean;
  refresh: () => Promise<void>;
};

const OrgBrandingContext = createContext<OrgBrandingContextValue | null>(null);

const DEFAULT_DOC_TITLE = `${DEFAULT_PLATFORM_NAME} — Commercial operations with clarity`;
const DEFAULT_FAVICON_HREF = "/favicon.svg";

function isVercelPreviewHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized.endsWith(".vercel.app") && normalized.includes("-");
}

function applyBrandingToDocument(
  branding: OrgBranding | null | undefined,
  allowsTheming: boolean,
  platformName: string
) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!allowsTheming || !branding) {
    root.style.removeProperty("--flux-org-primary");
    root.style.removeProperty("--flux-org-primary-dark");
    root.style.removeProperty("--flux-org-secondary");
    root.style.removeProperty("--flux-org-accent");
    root.style.removeProperty("--flux-org-accent-dark");
    root.style.removeProperty("--org-branding-active");
    document.title = DEFAULT_DOC_TITLE;
    const defaultIcon = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    if (defaultIcon) defaultIcon.href = DEFAULT_FAVICON_HREF;
    const defaultApple = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
    if (defaultApple) defaultApple.href = DEFAULT_FAVICON_HREF;
    return;
  }
  const primary = sanitizeHexColor(branding.primaryColor);
  const secondary = sanitizeHexColor(branding.secondaryColor);
  const accent = sanitizeHexColor(branding.accentColor);
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
  if (accent) {
    root.style.setProperty("--flux-org-accent", accent);
    root.style.setProperty("--flux-org-accent-dark", shadeAccentDark(accent));
    root.style.setProperty("--flux-accent", accent);
    root.style.setProperty("--flux-accent-dark", shadeAccentDark(accent));
  } else {
    root.style.removeProperty("--flux-org-accent");
    root.style.removeProperty("--flux-org-accent-dark");
  }
  root.style.setProperty("--org-branding-active", primary || secondary || accent ? "1" : "0");

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

  let apple = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
  if (fav) {
    if (!apple) {
      apple = document.createElement("link");
      apple.rel = "apple-touch-icon";
      document.head.appendChild(apple);
    }
    apple.href = fav;
  }

  const baseTitle = "Commercial operations with clarity";
  if (platformName && platformName !== DEFAULT_PLATFORM_NAME) {
    document.title = `${platformName} — ${baseTitle}`;
  } else {
    document.title = DEFAULT_DOC_TITLE;
  }
}

export function OrgBrandingProvider({ children }: { children: React.ReactNode }) {
  const { user, getHeaders, isChecked } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;
  const getHeadersRef = useRef(getHeaders);
  getHeadersRef.current = getHeaders;

  const [org, setOrg] = useState<OrgPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [publicBranding, setPublicBranding] = useState<PublicBrandingPayload | null>(null);

  /**
   * `user` e `getHeaders` mudam de identidade no contexto; não podem estar nas deps de `useCallback`
   * sem recriar `refresh` a cada render → `useEffect([refresh])` dispara em loop (React #185).
   */
  const refresh = useCallback(async () => {
    const u = userRef.current;
    if (!u) {
      setOrg(null);
      return;
    }
    setLoading(true);
    try {
      const data = await apiGet<{ organization: OrgPayload }>("/api/organizations/me", getHeadersRef.current());
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
  }, []);

  useEffect(() => {
    if (!isChecked || !user?.id) {
      setOrg(null);
      applyBrandingToDocument(null, false, DEFAULT_PLATFORM_NAME);
      return;
    }
    void refresh();
  }, [isChecked, user?.id, refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const host = window.location.hostname.toLowerCase();
    const appHost = defaultAppHostnameFromEnv();
    if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1") {
      setPublicBranding(null);
      return;
    }
    if (appHost && host === appHost) {
      setPublicBranding(null);
      return;
    }
    if (isVercelPreviewHost(host)) {
      setPublicBranding(null);
      return;
    }

    (async () => {
      try {
        const r = await fetch(`/api/organizations/branding-public?host=${encodeURIComponent(host)}`, {
          cache: "no-store",
        });
        if (!r.ok) {
          if (!cancelled) setPublicBranding(null);
          return;
        }
        const data = (await r.json()) as { branding?: PublicBrandingPayload | null };
        if (cancelled) return;
        setPublicBranding(data?.branding ?? null);
      } catch {
        if (!cancelled) setPublicBranding(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveBranding = useMemo((): OrgBranding | null => {
    const fromUser = org?.branding;
    if (fromUser && Object.keys(fromUser).length) return fromUser;
    if (publicBranding) {
      return {
        logoUrl: publicBranding.logoUrl,
        primaryColor: publicBranding.primaryColor,
        secondaryColor: publicBranding.secondaryColor,
        accentColor: publicBranding.accentColor,
        platformName: publicBranding.platformName,
        faviconUrl: publicBranding.faviconUrl,
      };
    }
    return null;
  }, [org?.branding, publicBranding]);

  const allowsTheming = Boolean(publicBranding) || orgBrandingAllowsTheming(org);
  const allowsCustomDomain = orgBrandingAllowsCustomDomain(org);

  const platformDisplayName = useMemo(
    () => resolvePlatformDisplayName(effectiveBranding ?? undefined, org?.name),
    [effectiveBranding, org?.name]
  );

  useEffect(() => {
    applyBrandingToDocument(effectiveBranding ?? null, allowsTheming, platformDisplayName);
    return () => {
      applyBrandingToDocument(null, false, DEFAULT_PLATFORM_NAME);
    };
  }, [effectiveBranding, allowsTheming, platformDisplayName]);

  const value = useMemo<OrgBrandingContextValue>(
    () => ({
      org,
      loading,
      branding: org?.branding ?? null,
      effectiveBranding,
      platformDisplayName,
      allowsTheming,
      allowsCustomDomain,
      refresh,
    }),
    [org, loading, effectiveBranding, platformDisplayName, allowsTheming, allowsCustomDomain, refresh]
  );

  return <OrgBrandingContext.Provider value={value}>{children}</OrgBrandingContext.Provider>;
}

export function useOrgBranding(): OrgBrandingContextValue | null {
  return useContext(OrgBrandingContext);
}

export function usePlatformDisplayName(): string {
  const ctx = useOrgBranding();
  return ctx?.platformDisplayName ?? DEFAULT_PLATFORM_NAME;
}
