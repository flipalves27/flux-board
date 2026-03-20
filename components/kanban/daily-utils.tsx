"use client";

import type { DailyInsightEntry } from "@/app/board/[id]/page";

export type OrganizedContextSection = {
  title: string;
  items: string[];
  text: string;
};

export type DailyActionSuggestion = {
  titulo: string;
  descricao: string;
  prioridade: string;
  progresso: string;
  coluna: string;
  tags: string[];
  dataConclusao: string;
  direcionamento: string;
};

export type DailyCreateSuggestion = {
  titulo: string;
  descricao: string;
  prioridade: string;
  progresso: string;
  coluna: string;
  tags: string[];
  dataConclusao: string;
  direcionamento: string;
};

function stripMarkdownDecorations(input: string): string {
  return String(input || "")
    .replace(/\r/g, "\n")
    // Remove common markdown bold/italic markers.
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    // Remove leading bullet-ish markers that can leak into text.
    .replace(/^\s*[-•]\s+/g, "")
    .trim();
}

function parseOrganizedContext(raw: string): OrganizedContextSection[] {
  const text = String(raw || "").replace(/\r/g, "\n").trim();
  if (!text) return [];

  const lines = text
    .split("\n")
    .map((l) => String(l ?? "").trim())
    .filter(Boolean)
    .filter((l) => !l.startsWith("```"))
    .slice(0, 250);

  const sections: OrganizedContextSection[] = [];
  let current: OrganizedContextSection | null = null;

  const pushCurrent = () => {
    if (!current) return;
    const title = stripMarkdownDecorations(current.title || "").replace(/:\s*$/g, "").trim();
    const items = current.items.map((x) => stripMarkdownDecorations(x)).filter(Boolean);
    const sectionText = stripMarkdownDecorations(current.text || "");
    const hasContent = items.length > 0 || sectionText.length > 0;
    if (title && hasContent) sections.push({ title, items, text: sectionText });
    current = null;
  };

  const isHeading = (line: string): string | null => {
    const t = line.trim();
    if (!t) return null;

    // Example: **Resumo:** or **Cards em Andamento:**
    const boldHeading = t.match(/^\*{2,}\s*([^*]+?)\s*\*{2,}\s*:?\s*$/);
    if (boldHeading?.[1]) return boldHeading[1];

    // Example: ## Título
    const hashHeading = t.match(/^#{1,3}\s*(.+?)\s*$/);
    if (hashHeading?.[1]) return hashHeading[1];

    // Example: Resumo executivo:
    // Keep this conservative to avoid treating sentences with colons as headings.
    if (t.length <= 70) {
      const plainHeading = t.match(/^([^:]{2,70}?)\s*:\s*$/);
      if (plainHeading?.[1]) return plainHeading[1];
    }

    // Example: "Resumo" alone on its own line.
    if (t.length <= 70 && !t.startsWith("-") && !t.startsWith("•") && !/^[0-9]+[.)]\s+/.test(t)) {
      const looksLikeShortLabel = /^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s-]+$/.test(t) && !t.includes("http");
      if (looksLikeShortLabel && !t.includes(",")) return t;
    }

    return null;
  };

  const bulletItem = (line: string): string | null => {
    const t = line.trim();
    const bullet = t.match(/^[-•*]\s+(.*)$/);
    if (bullet?.[1]) return bullet[1];
    const numbered = t.match(/^\d+[.)]\s+(.*)$/);
    if (numbered?.[1]) return numbered[1];
    return null;
  };

  for (const rawLine of lines) {
    const heading = isHeading(rawLine);
    if (heading) {
      pushCurrent();
      current = { title: heading, items: [], text: "" };
      continue;
    }

    const item = bulletItem(rawLine);
    if (item) {
      if (!current) current = { title: "Conteúdo organizado", items: [], text: "" };
      current.items.push(stripMarkdownDecorations(item));
      continue;
    }

    if (!current) current = { title: "Conteúdo organizado", items: [], text: "" };

    // If we already have items, treat non-bullet lines as a continuation of the previous item.
    if (current.items.length > 0) {
      const prevIdx = current.items.length - 1;
      current.items[prevIdx] = `${current.items[prevIdx]} ${stripMarkdownDecorations(rawLine)}`.trim();
    } else {
      current.text = `${current.text}${current.text ? "\n" : ""}${stripMarkdownDecorations(rawLine)}`.trim();
    }
  }

  pushCurrent();

  // Fallback: if parsing produced nothing usable, return a single section.
  if (!sections.length) {
    return [{ title: "Conteúdo organizado", items: [], text: text.slice(0, 4000) }];
  }

  // Avoid rendering unbounded sections.
  return sections.slice(0, 6);
}

function sanitizeJsonCandidateForClient(value: string): string {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    // Remove comments that can leak from LLM responses.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    // Remove trailing commas in objects/arrays.
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function extractBalancedJsonObjectForClient(value: string): string | null {
  const input = String(value || "");
  const start = input.indexOf("{");
  if (start < 0) return null;

  let inString = false;
  let escaped = false;
  let depth = 0;

  for (let i = start; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return input.slice(start, i + 1).trim();
    }
  }

  return null;
}

function tryParseJsonFromRawForClient(raw: string): unknown | null {
  const input = String(raw || "").trim();
  if (!input) return null;

  const fencedMatch = input.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    const candidate = sanitizeJsonCandidateForClient(fencedMatch[1].trim());
    try {
      return JSON.parse(candidate);
    } catch {
      // ignore
    }
  }

  try {
    return JSON.parse(sanitizeJsonCandidateForClient(input));
  } catch {
    // ignore
  }

  const balanced = extractBalancedJsonObjectForClient(input);
  if (!balanced) return null;

  try {
    return JSON.parse(sanitizeJsonCandidateForClient(balanced));
  } catch {
    return null;
  }
}

export function renderOrganizedContext(raw: string) {
  const rawText = String(raw || "");

  // Sometimes the LLM puts a JSON blob inside `contextoOrganizado` (often wrapped in ```json ... ```).
  // In that case, try to extract the inner `contextoOrganizado` text; otherwise, pretty-print JSON.
  const parsed = tryParseJsonFromRawForClient(rawText);
  if (parsed && typeof parsed === "object" && parsed !== null) {
    const rec = parsed as Record<string, unknown>;
    const nested = rec.contextoOrganizado;
    if (typeof nested === "string" && nested.trim()) {
      const sections = parseOrganizedContext(nested);
      if (sections.length) {
        return (
          <div className="space-y-2">
            {sections.map((section, idx) => (
              <div key={`${section.title}-${idx}`} className="space-y-1">
                <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)]">
                  {section.title}
                </div>
                {section.items.length ? (
                  <ul className="list-disc pl-4 space-y-1">
                    {section.items.map((it, i) => (
                      <li key={`${idx}-${i}`} className="text-xs text-[var(--flux-text)] leading-relaxed">
                        {it}
                      </li>
                    ))}
                  </ul>
                ) : section.text ? (
                  <p className="text-xs text-[var(--flux-text)] whitespace-pre-line leading-relaxed">{section.text}</p>
                ) : (
                  <p className="text-xs text-[var(--flux-text-muted)]">Sem itens.</p>
                )}
              </div>
            ))}
          </div>
        );
      }
    }

    // Render JSON directly (pretty) to avoid the UI breaking on unstructured blobs.
    try {
      const pretty = JSON.stringify(rec, null, 2);
      if (pretty.trim()) {
        return (
          <pre className="text-xs text-[var(--flux-text)] whitespace-pre-wrap break-words leading-relaxed">
            {pretty.slice(0, 12000)}
          </pre>
        );
      }
    } catch {
      // ignore
    }
  }

  const sections = parseOrganizedContext(rawText);
  if (!sections.length) {
    return <p className="text-xs text-[var(--flux-text-muted)]">Sem contexto organizado para este resumo.</p>;
  }

  return (
    <div className="space-y-2">
      {sections.map((section, idx) => (
        <div key={`${section.title}-${idx}`} className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)]">{section.title}</div>
          {section.items.length ? (
            <ul className="list-disc pl-4 space-y-1">
              {section.items.map((it, i) => (
                <li key={`${idx}-${i}`} className="text-xs text-[var(--flux-text)] leading-relaxed">
                  {it}
                </li>
              ))}
            </ul>
          ) : section.text ? (
            <p className="text-xs text-[var(--flux-text)] whitespace-pre-line leading-relaxed">{section.text}</p>
          ) : (
            <p className="text-xs text-[var(--flux-text-muted)]">Sem itens.</p>
          )}
        </div>
      ))}
    </div>
  );
}

function normDailyPrio(value: string | undefined): string {
  const v = String(value || "").trim().toLowerCase();
  if (v === "urgente") return "Urgente";
  if (v === "importante") return "Importante";
  return "Média";
}

function normDailyProg(value: string | undefined): string {
  const v = String(value || "").trim().toLowerCase();
  if (v === "em andamento") return "Em andamento";
  if (v === "concluída" || v === "concluida") return "Concluída";
  return "Não iniciado";
}

export function getDailyActionSuggestions(rawValue?: unknown): DailyActionSuggestion[] {
  const list = Array.isArray(rawValue) ? rawValue : [];
  return list
    .map((item) => {
      if (!item) return null;

      if (item && typeof item === "object") {
        const rec = item as {
          titulo?: string;
          title?: string;
          descricao?: string;
          detalhes?: string;
          prioridade?: string;
          progresso?: string;
          coluna?: string;
          tags?: string[];
          dataConclusao?: string;
          direcionamento?: string;
        };

        const titulo = String(rec?.titulo || rec?.title || "").trim();
        if (!titulo) return null;

        return {
          titulo,
          descricao: String(rec?.descricao || rec?.detalhes || "").trim(),
          prioridade: normDailyPrio(rec?.prioridade),
          progresso: normDailyProg(rec?.progresso),
          coluna: String(rec?.coluna || "").trim(),
          tags: Array.isArray(rec?.tags)
            ? rec.tags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 6)
            : [],
          dataConclusao: String(rec?.dataConclusao || "").trim(),
          direcionamento: String(rec?.direcionamento || "").trim().toLowerCase(),
        } satisfies DailyActionSuggestion;
      }

      const titulo = String(item || "").trim();
      if (!titulo) return null;
      return {
        titulo,
        descricao: "",
        prioridade: "Média",
        progresso: "Não iniciado",
        coluna: "",
        tags: [],
        dataConclusao: "",
        direcionamento: "",
      } satisfies DailyActionSuggestion;
    })
    .filter(Boolean) as DailyActionSuggestion[];
}

export function getDailyCreateSuggestions(entry?: DailyInsightEntry): DailyCreateSuggestion[] {
  const insight = entry?.insight;
  if (!insight) return [];

  const detailed = Array.isArray(insight.criarDetalhes)
    ? insight.criarDetalhes
        .map((item) => {
          const titulo = String(item?.titulo || "").trim();
          if (!titulo) return null;
          return {
            titulo,
            descricao: String(item?.descricao || "").trim(),
            prioridade: normDailyPrio(item?.prioridade),
            progresso: normDailyProg(item?.progresso),
            coluna: String(item?.coluna || "").trim(),
            tags: Array.isArray(item?.tags)
              ? item.tags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 6)
              : [],
            dataConclusao: String(item?.dataConclusao || "").trim(),
            direcionamento: String(item?.direcionamento || "").trim().toLowerCase(),
          } satisfies DailyCreateSuggestion;
        })
        .filter(Boolean) as Array<DailyCreateSuggestion>
    : [];

  if (detailed.length > 0) return detailed;

  const fallback = Array.isArray(insight.criar) ? insight.criar : [];
  return fallback
    .map((txt) => {
      const titulo =
        txt && typeof txt === "object"
          ? String((txt as { titulo?: string; title?: string })?.titulo || (txt as { titulo?: string; title?: string })?.title || "").trim()
          : String(txt || "").trim();
      if (!titulo) return null;
      return {
        titulo,
        descricao: "Detalhar escopo, impacto esperado e critérios de aceite.",
        prioridade: "Média",
        progresso: "Não iniciado",
        coluna: "",
        tags: [],
        dataConclusao: "",
        direcionamento: "",
      } satisfies DailyCreateSuggestion;
    })
    .filter(Boolean) as DailyCreateSuggestion[];
}

