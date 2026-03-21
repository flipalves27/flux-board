import dns from "node:dns/promises";

const PREFIX = "flux-verify=";

/** Verifica se existe registro TXT no hostname com `flux-verify=<token>`. */
export async function verifyFluxTxtRecord(hostname: string, token: string): Promise<boolean> {
  const host = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
  if (!host || !token) return false;

  try {
    const records = await dns.resolveTxt(host);
    const flat = records.flat().map((s) => String(s).trim());
    const needle = `${PREFIX}${token}`;
    return flat.some((line) => line === needle || line.includes(needle));
  } catch {
    return false;
  }
}
