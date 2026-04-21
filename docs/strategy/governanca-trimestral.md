# Governanca Trimestral - Execucao do Plano Massivo

## Objetivo
Garantir cadencia, previsibilidade e controle de risco para executar as ondas sem perder qualidade tecnica.

## Modelo Operacional
- Ciclos quinzenais com planejamento, checkpoint tecnico e review executiva.
- Squads paralelos:
  - Core QA/API
  - UX/UI
  - Fluxy/AI
  - Platform/Integracoes
- Cada squad com backlog P0/P1/P2 e WIP limitado.

## Quality Gates (obrigatorios)
1. **Gate de PR**
   - lint e typecheck obrigatorios
   - testes afetados obrigatorios
   - sem queda de cobertura no modulo alterado
2. **Gate de Release**
   - smoke E2E de fluxos criticos
   - sem bug P0 aberto
   - rollback plan validado
3. **Gate de Onda**
   - criterio de aceite da onda cumprido
   - metricas chave atingindo meta minima

## Matriz de Metricas

## Engenharia
- Lead time de PR (p50/p90).
- Taxa de rollback por release.
- Mudancas por PR (linhas e arquivos) para evitar lotes grandes.
- Cobertura de testes total e por camada (API, UI, lib).

## Produto e UX
- Lighthouse (pages core).
- CLS e erros JS em producao.
- Taxa de sucesso dos fluxos:
  - sprint lifecycle
  - drag-and-drop card
  - abertura de copilot
- NPS visual e NPS Fluxy.

## Competitividade
- Percentual de boards com integracao Git ativa.
- Uso da API publica (tokens ativos, requests validas/dia).
- Adoção de PWA instalada.
- Automacoes ativas por organizacao.

## Cadencia de Cerimonias
- **Segunda:** planejamento semanal e ajuste de prioridades.
- **Quarta:** checkpoint tecnico de riscos/bloqueios.
- **Sexta:** demo de incremento + leitura de metricas.
- **Fechamento quinzenal:** review de onda, decisao go/no-go para proximos itens.

## Gestao de Riscos

## Top riscos
- Escopo acima da capacidade da sprint.
- Regressao em arquivos de alta complexidade.
- Dependencias externas (OAuth/webhooks/push) com instabilidade.
- Gap de testes em UI critica.

## Mitigacoes
- WIP limite por squad e congelamento de escopo em meio de ciclo.
- PRs menores com feature flags.
- Canary release para mudancas de alto impacto.
- Testes de contrato e smoke E2E antes de cada deploy.

## RACI Simplificado
- **Produto:** priorizacao e aceite funcional.
- **Tech Lead:** qualidade tecnica e desenho de arquitetura.
- **QA:** estrategia de testes e validacao de regressao.
- **Dev squads:** implementacao e observabilidade.
- **Ops/Plataforma:** pipeline, rollout e incident response.

## Dashboard de Acompanhamento (semanal)
- Status de cada onda: `on_track`, `at_risk`, `off_track`.
- Top 5 riscos e plano de acao.
- Evolucao de cobertura e defeitos.
- Evolucao de adocao das frentes competitivas.
- Painel operacional diario (admin/platform/operations):
  - status de outbox push (due/retry)
  - logs de integracao (received/synced/ignored/failed)
  - tokens public API ativos/revogados

## Artefatos executaveis de gate
- Relatorio automatizado de gate: `npm run quality:gates:report`
  - saida em `docs/reports/quality-gate-latest.md`
- Checklist de smoke release: `npm run quality:gates:smoke`
- Relatorio de gate de UI/performance/a11y: `npm run quality:gates:ui`
  - saida em `docs/reports/ui-quality-gate-latest.md`
- Dashboard semanal de governanca: `npm run governance:weekly`
  - saida em `docs/reports/governance-weekly-latest.md`
- Operacao auditavel diaria: `docs/operations-panel-v1.md` (+ export CSV por secao no painel)

## Criterios de Sucesso (90 dias)
- Cumprimento das entregas prioritarias das ondas 0-3.
- Cobertura total >= 35% com tendencia sustentada.
- Zero incidente P0 originado por regressao de sprint lifecycle.
- Primeiros clientes usando integracao Git/API publica/PWA com telemetria saudavel.

