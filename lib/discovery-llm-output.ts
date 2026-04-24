import { safeJsonParse } from "@/lib/llm-utils";
import type { DiscoveryCardDraft, DiscoverySession } from "@/lib/kv-discovery-sessions";

const PRIORITIES = new Set(["Urgente", "Importante", "Média"]);

function flattenResponses(responses: Record<string, string> | null): string {
  if (!responses) return "";
  return Object.entries(responses)
    .map(([k, v]) => `### ${k}\n\n${String(v || "").trim()}`)
    .join("\n\n");
}

export function heuristicDiscoveryMarkdown(session: DiscoverySession, title: string): string {
  const body = flattenResponses(session.responses);
  return [
    `# ${title}`,
    "",
    "> Documento gerado automaticamente a partir das respostas da sessão de discovery (fallback sem IA).",
    "",
    "## Resumo executivo",
    "",
    body || "_Sem respostas registadas._",
    "",
    "## Problema e utilizadores",
    "",
    String(session.responses?.problema_contexto || "").trim() || "—",
    "",
    "## Necessidades e restrições",
    "",
    String(session.responses?.restricoes_prioridade || "").trim() || "—",
    "",
    "## Soluções discutidas",
    "",
    String(session.responses?.solucoes_imaginadas || "").trim() || "—",
    "",
    "## Riscos e dependências",
    "",
    "_Não inferidos no fallback — revisar com o respondente._",
    "",
    "## Roadmap sugerido (rascunho)",
    "",
    "1. Validar problema com dados quantitativos.",
    "2. Entrevistas curtas com utilizadores-alvo.",
    "3. Protótipo de baixa fidelidade e teste.",
    "",
  ].join("\n");
}

export function heuristicDiscoveryCardDrafts(session: DiscoverySession, firstBucket: string): DiscoveryCardDraft[] {
  const r = session.responses || {};
  const pairs: Array<{ title: string; body: string }> = [
    { title: "Problema e contexto", body: String(r.problema_contexto || "").trim() },
    { title: "Utilizadores-alvo", body: String(r.utilizadores_alvo || "").trim() },
    { title: "Dor atual", body: String(r.dor_atual || "").trim() },
    { title: "Soluções imaginadas", body: String(r.solucoes_imaginadas || "").trim() },
    { title: "Restrições e prioridade", body: String(r.restricoes_prioridade || "").trim() },
  ];
  const out: DiscoveryCardDraft[] = [];
  for (const p of pairs) {
    if (!p.body) continue;
    out.push({
      title: p.title.slice(0, 200),
      description: p.body.slice(0, 8000),
      bucketKey: firstBucket,
      priority: "Média",
      dueDate: null,
      tags: ["discovery-externo"],
    });
  }
  return out.slice(0, 20);
}

export function normalizeDiscoveryCardDrafts(
  drafts: unknown,
  bucketKeys: string[],
  defaultBucket: string
): DiscoveryCardDraft[] {
  const bucketSet = new Set(bucketKeys);
  const fallback = bucketSet.has(defaultBucket) ? defaultBucket : bucketKeys[0] || "backlog";
  if (!Array.isArray(drafts)) return [];

  const out: DiscoveryCardDraft[] = [];
  for (const raw of drafts.slice(0, 40)) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const title = String(o.title || "").trim().slice(0, 220);
    if (!title) continue;
    let bucketKey = String(o.bucketKey || "").trim();
    if (!bucketSet.has(bucketKey)) bucketKey = fallback;
    let priority = String(o.priority || "Média").trim();
    if (!PRIORITIES.has(priority)) priority = "Média";
    const dueRaw = o.dueDate;
    const dueDate =
      dueRaw === null || dueRaw === undefined || dueRaw === ""
        ? null
        : typeof dueRaw === "string"
          ? dueRaw.slice(0, 32)
          : null;
    const tags = Array.isArray(o.tags) ? o.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 12) : [];
    out.push({
      title,
      description: String(o.description || "").trim().slice(0, 8000),
      bucketKey,
      priority,
      dueDate,
      tags,
    });
  }
  return out;
}

export function parseDiscoveryLlmJson(text: string): { markdown: string; cards: unknown[] } | null {
  const parsed = safeJsonParse(String(text || ""));
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const markdown = String(o.markdown || "").trim();
  const cards = Array.isArray(o.cards) ? o.cards : [];
  if (!markdown && !cards.length) return null;
  return {
    markdown: markdown || "_Markdown vazio na resposta da IA._",
    cards,
  };
}
