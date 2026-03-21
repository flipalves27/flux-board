/**
 * Permite HTTPS em qualquer host; HTTP apenas para localhost (dev / Zapier test).
 */
export function assertWebhookUrlAllowed(urlStr: string): void {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    throw new Error("URL inválida.");
  }
  if (u.protocol === "https:") return;
  if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return;
  throw new Error("A URL do webhook deve usar HTTPS (HTTP permitido apenas para localhost).");
}
