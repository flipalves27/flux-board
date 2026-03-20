/** Branding aplicado em todo o app (além do portal). Plano Business: domínio customizado. */
export type OrgBranding = {
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  faviconUrl?: string;
  /** Host esperado (ex.: board.cliente.com) — documentação / validação futura com CNAME */
  customDomain?: string;
};

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function sanitizeHexColor(input: string | undefined | null): string | undefined {
  if (!input || typeof input !== "string") return undefined;
  const t = input.trim();
  if (!HEX.test(t)) return undefined;
  return t;
}

export function orgBrandingAllowsTheming(org: { plan: string } | null | undefined): boolean {
  if (!org) return false;
  return org.plan === "pro" || org.plan === "business";
}

export function orgBrandingAllowsCustomDomain(org: { plan: string } | null | undefined): boolean {
  if (!org) return false;
  return org.plan === "business";
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
