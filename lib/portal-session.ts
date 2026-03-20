import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "seguradora-reborn-secret-change-in-production";

export const PORTAL_COOKIE_NAME = "flux_portal_sess";

export function createPortalSessionToken(portalToken: string): string {
  return jwt.sign({ typ: "portal", t: portalToken }, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyPortalSessionToken(cookieValue: string | undefined, portalToken: string): boolean {
  if (!cookieValue || !portalToken) return false;
  try {
    const p = jwt.verify(cookieValue, JWT_SECRET) as { typ?: string; t?: string };
    return p.typ === "portal" && p.t === portalToken;
  } catch {
    return false;
  }
}
