/** Query param appended after login/register/OAuth when a org invite was accepted (client shows toast). */
export const JOINED_VIA_INVITE_QUERY = "joinedViaInvite";

export function appendJoinedViaInviteQuery(path: string): string {
  const [base, ...hashParts] = path.split("#");
  const hash = hashParts.length ? hashParts.join("#") : "";
  const sep = base.includes("?") ? "&" : "?";
  const next = `${base}${sep}${JOINED_VIA_INVITE_QUERY}=1${hash ? `#${hash}` : ""}`;
  return next;
}
