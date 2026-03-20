import { sanitizeText } from "@/lib/schemas";

export type IntakeFormConfig = {
  enabled: boolean;
  slug: string;
  title: string;
  description?: string;
  targetBucketKey: string;
  defaultPriority: string;
  defaultProgress: string;
  defaultTags: string[];
};

export type IntakeClassifierInput = {
  title: string;
  description: string;
};

export type IntakeClassifierOutput = {
  bucketKey?: string;
  priority?: string;
  tags: string[];
  rationale: string;
};

const TAG_RULES: Array<{ tag: string; keywords: string[] }> = [
  { tag: "Incidente", keywords: ["incidente", "erro", "falha", "bug", "fora do ar", "indisponivel"] },
  { tag: "Comercial", keywords: ["comercial", "cliente", "proposta", "venda"] },
  { tag: "Corretor", keywords: ["corretor", "broker"] },
  { tag: "Subscrição", keywords: ["subscricao", "subscrição", "tomador", "garantia"] },
  { tag: "Reborn", keywords: ["reborn", "plataforma"] },
];

function normalizeText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function normalizeFormSlug(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export function classifyIntake(input: IntakeClassifierInput): IntakeClassifierOutput {
  const title = normalizeText(sanitizeText(input.title || ""));
  const description = normalizeText(sanitizeText(input.description || ""));
  const fullText = `${title} ${description}`.trim();
  const tags = new Set<string>();

  for (const rule of TAG_RULES) {
    if (rule.keywords.some((k) => fullText.includes(normalizeText(k)))) {
      tags.add(rule.tag);
    }
  }

  let priority: string | undefined;
  let bucketKey: string | undefined;
  let rationale = "Classificação padrão aplicada.";

  const urgentHit = /(urgente|bloqueado|parado|prazo hoje|hoje|critico|crítico)/.test(fullText);
  const incidentHit = /(incidente|erro|falha|fora do ar|indisponivel|indisponível)/.test(fullText);

  if (incidentHit) {
    bucketKey = "Incidente";
    priority = urgentHit ? "Urgente" : "Importante";
    tags.add("Incidente");
    rationale = "Classificado como incidente com base em palavras-chave.";
  } else if (urgentHit) {
    priority = "Urgente";
    rationale = "Classificado como urgente por sinais de criticidade/prazo.";
  }

  return {
    bucketKey,
    priority,
    tags: [...tags].slice(0, 8),
    rationale,
  };
}
