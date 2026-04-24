import type { DiscoveryFormDefinition } from "@/lib/kv-discovery-sessions";

/** Formulário padrão (pt-BR) persistido na sessão; UI pública usa next-intl só para moldura e botões. */
export function defaultDiscoveryFormDefinition(): DiscoveryFormDefinition {
  return {
    version: 1,
    blocks: [
      {
        id: "problema",
        title: "Problema e contexto",
        fields: [
          {
            id: "problema_contexto",
            label: "Qual problema de negócio ou utilizador estão a explorar?",
            type: "textarea",
            maxLength: 4000,
            placeholder: "Descreva o contexto, impacto e o que já foi tentado.",
          },
        ],
      },
      {
        id: "utilizadores",
        title: "Utilizadores-alvo",
        fields: [
          {
            id: "utilizadores_alvo",
            label: "Quem sofre o problema e quem beneficia da solução?",
            type: "textarea",
            maxLength: 3000,
            placeholder: "Personas, segmentos, papéis e necessidades observadas.",
          },
        ],
      },
      {
        id: "dor",
        title: "Dor atual",
        fields: [
          {
            id: "dor_atual",
            label: "Como o problema se manifesta hoje (dados, relatos, frequência)?",
            type: "textarea",
            maxLength: 4000,
            placeholder: "Sintomas, métricas, custos e fricção no fluxo atual.",
          },
        ],
      },
      {
        id: "solucoes",
        title: "Soluções imaginadas",
        fields: [
          {
            id: "solucoes_imaginadas",
            label: "Que soluções ou hipóteses já discutiram?",
            type: "textarea",
            maxLength: 4000,
            placeholder: "Ideias, alternativas descartadas e restrições técnicas conhecidas.",
          },
        ],
      },
      {
        id: "restricoes",
        title: "Restrições e prioridade",
        fields: [
          {
            id: "restricoes_prioridade",
            label: "Prazos, dependências, compliance e prioridade para o time.",
            type: "textarea",
            maxLength: 4000,
            placeholder: "O que é inegociável vs. desejável; riscos e donos aproximados.",
          },
        ],
      },
    ],
  };
}

export function listDefaultDiscoveryFieldIds(): string[] {
  return defaultDiscoveryFormDefinition().blocks.flatMap((b) => b.fields.map((f) => f.id));
}
