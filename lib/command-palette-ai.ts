export type AiCommandType =
  | "move_cards"
  | "create_card"
  | "query_cards"
  | "open_copilot"
  | "navigate"
  | "unknown";

export type AiCommandResult = {
  type: AiCommandType;
  confidence: number;
  params: Record<string, unknown>;
  displayMessage: string;
};

type ParseContext = {
  boardNames: string[];
  columnNames: string[];
  currentBoardId?: string;
};

const MOVE_PATTERNS = [
  /mov[ea]\s+(?:todos?\s+)?(?:os?\s+)?cards?\s+(?:de\s+)?(.+?)\s+para\s+(.+)/i,
  /move\s+(?:all\s+)?cards?\s+(?:from\s+)?(.+?)\s+to\s+(.+)/i,
  /transferir?\s+cards?\s+(?:de\s+)?(.+?)\s+para\s+(.+)/i,
];

const CREATE_PATTERNS = [
  /(?:cri[ea]r?|novo|new|add)\s+(?:um\s+)?card\s+(?:de\s+)?(.+)/i,
  /(?:create|add)\s+(?:a\s+)?(?:new\s+)?card\s+(?:for\s+)?(.+)/i,
];

const QUERY_PATTERNS = [
  /(?:quais?|quantos?|mostre?|list[ae]r?|show)\s+(?:os?\s+)?cards?\s+(.+)/i,
  /(?:which|how\s+many|show|list)\s+cards?\s+(.+)/i,
  /(?:cards?\s+)(?:bloqueados?|blocked|atrasados?|overdue|urgentes?|urgent)/i,
];

const NAV_PATTERNS: Array<{ pattern: RegExp; path: string; label: string }> = [
  { pattern: /(?:ir\s+para|abrir?|go\s+to|open)\s+(?:os?\s+)?(?:boards?|quadros?)/i, path: "/boards", label: "Boards" },
  { pattern: /(?:ir\s+para|abrir?|go\s+to|open)\s+(?:os?\s+)?(?:relatórios?|reports?)/i, path: "/reports", label: "Relatórios" },
  { pattern: /(?:ir\s+para|abrir?|go\s+to|open)\s+(?:o?\s+)?(?:dashboard|painel)/i, path: "/dashboard", label: "Dashboard" },
  { pattern: /(?:ir\s+para|abrir?|go\s+to|open)\s+(?:os?\s+)?(?:okrs?|goals?|objetivos?)/i, path: "/okrs", label: "OKRs" },
  { pattern: /(?:ir\s+para|abrir?|go\s+to|open)\s+(?:os?\s+)?(?:sprints?)/i, path: "/sprints", label: "Sprints" },
  { pattern: /(?:ir\s+para|abrir?|go\s+to|open)\s+(?:os?\s+)?(?:templates?)/i, path: "/templates", label: "Templates" },
  { pattern: /(?:ir\s+para|abrir?|go\s+to|open)\s+(?:as?\s+)?(?:tarefas?|tasks?|my\s*work)/i, path: "/my-work", label: "My Work" },
];

function findBestMatch(text: string, options: string[]): string | null {
  const lower = text.toLowerCase().trim();
  for (const opt of options) {
    if (opt.toLowerCase() === lower) return opt;
  }
  for (const opt of options) {
    if (opt.toLowerCase().includes(lower) || lower.includes(opt.toLowerCase())) return opt;
  }
  return null;
}

export function parseNaturalLanguageCommand(
  input: string,
  context: ParseContext
): AiCommandResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { type: "unknown", confidence: 0, params: {}, displayMessage: "" };
  }

  if (/copilot|assistente|ai\s+help/i.test(trimmed)) {
    return {
      type: "open_copilot",
      confidence: 0.9,
      params: { boardId: context.currentBoardId },
      displayMessage: "Abrindo o Copilot...",
    };
  }

  for (const pattern of MOVE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const [, source, target] = match;
      const matchedTarget = findBestMatch(target ?? "", context.columnNames);
      return {
        type: "move_cards",
        confidence: matchedTarget ? 0.85 : 0.6,
        params: {
          sourceFilter: source?.trim() ?? "",
          targetColumn: matchedTarget ?? target?.trim() ?? "",
          boardId: context.currentBoardId,
        },
        displayMessage: `Mover cards "${source?.trim()}" → ${matchedTarget ?? target?.trim()}`,
      };
    }
  }

  for (const pattern of CREATE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const [, description] = match;
      return {
        type: "create_card",
        confidence: 0.8,
        params: {
          description: description?.trim() ?? "",
          boardId: context.currentBoardId,
        },
        displayMessage: `Criar card: "${description?.trim()}"`,
      };
    }
  }

  for (const pattern of QUERY_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        type: "query_cards",
        confidence: 0.75,
        params: { query: trimmed, boardId: context.currentBoardId },
        displayMessage: `Consultando: "${trimmed}"`,
      };
    }
  }

  for (const { pattern, path, label } of NAV_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        type: "navigate",
        confidence: 0.9,
        params: { path },
        displayMessage: `Navegar para ${label}`,
      };
    }
  }

  return {
    type: "unknown",
    confidence: 0,
    params: { rawInput: trimmed },
    displayMessage: "",
  };
}
