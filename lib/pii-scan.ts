/**
 * Detecção heurística de PII / segredos para preview e export seguro (sem LLM).
 */

export type PiiFinding = {
  kind: "email" | "cpf_like" | "api_key" | "card_number" | "phone_br";
  start: number;
  end: number;
  label: string;
};

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const CPF_RE = /\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2}\b/g;
/** Chaves estilo sk- / Bearer em linha */
const API_KEY_RE = /\b(sk-[a-zA-Z0-9]{16,}|Bearer\s+[a-zA-Z0-9._-]{20,}|xox[baprs]-[a-zA-Z0-9-]{20,})\b/gi;
const PHONE_BR_RE = /\(\d{2}\)\s*\d{4,5}-?\d{4}\b/g;

function collect(re: RegExp, text: string, kind: PiiFinding["kind"], label: string): PiiFinding[] {
  const out: PiiFinding[] = [];
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  while ((m = r.exec(text)) !== null) {
    out.push({ kind, start: m.index, end: m.index + m[0].length, label });
  }
  return out;
}

export function scanPii(text: string): PiiFinding[] {
  const t = String(text ?? "");
  const findings: PiiFinding[] = [
    ...collect(EMAIL_RE, t, "email", "e-mail"),
    ...collect(CPF_RE, t, "cpf_like", "CPF-like"),
    ...collect(API_KEY_RE, t, "api_key", "token"),
    ...collect(PHONE_BR_RE, t, "phone_br", "telefone"),
  ];
  findings.sort((a, b) => a.start - b.start);
  return findings;
}

export type PiiRiskLevel = "low" | "medium" | "high";

export function piiRiskLevel(findings: PiiFinding[]): PiiRiskLevel {
  if (findings.length === 0) return "low";
  const hasKey = findings.some((f) => f.kind === "api_key");
  if (hasKey || findings.length >= 5) return "high";
  if (findings.length >= 2) return "medium";
  return "low";
}

/** Substitui trechos por [REDACTED:n] preservando comprimento aproximado para leitura. */
export function maskPii(text: string): { masked: string; findings: PiiFinding[] } {
  const findings = scanPii(text);
  if (!findings.length) return { masked: text, findings: [] };
  let out = "";
  let cursor = 0;
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i]!;
    if (f.start < cursor) continue;
    out += text.slice(cursor, f.start);
    out += `[REDACTED:${f.label}]`;
    cursor = f.end;
  }
  out += text.slice(cursor);
  return { masked: out, findings };
}
