import { createHmac, timingSafeEqual } from "node:crypto";

const VERSION = "v0";

export type SlackVerifyOptions = {
  signingSecret: string;
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  /** Slack recomenda rejeitar requisições muito antigas (replay). Default 5 min. */
  maxSkewSec?: number;
};

/**
 * Verifica assinatura de requisição Slack (slash commands, events API).
 * @see https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackRequestSignature(opts: SlackVerifyOptions): boolean {
  const { signingSecret, rawBody, timestampHeader, signatureHeader, maxSkewSec = 60 * 5 } = opts;
  if (!timestampHeader || !signatureHeader) return false;
  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts) || ts < 0) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > maxSkewSec) return false;

  const base = `${VERSION}:${timestampHeader}:${rawBody}`;
  const hmac = createHmac("sha256", signingSecret).update(base).digest("hex");
  const expected = `${VERSION}=${hmac}`;
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signatureHeader, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
