/** Branding aplicado em todo o app (além do portal). Plano Business: domínio customizado. */
export type OrgBranding = {
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  /** Destaques / CTAs — aplicado como `--flux-accent` quando definido. */
  accentColor?: string;
  faviconUrl?: string;
  /** Nome exibido no lugar de "Flux-Board" na UI e e-mails. */
  platformName?: string;
  /** Host esperado (ex.: board.cliente.com) — CNAME + verificação TXT. */
  customDomain?: string;
  /** Quando o TXT `flux-verify=…` foi confirmado. */
  customDomainVerifiedAt?: string;
  /** Token mostrado na org settings para o registro TXT (gerado no servidor). */
  domainVerificationToken?: string;
  /** Endereço do remetente (domínio deve estar verificado no Resend). */
  emailFrom?: string;
};

export const DEFAULT_PLATFORM_NAME = "Flux-Board";

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Máximo ~2 MiB por asset em base64 (logo / favicon). */
export const BRANDING_ASSET_MAX_BYTES = 2 * 1024 * 1024;

export function sanitizeHexColor(input: string | undefined | null): string | undefined {
  if (!input || typeof input !== "string") return undefined;
  const t = input.trim();
  if (!HEX.test(t)) return undefined;
  return t;
}

export function orgBrandingAllowsTheming(
  org: { plan: string } | null | undefined,
  opts?: { isOrgAdmin?: boolean }
): boolean {
  if (opts?.isOrgAdmin) return true;
  if (!org) return false;
  return org.plan === "pro" || org.plan === "business" || org.plan === "enterprise" || org.plan === "trial";
}

export function orgBrandingAllowsCustomDomain(
  org: { plan: string } | null | undefined,
  opts?: { isOrgAdmin?: boolean }
): boolean {
  if (opts?.isOrgAdmin) return true;
  if (!org) return false;
  return org.plan === "business" || org.plan === "enterprise";
}

export function resolvePlatformDisplayName(
  branding: OrgBranding | null | undefined,
  orgNameFallback?: string | null
): string {
  const n = branding?.platformName?.trim();
  if (n) return n.slice(0, 80);
  const o = orgNameFallback?.trim();
  if (o) return o.slice(0, 80);
  return DEFAULT_PLATFORM_NAME;
}

/** Valida URL http(s) ou data:image base64 e tamanho aproximado do binário. */
export function sanitizeBrandingAssetUrl(
  input: string | undefined | null,
  maxBytes: number
): string | undefined {
  if (input == null || typeof input !== "string") return undefined;
  const t = input.trim();
  if (!t) return undefined;
  if (/^https?:\/\//i.test(t)) {
    if (t.length > 4096) return undefined;
    return t;
  }
  const compact = t.replace(/\s/g, "");
  if (!compact.startsWith("data:image/") || !compact.includes(";base64,")) return undefined;
  if (!validateDataUrlBinarySize(compact, maxBytes)) return undefined;
  return t;
}

export function validateDataUrlBinarySize(dataUrl: string, maxBytes: number): boolean {
  const m = /^data:[^;]+;base64,(.+)$/i.exec(dataUrl.replace(/\s/g, ""));
  if (!m) return true;
  const b64 = m[1];
  const approxBytes = Math.floor((b64.length * 3) / 4);
  return approxBytes <= maxBytes;
}

/** Escurece levemente uma cor hex para --flux-primary-dark */
export function shadePrimaryDark(hex: string): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return "#4834D4";
  const r = Math.max(0, ((n >> 16) & 0xff) * 0.75) | 0;
  const g = Math.max(0, ((n >> 8) & 0xff) * 0.75) | 0;
  const b = Math.max(0, (n & 0xff) * 0.75) | 0;
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export function shadeAccentDark(hex: string): string {
  return shadePrimaryDark(hex);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function sanitizeEmailFrom(input: string | undefined | null): string | undefined {
  if (!input || typeof input !== "string") return undefined;
  const t = input.trim().slice(0, 255);
  if (!t) return undefined;
  if (!EMAIL.test(t)) return undefined;
  return t.toLowerCase();
}

export function defaultAppHostnameFromEnv(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
  try {
    if (!raw) return null;
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}
