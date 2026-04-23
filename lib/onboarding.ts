import { defaultBucketOrderLeanSixSigma, type BoardMethodology } from "./board-methodology";

export type TemplateId = "vendas" | "projetos" | "operacoes" | "vazio";

/** Alinhado ao bucket do board: WIP e política opcionais para demo de fluxo opinativo. */
export type BucketConfig = { key: string; label: string; color: string; wipLimit?: number; policy?: string };

export const DEFAULT_TEMPLATE_ID: TemplateId = "projetos";

/** Colunas efetivas no onboarding conforme metodologia + template escolhido. */
export function resolveOnboardingTemplateBuckets(
  methodology: BoardMethodology,
  templateId: TemplateId
): BucketConfig[] {
  if (methodology === "lean_six_sigma") {
    return defaultBucketOrderLeanSixSigma();
  }
  return ONBOARDING_TEMPLATES[templateId].buckets;
}

export const ONBOARDING_TEMPLATES: Record<
  TemplateId,
  {
    title: string;
    buckets: BucketConfig[];
  }
> = {
  vendas: {
    title: "Vendas",
    buckets: [
      {
        key: "Prospeção",
        label: "Prospeção",
        color: "#74B9FF",
        wipLimit: 15,
        policy: "Topo = próximo contato; buffer de entrada.",
      },
      {
        key: "Qualificação",
        label: "Qualificação",
        color: "#3B82F6",
        wipLimit: 8,
        policy: "Critério BANT/MEDDIC explícito antes de proposta.",
      },
      {
        key: "Proposta",
        label: "Proposta",
        color: "#00D2D3",
        wipLimit: 5,
        policy: "Propostas ativas limitadas para foco em fechamento.",
      },
      {
        key: "Negociação",
        label: "Negociação",
        color: "#FDA7DF",
        wipLimit: 5,
        policy: "Negociações simultâneas limitadas.",
      },
      {
        key: "Fechamento",
        label: "Fechamento",
        color: "#00E676",
        policy: "Handoff para entrega ou arquivo; sem WIP rígido.",
      },
    ],
  },
  projetos: {
    title: "Projetos",
    buckets: [
      {
        key: "Backlog",
        label: "Backlog",
        color: "#6C5CE7",
        policy: "Ordem explícita: topo = próximo a puxar.",
      },
      {
        key: "Planejado",
        label: "Planejado",
        color: "#9B97C2",
        wipLimit: 10,
        policy: "Comprometido a entrar no fluxo; respeitar capacidade.",
      },
      {
        key: "Em Execução",
        label: "Em Execução",
        color: "#00D2D3",
        wipLimit: 5,
        policy: "Limite WIP para estabilizar throughput.",
      },
      {
        key: "Em Revisão",
        label: "Em Revisão",
        color: "#FDA7DF",
        wipLimit: 4,
        policy: "Revisão finita evita fila oculta antes do Done.",
      },
      {
        key: "Concluído",
        label: "Concluído",
        color: "#00E676",
        policy: "Itens entregues; alimenta métricas de fluxo.",
      },
    ],
  },
  operacoes: {
    title: "Operações",
    buckets: [
      {
        key: "A Fazer",
        label: "A Fazer",
        color: "#8B5CF6",
        wipLimit: 25,
        policy: "Fila de intake; priorizar pelo topo.",
      },
      {
        key: "Em Execução",
        label: "Em Execução",
        color: "#00D2D3",
        wipLimit: 6,
        policy: "Execução simultânea limitada.",
      },
      {
        key: "Aguardando",
        label: "Aguardando",
        color: "#FFD93D",
        wipLimit: 12,
        policy: "Espera explícita (cliente, terceiro, aprovação).",
      },
      {
        key: "Monitoramento",
        label: "Monitoramento",
        color: "#E056A0",
        wipLimit: 8,
        policy: "Itens em observação pós-entrega.",
      },
      {
        key: "Concluído",
        label: "Concluído",
        color: "#00E676",
        policy: "Encerrados; revisão de causa raiz quando aplicável.",
      },
    ],
  },
  vazio: {
    title: "Vazio",
    buckets: [
      {
        key: "Backlog",
        label: "Backlog",
        color: "#6C5CE7",
        policy: "Comece aqui e adicione colunas no passo seguinte.",
      },
    ],
  },
};

export function getOnboardingStateStorageKey(userId: string) {
  return `flux_onboarding_v1_${userId}`;
}

export function getOnboardingDoneStorageKey(userId: string) {
  return `flux_onboarding_done_v1_${userId}`;
}

export function getOrganizationOnboardingDoneStorageKey(userId: string) {
  return `flux_org_onboarding_done_v1_${userId}`;
}

export function getOrganizationInvitesOnboardingDoneStorageKey(userId: string) {
  return `flux_org_invites_onboarding_done_v1_${userId}`;
}

export function getOnboardingFluxyHeroStorageKey(userId: string) {
  return `flux_onboarding_fluxy_hero_v1_${userId}`;
}

