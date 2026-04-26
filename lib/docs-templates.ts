import type { DocType } from "./docs-types";

const MINUTES = `# Ata de reunião

**Data:** (preencha)
**Participantes:**

- 

**Objetivo**

- 

**Decisões**

- 

**Ações e responsáveis**

- [ ] 

**Próxima reunião**

- 

`;

const PRD = `# PRD — (nome da feature)

## Problema / oportunidade

## Proposta de valor

## Requisitos funcionais

1. 

## Requisitos não funcionais

- 

## Fora de escopo

- 

## Métricas de sucesso

- 

## Riscos e dependências

- 

`;

const RETRO = `# Retrospectiva

**Time / Board:**

**Sprint / período:**

## O que funcionou bem

- 

## O que podemos melhorar

- 

## Experimentos (ações)

- [ ] 

## Próximos passos

- 

`;

const DECISION = `# Registro de decisão

**Status:** proposta | aprovada | rejeitada
**Data:**

## Contexto

## Decisão

## Consequências

## Alternativas consideradas

`;

const BRIEFING = `# Briefing

**Problema / pedido**
**Público-alvo / stakeholders**
**Background**
**Hipóteses**
**Escopo (in / out)**
**Prazo / milestones**
**Riscos abertos**
`;

export const DOCS_TEMPLATE_BY_TYPE: Record<DocType, string> = {
  general: "# Documento\n\n",
  minutes: MINUTES,
  prd: PRD,
  retro: RETRO,
  decision: DECISION,
  briefing: BRIEFING,
};
