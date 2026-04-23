import type { BucketConfig } from "@/app/board/[id]/page";

export type BoardMethodology = "scrum" | "kanban" | "lean_six_sigma" | "discovery" | "safe";

export const BOARD_METHODOLOGY_VALUES: BoardMethodology[] = [
  "scrum",
  "kanban",
  "lean_six_sigma",
  "discovery",
  "safe",
];

export function isBoardMethodology(value: unknown): value is BoardMethodology {
  return (
    value === "scrum" ||
    value === "kanban" ||
    value === "lean_six_sigma" ||
    value === "discovery" ||
    value === "safe"
  );
}

export function isScrumMethodology(m: BoardMethodology | undefined): boolean {
  return m === "scrum";
}

/** Scrum e SAFe reutilizam a entidade sprint/iteração no produto. */
export function isSprintMethodology(m: BoardMethodology | undefined): boolean {
  return m === "scrum" || m === "safe";
}

export function isKanbanMethodology(m: BoardMethodology | undefined): boolean {
  return m === "kanban";
}

export function isLeanSixSigmaMethodology(m: BoardMethodology | undefined): boolean {
  return m === "lean_six_sigma";
}

export function isDiscoveryMethodology(m: BoardMethodology | undefined): boolean {
  return m === "discovery";
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

/**
 * Colunas alinhadas a product discovery (hipóteses → evidência).
 * Foco em projeção e experimentação, sem impor esquema extra nos cards.
 */
export function defaultBucketOrderDiscovery(): BucketConfig[] {
  return [
    {
      key: "problema",
      label: "Problema / oportunidade",
      color: COL.muted,
      policy: "Contexto, não-conformidades ou sinais de mercado.",
    },
    {
      key: "pesquisa",
      label: "Pesquisa",
      color: COL.primary,
      policy: "Entrevistas, dados qualitativos, hipóteses a testar.",
    },
    {
      key: "ideacao",
      label: "Conceito",
      color: COL.accent,
      policy: "Ideação, user flows e soluções candidatas.",
    },
    {
      key: "prototipo",
      label: "Protótipo",
      color: COL.warning,
      policy: "MVP, mockups, testes com utilizadores.",
    },
    {
      key: "validado",
      label: "Aprendizagem",
      color: COL.success,
      policy: "Resultados, decisão de avançar ou iterar.",
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

/** Colunas aproximando PI / ART / execução (SAFe de marca registrada, Scaled Agile, Inc.; fluxo aproximado com sprints de produto). */
export function defaultBucketOrderSafe(): BucketConfig[] {
  return [
    {
      key: "program-backlog",
      label: "Program Backlog",
      color: COL.primary,
      policy: "Features e enablers priorizados; preparação e WSJF em refinamento de backlog.",
    },
    {
      key: "preparacao-wsjf",
      label: "Análise WSJF / preparação",
      color: COL.secondary,
      policy: "Estimativas, dependências, riscos técnicos e alinhamento antes do planning.",
    },
    {
      key: "pi-planning",
      label: "PI Planning / comprometido",
      color: COL.accent,
      policy: "Itens com compromisso de PI e objetivos de time/solução alinhados.",
    },
    {
      key: "em-iteracao",
      label: "Em iteração",
      color: COL.warning,
      policy: "Trabalho da iteração atual; integração contínua de valor.",
    },
    {
      key: "integracao-demo",
      label: "Integração & demo",
      color: COL.muted,
      policy: "Hardering, sistem demo e validação de incremento de solução.",
    },
    {
      key: "concluido",
      label: "Concluído",
      color: COL.success,
      policy: "Itens concluídos; evidência de valor e conformidade com DoD.",
    },
  ];
}

export function defaultBucketOrderForMethodology(m: BoardMethodology): BucketConfig[] {
  if (m === "scrum") return defaultBucketOrderScrum();
  if (m === "safe") return defaultBucketOrderSafe();
  if (m === "lean_six_sigma") return defaultBucketOrderLeanSixSigma();
  if (m === "discovery") return defaultBucketOrderDiscovery();
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
  if (m === "safe") {
    config.backlogBucketKey = "program-backlog";
    config.labels = ["Feature", "Enabler", "Risco", "Dependência", "Objetivo de PI"];
  }
  if (m === "lean_six_sigma") {
    config.labels = ["VOC", "CTQ", "Medida", "Causa raiz", "Contramedida", "Controle"];
  }
  if (m === "discovery") {
    config.labels = ["Hipótese", "Evidência", "Risco", "Utilizador", "Métrica"];
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
