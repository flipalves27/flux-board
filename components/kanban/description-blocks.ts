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

function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
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
    const headingMatch = line.match(/^([^:]+):\s*(.*)$/);
    if (headingMatch) {
      const heading = normalizeLabel(headingMatch[1]);
      const matchedKey = labelToKeyMap.get(heading);
      if (matchedKey) {
        currentKey = matchedKey;
        hasStructuredContent = true;
        const firstLine = headingMatch[2].trim();
        if (firstLine) {
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
      const value = String(blocks[block.key] || "").trim();
      if (!value) return "";
      return `${block.label}:\n${value}`;
    })
    .filter(Boolean);

  return sections.join("\n\n").trim();
}
