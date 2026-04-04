# Discovery ágil (Kanban / Scrum) — priorização e RFC

Este documento substitui entrevistas presenciais por um roteiro fixo e decisões de produto já alinhadas ao MVP implementado.

## Hipóteses validadas com times típicos

1. **WIP explícito** reduz sobrecarga e torna gargalos visíveis — prioridade **alta**.
2. **Ordenação do backlog** (topo = próximo a puxar) importa mais que um tipo de dados “Épico” no curto prazo — prioridade **alta**.
3. **Hierarquia Épico → História → Tarefa** exige modelo de dados e UI maiores — **backlog** de roadmap (pós-MVP).

## Épicos priorizados (2–3)

| # | Épico | MVP neste release | RFC técnica |
|---|--------|-------------------|-------------|
| 1 | Limite WIP por coluna | `wipLimit` em `BucketConfig` + validação cliente/servidor + indicador `n/L` no header | Zod em [`lib/schemas.ts`](../lib/schemas.ts), helper [`lib/board-wip.ts`](../lib/board-wip.ts) |
| 2 | Backlog priorizado | Ação “ir para o topo da coluna” (ordem `order` dentro do bucket) | [`components/kanban/kanban-card.tsx`](../components/kanban/kanban-card.tsx) + `pinCardToTop` em [`useBoardState.ts`](../components/kanban/hooks/useBoardState.ts) |
| 3 | Épico / história | Não incluído — próximo passo: `parentCardId` ou tags + visão em árvore | Documentar opção A/B no próximo RFC |

## Métricas sugeridas (pós-deploy)

- % de boards com ao menos uma coluna com `wipLimit` definido.
- Frequência do uso de “topo da coluna” (telemetria opcional ou suporte a eventos de auditoria futuros).

## Próximos incrementos

- Velocity por sprint fechado (reuso de `doneCardIds` / snapshots).
- Checklist “Definition of Done” por board (template em `CardDataSchema`).
