import type { Organization } from "@/lib/kv-organizations";
import { resolvePlatformDisplayName } from "@/lib/org-branding";

/** Cabeçalho `from` do Resend: "Nome <email@domínio>". */
export function buildResendFromForOrg(org: Organization, envFallback: string): string {
  const raw = org.branding?.emailFrom?.trim();
  if (!raw) return envFallback;
  const name = resolvePlatformDisplayName(org.branding, org.name);
  return `${name} <${raw}>`;
}
