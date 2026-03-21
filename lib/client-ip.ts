function normalizeIp(ip: string): string {
  const s = String(ip || "").trim();
  if (!s) return "unknown";
  return s.split(",")[0].split(":")[0] || "unknown";
}

export function getClientIpFromHeaders(headers: { get(name: string): string | null | undefined }): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return normalizeIp(xff);

  const cf = headers.get("cf-connecting-ip");
  if (cf) return normalizeIp(cf);

  const xr = headers.get("x-real-ip");
  if (xr) return normalizeIp(xr);

  return "unknown";
}
