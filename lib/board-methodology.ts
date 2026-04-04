import type { BucketConfig } from "@/app/board/[id]/page";

export type BoardMethodology = "scrum" | "kanban" | "lean_six_sigma";

export const BOARD_METHODOLOGY_VALUES: BoardMethodology[] = ["scrum", "kanban", "lean_six_sigma"];

export function isBoardMethodology(value: unknown): value is BoardMethodology {
  return value === "scrum" || value === "kanban" || value === "lean_six_sigma";
}

export function isScrumMethodology(m: BoardMethodology | undefined): boolean {
  return m === "scrum";
}

export function isKanbanMethodology(m: BoardMethodology | undefined): boolean {
  return m === "kanban";
}

export function isLeanSixSigmaMethodology(m: BoardMethodology | undefined): boolean {
  return m === "lean_six_sigma";
}

/**
 * Boards legados sem campo: inferir por existência de sprints (heurística do plano).
 */
export function inferLegacyBoardMethodology(hasAnySprint: boolean): BoardMethodology {
  return hasAnySprint ? "scrum" : "kanban";
}

const COL = {
  muted: "var(--flux-text-muted)",
  primary: "var(--flux-primary)",
  secondary: "var(--flux-secondary)",
  accent: "var(--flux-accent)",
  warning: "var(--flux-warning)",
  success: "var(--flux-success)",
} as const;

/** Colunas alinhadas a Scrum: backlog, compromisso de sprint, execução, revisão, incremento concluído. */
export function defaultBucketOrderScrum(): BucketConfig[] {
  return [
    {
      key: "backlog",
      label: "Backlog",
      color: COL.primary,
      policy: "Product backlog priorizado; refinement contínuo.",
    },
    {
      key: "pronto-sprint",
      label: "Pronto para sprint",
      color: COL.secondary,
      policy: "Itens prontos para o Sprint Planning.",
    },
    {
      key: "em-progresso",
      label: "Em progresso",
      color: COL.accent,
      policy: "Trabalho do sprint atual.",
    },
    {
      key: "revisao",
      label: "Revisão",
      color: COL.warning,
      policy: "Validação antes do Done (Sprint Review / QA).",
    },
    {
      key: "concluido",
      label: "Concluído",
      color: COL.success,
      policy: "Incremento atende ao Definition of Done.",
    },
  ];
}

/** Colunas Kanban com WIP sugerido em etapas de fluxo contínuo. */
export function defaultBucketOrderKanban(): BucketConfig[] {
  return [
    {
      key: "entrada",
      label: "Entrada",
      color: COL.muted,
      wipLimit: 20,
      policy: "Buffer de entrada; reabastecimento explícito.",
    },
    {
      key: "analise",
      label: "Em análise",
      color: COL.primary,
      wipLimit: 5,
      policy: "Triagem e clarificação.",
    },
    {
      key: "desenvolvimento",
      label: "Em desenvolvimento",
      color: COL.accent,
      wipLimit: 5,
      policy: "Limite WIP para estabilizar o fluxo.",
    },
    {
      key: "testes",
      label: "Testes",
      color: COL.warning,
      wipLimit: 4,
      policy: "Verificação antes da conclusão.",
    },
    {
      key: "concluido",
      label: "Concluído",
      color: COL.success,
      policy: "Trabalho entregue; revisão de fluxo e métricas.",
    },
  ];
}

/** Colunas DMAIC para projetos Lean Six Sigma (melhoria de processo). */
export function defaultBucketOrderLeanSixSigma(): BucketConfig[] {
  return [
    {
      key: "define",
      label: "Define",
      color: COL.primary,
      wipLimit: 5,
      policy: "Carta do projeto, problema, escopo, VOC/SIPOC inicial.",
    },
    {
      key: "measure",
      label: "Measure",
      color: COL.secondary,
      wipLimit: 5,
      policy: "Plano de medição, baseline, definição operacional de Y.",
    },
    {
      key: "analyze",
      label: "Analyze",
      color: COL.accent,
      wipLimit: 4,
      policy: "Causa raiz: Ishikawa, 5 porquês, dados e hipóteses.",
    },
    {
      key: "improve",
      label: "Improve",
      color: COL.warning,
      wipLimit: 4,
      policy: "Contramedidas, piloto e validação da solução.",
    },
    {
      key: "control",
      label: "Control",
      color: COL.success,
      wipLimit: 5,
      policy: "Plano de controle, padronização e sustentação.",
    },
  ];
}

export function defaultBucketOrderForMethodology(m: BoardMethodology): BucketConfig[] {
  if (m === "scrum") return defaultBucketOrderScrum();
  if (m === "lean_six_sigma") return defaultBucketOrderLeanSixSigma();
  return defaultBucketOrderKanban();
}

/** Payload inicial para `createBoard` conforme metodologia. */
export function initialBoardPayloadForMethodology(m: BoardMethodology) {
  const bucketOrder = defaultBucketOrderForMethodology(m);
  const config: {
    bucketOrder: BucketConfig[];
    collapsedColumns: string[];
    labels: string[];
    backlogBucketKey?: string;
  } = {
    bucketOrder,
    collapsedColumns: [],
    labels: [],
  };
  if (m === "scrum") {
    config.backlogBucketKey = "backlog";
  }
  if (m === "lean_six_sigma") {
    config.labels = ["VOC", "CTQ", "Medida", "Causa raiz", "Contramedida", "Controle"];
  }
  return {
    boardMethodology: m,
    version: "2.0",
    cards: [],
    config,
    mapaProducao: [],
    dailyInsights: [],
  };
}
