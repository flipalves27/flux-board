import type {
  ReleaseChangeKind,
  ReleaseChangelogEntry,
  ReleaseData,
  ReleaseRisk,
  ReleaseVersionType,
} from "./schemas";

/**
 * Release AI: changelog heuristics, semver bump suggester, health score
 * and markdown release-notes generator. Runs fully offline (heurístico)
 * e pode ser substituído por uma camada LLM futuramente — a assinatura
 * é estável.
 */

export type CardLike = {
  id: string;
  title?: string;
  type?: string;
  priority?: string;
  labels?: string[];
  description?: string;
  severity?: string;
};

const KIND_KEYWORDS: Record<ReleaseChangeKind, RegExp[]> = {
  breaking: [/\bbreaking\b/i, /\b!:/i, /\bmigração\b/i, /\bincompat/i],
  feat: [/\bfeat\b/i, /\bfeature\b/i, /\bnew\b/i, /\bnovo\b/i, /\bnova\b/i, /\badiciona\b/i, /\bimplementa\b/i],
  fix: [/\bfix\b/i, /\bbug\b/i, /\bcorreç/i, /\bcorrige\b/i, /\bhotfix\b/i, /\berror\b/i],
  perf: [/\bperf\b/i, /\bperformance\b/i, /\bperformance\b/i, /\bspeed\b/i, /\botimiz/i, /\bperfor/i],
  refactor: [/\brefactor\b/i, /\brefato/i, /\bcleanup\b/i],
  docs: [/\bdocs?\b/i, /\bdocumentaç/i, /\breadme\b/i],
  chore: [/\bchore\b/i, /\bbuild\b/i, /\bci\b/i, /\bdeps?\b/i],
};

function detectKindFromText(text: string): ReleaseChangeKind {
  if (!text) return "chore";
  for (const kind of ["breaking", "feat", "fix", "perf", "refactor", "docs", "chore"] as ReleaseChangeKind[]) {
    for (const re of KIND_KEYWORDS[kind]) {
      if (re.test(text)) return kind;
    }
  }
  return "chore";
}

export function classifyCard(card: CardLike): ReleaseChangeKind {
  const haystack = [card.type ?? "", card.title ?? "", card.description ?? "", (card.labels ?? []).join(" ")].join(" ");
  if (card.type) {
    const t = card.type.toLowerCase();
    if (t.includes("bug") || t.includes("fix") || t.includes("incident")) return "fix";
    if (t.includes("feature") || t.includes("story")) return "feat";
    if (t.includes("spike") || t.includes("chore") || t.includes("task")) return "chore";
    if (t.includes("breaking")) return "breaking";
  }
  return detectKindFromText(haystack);
}

export function buildChangelogFromCards(cards: CardLike[]): ReleaseChangelogEntry[] {
  return cards
    .filter((c) => c && typeof c.id === "string")
    .map<ReleaseChangelogEntry>((c) => ({
      kind: classifyCard(c),
      title: (c.title ?? c.id).trim().slice(0, 240),
      cardId: c.id,
      authorId: null,
    }));
}

/**
 * Suggest semver bump. Regras:
 * - Qualquer "breaking" → major
 * - Alguma "feat" → minor
 * - Somente "fix"/"perf" → patch
 * - Severidade crítica declarada nos cards ou tag "hotfix" → hotfix
 */
export function suggestVersionType(
  changelog: ReleaseChangelogEntry[],
  options: { tags?: string[]; hasCriticalIncident?: boolean } = {}
): ReleaseVersionType {
  if (options.hasCriticalIncident || (options.tags ?? []).some((t) => /hotfix/i.test(t))) return "hotfix";
  if (changelog.some((c) => c.kind === "breaking")) return "major";
  if (changelog.some((c) => c.kind === "feat")) return "minor";
  if (changelog.length > 0) return "patch";
  return "patch";
}

function parseSemver(version: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function bumpSemver(current: string, kind: ReleaseVersionType): string {
  const parsed = parseSemver(current) ?? [0, 1, 0];
  let [major, minor, patch] = parsed;
  switch (kind) {
    case "major":
      major += 1;
      minor = 0;
      patch = 0;
      break;
    case "minor":
      minor += 1;
      patch = 0;
      break;
    case "patch":
    case "hotfix":
      patch += 1;
      break;
  }
  return `${major}.${minor}.${patch}`;
}

/**
 * Health score 0–100 baseado em sinais da sprint/release.
 * - Mais breaking/fixes → score menor
 * - Riscos "high/critical" → penalidade
 * - Poucos itens → score alto
 */
export function computeHealthScore(params: {
  changelog: ReleaseChangelogEntry[];
  risks: ReleaseRisk[];
  sprintVelocity?: number | null;
  commitmentRatio?: number | null;
}): number {
  const { changelog, risks, commitmentRatio } = params;
  let score = 82;
  const breakingCount = changelog.filter((c) => c.kind === "breaking").length;
  const fixCount = changelog.filter((c) => c.kind === "fix").length;
  const featCount = changelog.filter((c) => c.kind === "feat").length;

  score -= breakingCount * 12;
  score -= fixCount * 2;
  score += Math.min(featCount * 2, 10);

  for (const r of risks) {
    if (r.severity === "critical") score -= 18;
    else if (r.severity === "high") score -= 10;
    else if (r.severity === "medium") score -= 4;
    else score -= 1;
  }

  if (typeof commitmentRatio === "number") {
    const pct = Math.max(0, Math.min(1, commitmentRatio));
    score += (pct - 0.7) * 20;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

const KIND_LABEL_PT: Record<ReleaseChangeKind, string> = {
  feat: "✨ Novidades",
  fix: "🐞 Correções",
  perf: "⚡ Performance",
  refactor: "♻️ Refatorações",
  breaking: "💥 Mudanças incompatíveis",
  docs: "📚 Documentação",
  chore: "🧰 Manutenção",
};

const KIND_LABEL_EN: Record<ReleaseChangeKind, string> = {
  feat: "✨ Features",
  fix: "🐞 Fixes",
  perf: "⚡ Performance",
  refactor: "♻️ Refactors",
  breaking: "💥 Breaking changes",
  docs: "📚 Documentation",
  chore: "🧰 Chores",
};

const KIND_ORDER: ReleaseChangeKind[] = [
  "breaking",
  "feat",
  "fix",
  "perf",
  "refactor",
  "docs",
  "chore",
];

export type ReleaseNotesOptions = {
  locale?: "pt-BR" | "en";
  voice?: "concise" | "marketing" | "technical";
  includeCardRefs?: boolean;
};

/**
 * Generate markdown release notes. Heurístico, sem dependência de rede.
 * Agrupado por tipo, com saudação e resumo derivado.
 */
export function generateMarkdownReleaseNotes(
  release: Pick<ReleaseData, "name" | "version" | "summary" | "environment" | "versionType"> & {
    changelog: ReleaseChangelogEntry[];
    risks?: ReleaseRisk[];
  },
  options: ReleaseNotesOptions = {}
): string {
  const locale = options.locale ?? "pt-BR";
  const labels = locale === "en" ? KIND_LABEL_EN : KIND_LABEL_PT;
  const voice = options.voice ?? "concise";

  const grouped = new Map<ReleaseChangeKind, ReleaseChangelogEntry[]>();
  for (const entry of release.changelog ?? []) {
    const arr = grouped.get(entry.kind) ?? [];
    arr.push(entry);
    grouped.set(entry.kind, arr);
  }

  const lines: string[] = [];
  lines.push(`# ${release.name} · v${release.version}`);
  if (release.summary) lines.push("", release.summary);
  if (voice === "marketing") {
    lines.push(
      "",
      locale === "en"
        ? "_This release pushes the product forward with focused improvements and polish._"
        : "_Esta release avança o produto com melhorias focadas e polimento._"
    );
  }

  for (const kind of KIND_ORDER) {
    const entries = grouped.get(kind);
    if (!entries || entries.length === 0) continue;
    lines.push("", `## ${labels[kind]}`);
    for (const e of entries) {
      const ref = options.includeCardRefs && e.cardId ? ` _(#${e.cardId})_` : "";
      lines.push(`- ${e.title}${ref}`);
    }
  }

  if (release.risks && release.risks.length > 0) {
    lines.push("", locale === "en" ? "## ⚠️ Risks to monitor" : "## ⚠️ Riscos a monitorar");
    for (const r of release.risks) {
      const sev = r.severity.toUpperCase();
      const mit = r.mitigation ? ` — ${r.mitigation}` : "";
      lines.push(`- **[${sev}]** ${r.title}${mit}`);
    }
  }

  lines.push("", locale === "en" ? `_Environment: ${release.environment}_` : `_Ambiente: ${release.environment}_`);
  return lines.join("\n");
}
