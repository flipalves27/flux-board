type DescriptionBlockDef = {
  key: string;
  label: string;
  placeholder: string;
};

export const DESCRIPTION_BLOCKS: DescriptionBlockDef[] = [
  {
    key: "businessContext",
    label: "Contexto/Negocio",
    placeholder: "Situacao atual, problema de negocio e impacto.",
  },
  {
    key: "objective",
    label: "Objetivo",
    placeholder: "Resultado esperado e valor que queremos gerar.",
  },
  {
    key: "scope",
    label: "Escopo",
    placeholder: "O que entra e o que nao entra nesta entrega.",
  },
  {
    key: "successCriteria",
    label: "Criterios de Sucesso",
    placeholder: "Como vamos validar que deu certo.",
  },
  {
    key: "notes",
    label: "Observacoes",
    placeholder: "Dependencias, riscos e informacoes complementares.",
  },
];

export type DescriptionBlocksState = Record<string, string>;

const labelToKeyMap = new Map(
  DESCRIPTION_BLOCKS.map((block) => [normalizeLabel(block.label), block.key]),
);

const headingAliasesByKey: Record<string, string[]> = {
  businessContext: [
    "contexto/negocio",
    "contexto de negocio",
    "contexto negocio",
    "contexto",
    "cenario atual",
    "resumo de negocio",
  ],
  objective: [
    "objetivo",
    "objetivo principal",
    "resultado esperado",
  ],
  scope: [
    "escopo",
    "escopo da entrega",
    "o que sera feito",
    "o que entra",
    "fora de escopo",
  ],
  successCriteria: [
    "criterios de sucesso",
    "criterios de pronto",
    "criterios de aceite",
    "criterios de aceitacao",
    "aceite",
  ],
  notes: [
    "observacoes",
    "premissas",
    "dependencias",
    "riscos",
    "premissas/dependencias/riscos",
    "informacoes complementares",
  ],
};

function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeadingForMatch(value: string): string {
  return normalizeLabel(value)
    .replace(/^\s*(?:\d+\s*[.)-]\s*)+/, " ")
    .replace(/^\s*(?:secao|seção)\s+\d+\s*/i, " ")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveHeadingKey(rawHeading: string): string | null {
  const heading = normalizeHeadingForMatch(rawHeading);
  if (!heading) return null;

  const direct = labelToKeyMap.get(heading);
  if (direct) return direct;

  for (const [key, aliases] of Object.entries(headingAliasesByKey)) {
    const hasMatch = aliases.some((alias) => {
      const normalizedAlias = normalizeHeadingForMatch(alias);
      return heading === normalizedAlias || heading.startsWith(`${normalizedAlias} `) || heading.includes(normalizedAlias);
    });
    if (hasMatch) return key;
  }

  if (heading.startsWith("contexto")) return "businessContext";
  if (heading.startsWith("objetivo")) return "objective";
  if (heading.startsWith("escopo")) return "scope";
  if (heading.includes("criterio")) return "successCriteria";
  if (heading.includes("observa") || heading.includes("premissa") || heading.includes("dependencia") || heading.includes("risco")) {
    return "notes";
  }

  return null;
}

function isLikelySectionHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // Evita interpretar itens de lista com ":" como cabeçalho de bloco.
  if (/^([-*+]|>\s*)\s+/.test(trimmed)) return false;

  const headingPart = trimmed.split(":")[0]?.trim() || "";
  if (!headingPart) return false;
  if (headingPart.length > 80) return false;
  if (headingPart.split(/\s+/).length > 8) return false;

  return true;
}

function hasMeaningfulContent(value: string): boolean {
  return /\S/.test(value);
}

export function createEmptyDescriptionBlocks(): DescriptionBlocksState {
  return DESCRIPTION_BLOCKS.reduce<DescriptionBlocksState>((acc, block) => {
    acc[block.key] = "";
    return acc;
  }, {});
}

export function parseDescriptionToBlocks(rawDescription: string | null | undefined): DescriptionBlocksState {
  const text = String(rawDescription || "").trim();
  const blocks = createEmptyDescriptionBlocks();
  if (!text || text === "Sem descrição.") return blocks;

  const lines = text.split(/\r?\n/);
  let currentKey: string | null = null;
  let hasStructuredContent = false;

  for (const line of lines) {
    const headingMatch = line.match(/^([^:]+):(.*)$/);
    if (headingMatch && isLikelySectionHeading(line)) {
      const headingLabel = headingMatch[1].replace(/^\s*(?:\d+\s*[.)-]\s*)+/, "").trim();
      const matchedKey = resolveHeadingKey(headingLabel);
      if (matchedKey) {
        currentKey = matchedKey;
        hasStructuredContent = true;
        const firstLine = headingMatch[2].replace(/^\s/, "");
        if (firstLine.trim()) {
          blocks[matchedKey] = blocks[matchedKey]
            ? `${blocks[matchedKey]}\n${firstLine}`
            : firstLine;
        }
        continue;
      }
    }

    if (!line.trim()) {
      if (currentKey && blocks[currentKey]) {
        blocks[currentKey] = `${blocks[currentKey]}\n`;
      }
      continue;
    }

    if (currentKey) {
      blocks[currentKey] = blocks[currentKey]
        ? `${blocks[currentKey]}\n${line}`
        : line;
    } else {
      blocks.businessContext = blocks.businessContext
        ? `${blocks.businessContext}\n${line}`
        : line;
    }
  }

  if (!hasStructuredContent && !blocks.businessContext.trim()) {
    blocks.businessContext = text;
  }

  return blocks;
}

export function serializeDescriptionBlocks(blocks: DescriptionBlocksState): string {
  const sections = DESCRIPTION_BLOCKS
    .map((block) => {
      const value = String(blocks[block.key] || "");
      if (!hasMeaningfulContent(value)) return "";
      return `${block.label}:\n${value}`;
    })
    .filter(Boolean);

  return sections.join("\n\n").trim();
}
