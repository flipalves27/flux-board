import type { BucketConfig } from "@/app/board/[id]/page";
import type { BoardViewMode } from "@/components/kanban/kanban-constants";
import { ALL_BOARD_VIEW_MODES } from "@/components/kanban/kanban-constants";
import {
  type BoardMethodology,
  defaultBucketOrderForMethodology,
} from "@/lib/board-methodology";

/**
 * Per-methodology registry: defaults, allowed board canvas modes, and UI affordances.
 * Keeps methodology concerns out of `kanban-board.tsx` conditionals over time.
 */
export type MethodologyModule = {
  methodology: BoardMethodology;
  defaultBucketOrder: () => BucketConfig[];
  /** Canvas modes shown in the view picker; first entry is the fallback if a stored mode is disallowed. */
  allowedViewModes: readonly BoardViewMode[];
  /** Which strip to show in the expanded “detail chrome” row (sprint goal / LSS / SAFe / none). */
  detailChromeStrip: "scrum_product_goal" | "lss_context" | "safe_context" | "none";
  /** Short hint for LLM routing (copilot / briefings). */
  copilotContextHint: string;
};

const ALL: readonly BoardViewMode[] = ALL_BOARD_VIEW_MODES;

function baseModule(
  methodology: BoardMethodology,
  overrides: Partial<Omit<MethodologyModule, "methodology" | "defaultBucketOrder">>
): MethodologyModule {
  return {
    methodology,
    defaultBucketOrder: () => defaultBucketOrderForMethodology(methodology),
    allowedViewModes: ALL,
    detailChromeStrip: "none",
    copilotContextHint: "Agile genérico",
    ...overrides,
  };
}

const REGISTRY: Record<BoardMethodology, MethodologyModule> = {
  scrum: baseModule("scrum", {
    detailChromeStrip: "scrum_product_goal",
    copilotContextHint: "Scrum: sprint, DoD, incremento e compromisso de time.",
  }),
  kanban: baseModule("kanban", {
    copilotContextHint: "Kanban: fluxo contínuo, WIP e cadência de reabastecimento.",
  }),
  lean_six_sigma: baseModule("lean_six_sigma", {
    /** Eisenhower is less central for DMAIC boards; keep the rest for portfolio readouts. */
    allowedViewModes: ALL.filter((m) => m !== "eisenhower"),
    detailChromeStrip: "lss_context",
    copilotContextHint: "Lean Six Sigma: DMAIC, VOC/CTQ, medição e controle estatístico.",
  }),
  discovery: baseModule("discovery", {
    copilotContextHint: "Discovery: hipóteses, entrevistas, protótipos e validação com utilizadores.",
  }),
  safe: baseModule("safe", {
    allowedViewModes: ALL.filter((m) => m !== "eisenhower"),
    detailChromeStrip: "safe_context",
    copilotContextHint:
      "SAFe aproximado: PI, ART, WSJF, dependências, riscos, preparação de PI planning (sprints mapeiam iteração; não certificação).",
  }),
};

export function getMethodologyModule(methodology: BoardMethodology | undefined): MethodologyModule {
  const m = methodology ?? "scrum";
  return REGISTRY[m] ?? REGISTRY.scrum;
}

/**
 * Templates: `templateKind` + `boardMethodology` no snapshot definem o board ao instanciar.
 * `boardMethodology` no snapshot é opcional; quando ausente, o import infere scrum vs kanban
 * (matriz/BPMN forçam kanban). Valores `scrum` | `kanban` | `lean_six_sigma` | `discovery` | `safe`
 * são persistidos no documento do board e validados no PUT (Zod).
 */
export function listMethodologyModuleKeys(): BoardMethodology[] {
  return Object.keys(REGISTRY) as BoardMethodology[];
}
