import net from "node:net";
import { lookup } from "node:dns/promises";

/**
 * URL de webhook bloqueada (SSRF / protocolo inválido). Usado na entrega para falhar sem retries longos.
 */
export class WebhookUrlBlockedError extends Error {
  readonly code = "WEBHOOK_URL_BLOCKED" as const;
  constructor(message: string) {
    super(message);
    this.name = "WebhookUrlBlockedError";
  }
}

const BLOCKED_HOSTNAMES = new Set(
  [
    "metadata.google.internal",
    "metadata.goog",
    "metadata",
    "169.254.169.254",
  ].map((h) => h.toLowerCase())
);

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

function isLoopbackHostname(hostname: string): boolean {
  const h = normalizeHostname(hostname);
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

/** IPv4 ou IPv6 textual (sem brackets). */
function isNonPublicAddress(addr: string): boolean {
  const raw = addr.replace(/^\[|\]$/g, "");
  const v = net.isIP(raw);
  if (v === 4) return !isPublicIpv4(raw);
  if (v === 6) return !isPublicIpv6(raw);
  return true;
}

function isPublicIpv4(ip: string): boolean {
  const parts = ip.split(".").map((x) => Number(x));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 127) return false;
  if (a === 0) return false;
  if (a === 169 && b === 254) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 255 && b === 255 && parts[2] === 255 && parts[3] === 255) return false;
  return true;
}

function isPublicIpv6(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (s === "::1") return false;
  if (s.startsWith("fe80:")) return false;
  if (s.startsWith("fc") || s.startsWith("fd")) return false;
  if (s.startsWith("ff")) return false;
  const mapped = s.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPublicIpv4(mapped[1]);
  if (s === "::") return false;
  return true;
}

function assertHostnameNotBlocked(hostname: string): void {
  const h = normalizeHostname(hostname);
  if (BLOCKED_HOSTNAMES.has(h)) {
    throw new WebhookUrlBlockedError("Hostname não permitido para URL de webhook.");
  }
}

/**
 * HTTPS em qualquer host público; HTTP apenas para localhost (dev / testes locais).
 * Rejeita IPs privados/reservados em literais e hostnames bloqueados (SSRF superficial).
 */
export function assertWebhookUrlAllowed(urlStr: string): void {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    throw new WebhookUrlBlockedError("URL inválida.");
  }

  if (u.username || u.password) {
    throw new WebhookUrlBlockedError("URL do webhook não pode incluir credenciais no utilizador/palavra-passe.");
  }

  const hostname = u.hostname;
  assertHostnameNotBlocked(hostname);

  const hostNorm = normalizeHostname(hostname);
  const rawIp = hostNorm.replace(/^\[|\]$/g, "");
  const ipKind = net.isIP(rawIp);

  if (u.protocol === "http:" && isLoopbackHostname(hostname)) {
    return;
  }

  if (ipKind === 4 || ipKind === 6) {
    if (isNonPublicAddress(rawIp)) {
      throw new WebhookUrlBlockedError("A URL do webhook não pode usar endereço IP privado ou reservado.");
    }
  }

  if (u.protocol === "https:") return;
  throw new WebhookUrlBlockedError("A URL do webhook deve usar HTTPS (HTTP permitido apenas para localhost).");
}

/**
 * URL validada + endereços para `connect` sem nova resolução DNS do hostname (mitiga DNS rebinding).
 * IPv4 primeiro, depois IPv6, para ordem estável entre tentativas.
 */
export type WebhookConnectTargets = {
  url: URL;
  connectAddresses: string[];
};

/**
 * Resolve DNS (quando aplicável), valida IPs públicos e devolve destinos fixos para a ligação HTTP(S).
 */
export async function getValidatedWebhookConnectTargets(urlStr: string): Promise<WebhookConnectTargets> {
  assertWebhookUrlAllowed(urlStr);
  const u = new URL(urlStr);
  const hostNorm = normalizeHostname(u.hostname);
  const rawIp = hostNorm.replace(/^\[|\]$/g, "");
  const ipKind = net.isIP(rawIp);

  if (ipKind === 4 || ipKind === 6) {
    return { url: u, connectAddresses: [rawIp] };
  }

  if (isLoopbackHostname(hostNorm)) {
    if (hostNorm === "::1") {
      return { url: u, connectAddresses: ["::1"] };
    }
    if (hostNorm === "127.0.0.1") {
      return { url: u, connectAddresses: ["127.0.0.1"] };
    }
    return { url: u, connectAddresses: ["127.0.0.1", "::1"] };
  }

  let results: { address: string; family: number }[];
  try {
    results = await lookup(u.hostname, { all: true, verbatim: true });
  } catch {
    throw new WebhookUrlBlockedError("Não foi possível resolver o hostname do webhook.");
  }

  if (!results.length) {
    throw new WebhookUrlBlockedError("Hostname do webhook sem endereços DNS.");
  }

  const addrs = results.map((r) => r.address.replace(/^\[|\]$/g, ""));
  for (const address of addrs) {
    if (isNonPublicAddress(address)) {
      throw new WebhookUrlBlockedError(
        "A URL do webhook não pode resolver para endereços privados ou reservados (SSRF)."
      );
    }
  }

  addrs.sort((a, b) => {
    const ka = net.isIP(a) === 4 ? 0 : 1;
    const kb = net.isIP(b) === 4 ? 0 : 1;
    if (ka !== kb) return ka - kb;
    return a.localeCompare(b);
  });

  return { url: u, connectAddresses: addrs };
}

/**
 * Resolve DNS e garante que nenhum endereço A/AAAA é privado/reservado.
 * Usado na criação/edição da subscription; a entrega deve usar `getValidatedWebhookConnectTargets` + cliente fixado.
 */
export async function assertWebhookUrlResolvesSafely(urlStr: string): Promise<void> {
  await getValidatedWebhookConnectTargets(urlStr);
}
