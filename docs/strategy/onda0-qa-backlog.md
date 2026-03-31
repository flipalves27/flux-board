# Onda 0 - Backlog Tecnico (Semanas 1-2)

## Objetivo
Estabilizar o ciclo de sprint e reduzir risco em rotas criticas antes de acelerar entrega de features visuais e competitivas.

## Escopo P0
- Corrigir calculo de `velocity` com suporte a story points e fallback para contagem.
- Garantir snapshot inicial de burndown (`t0`) no start da sprint.
- Implementar fluxo de carryover assistido para proxima sprint.
- Iniciar fatiamento da rota de copilot em camadas.
- Criar suite minima de testes de contrato para sprint lifecycle.

## Arquivos Alvo
- `app/api/boards/[id]/sprints/[sprintId]/close/route.ts`
- `app/api/boards/[id]/sprints/[sprintId]/start/route.ts`
- `app/api/boards/[id]/sprints/[sprintId]/complete/route.ts`
- `app/api/boards/[id]/sprints/[sprintId]/review/route.ts`
- `lib/sprint-lifecycle.ts`
- `app/api/boards/[id]/copilot/route.ts`

## Sequencia de PRs (pequenos e verificaveis)
1. **PR-01: Sprint velocity por pontos**
   - Introduzir helper em `lib/sprint-lifecycle.ts`:
     - `computeSprintVelocity(doneCards, mode)`
     - modo padrao: `story_points_then_count`.
   - Atualizar `close/route.ts` para usar helper unificado.
   - Criterio: `velocity` preserva compatibilidade com boards sem pontos.

2. **PR-02: Burndown snapshot t0**
   - Ajustar `start/route.ts` para criar snapshot inicial no inicio da sprint.
   - Reusar estrutura de snapshot ja usada em fechamento.
   - Criterio: sprint iniciada no dia nao fica sem baseline.

3. **PR-03: Carryover assistido**
   - No fechamento, retornar `carryoverCardIds` e sinal de recomendacao.
   - Criar endpoint/acao para criar sprint seguinte com carryover pre-selecionado.
   - Criterio: usuario nao precisa remontar backlog manualmente.

4. **PR-04: Copilot route - fase 1 de estrangulamento**
   - Extrair camadas de `app/api/boards/[id]/copilot/route.ts`:
     - `copilot-authz.ts`
     - `copilot-input-schema.ts`
     - `copilot-actions.ts`
     - `copilot-stream.ts`
   - Manter handler atual como orquestrador fino.
   - Criterio: sem regressao funcional e reducao de complexidade por modulo.

5. **PR-05: Testes de contrato sprint lifecycle**
   - Cobrir cenarios de sucesso e falha:
     - start -> complete -> review -> close
     - authz negada
     - sprint inexistente
     - payload invalido
   - Criterio: suite roda em CI e bloqueia regressao de contrato.

## Matriz de Testes Minimos
- **Start sprint**
  - cria snapshot t0
  - idempotencia para sprint ja iniciada
- **Complete sprint**
  - valida transicao de estado
- **Review sprint**
  - persiste resumo e dados de review
- **Close sprint**
  - computa `doneCardIds`, `carryoverCardIds`, `velocity`
  - aplica tag carryover sem duplicar tags

## Definition of Done (Onda 0)
- Nenhum bug P0 conhecido no lifecycle apos deploy.
- Testes de contrato de sprint em pipeline de PR.
- Handler de copilot com primeira camada de modularizacao entregue.
- Observabilidade minima em erros de sprint/carryover (logs estruturados).

## Dependencias
- Disponibilidade de fixtures de board/sprint para testes de API.
- Alinhamento de produto sobre regra de `velocity` (pontos vs contagem).
- Janela de deploy com monitoramento ativo dos endpoints de sprint.

