import jwt from "jsonwebtoken";
import { getJwtSecret } from "./jwt-secret";

export const PORTAL_COOKIE_NAME = "flux_portal_sess";

export function createPortalSessionToken(portalToken: string): string {
  return jwt.sign({ typ: "portal", t: portalToken }, getJwtSecret(), { expiresIn: "30d" });
}

export function verifyPortalSessionToken(cookieValue: string | undefined, portalToken: string): boolean {
  if (!cookieValue || !portalToken) return false;
  try {
    const p = jwt.verify(cookieValue, getJwtSecret()) as { typ?: string; t?: string };
    return p.typ === "portal" && p.t === portalToken;
  } catch {
    return false;
  }
}
