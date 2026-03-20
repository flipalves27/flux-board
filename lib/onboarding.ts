export type TemplateId = "vendas" | "projetos" | "operacoes" | "vazio";

export type BucketConfig = { key: string; label: string; color: string };

export const DEFAULT_TEMPLATE_ID: TemplateId = "vazio";

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
      { key: "Prospeção", label: "Prospeção", color: "#74B9FF" },
      { key: "Qualificação", label: "Qualificação", color: "#3B82F6" },
      { key: "Proposta", label: "Proposta", color: "#00D2D3" },
      { key: "Negociação", label: "Negociação", color: "#FDA7DF" },
      { key: "Fechamento", label: "Fechamento", color: "#00E676" },
    ],
  },
  projetos: {
    title: "Projetos",
    buckets: [
      { key: "Backlog", label: "Backlog", color: "#6C5CE7" },
      { key: "Planejado", label: "Planejado", color: "#9B97C2" },
      { key: "Em Execução", label: "Em Execução", color: "#00D2D3" },
      { key: "Em Revisão", label: "Em Revisão", color: "#FDA7DF" },
      { key: "Concluído", label: "Concluído", color: "#00E676" },
    ],
  },
  operacoes: {
    title: "Operações",
    buckets: [
      { key: "A Fazer", label: "A Fazer", color: "#8B5CF6" },
      { key: "Em Execução", label: "Em Execução", color: "#00D2D3" },
      { key: "Aguardando", label: "Aguardando", color: "#FFD93D" },
      { key: "Monitoramento", label: "Monitoramento", color: "#E056A0" },
      { key: "Concluído", label: "Concluído", color: "#00E676" },
    ],
  },
  vazio: {
    title: "Vazio",
    buckets: [{ key: "Backlog", label: "Backlog", color: "#6C5CE7" }],
  },
};

export function getOnboardingStateStorageKey(userId: string) {
  return `reborn_onboarding_v1_${userId}`;
}

export function getOnboardingDoneStorageKey(userId: string) {
  return `reborn_onboarding_done_v1_${userId}`;
}

export function getOrganizationOnboardingDoneStorageKey(userId: string) {
  return `reborn_org_onboarding_done_v1_${userId}`;
}

export function getOrganizationInvitesOnboardingDoneStorageKey(userId: string) {
  return `reborn_org_invites_onboarding_done_v1_${userId}`;
}

