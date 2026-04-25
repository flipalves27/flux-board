const LOCALE_PREFIX_RE = /^\/(pt-BR|en)(?=\/|$)/;

export function normalizeAppPath(pathname: string): string {
  return pathname.replace(LOCALE_PREFIX_RE, "") || "/";
}

export function isPublicPath(normalizedPath: string): boolean {
  return (
    normalizedPath === "/" ||
    normalizedPath === "/login" ||
    normalizedPath === "/onboarding" ||
    normalizedPath === "/onboarding-org" ||
    normalizedPath === "/onboarding-invites" ||
    normalizedPath.startsWith("/portal/") ||
    normalizedPath.startsWith("/forms/") ||
    normalizedPath.startsWith("/embed/")
  );
}

export function shouldRenderWorkspaceDock(normalizedPath: string): boolean {
  if (isPublicPath(normalizedPath)) return false;
  if (/^\/board\/[^/]+/.test(normalizedPath)) return false;
  return true;
}
