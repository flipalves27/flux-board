# Onda 1 - Arquitetura FluxyPresenceProvider e Dock Unificado

## Objetivo
Unificar experiencia da Fluxy no board e no workspace, removendo duplicacao de logica e habilitando presenca contextual consistente.

## Problema Atual
- `components/fluxy/board-fluxy-dock.tsx` e `components/fluxy/workspace-fluxy-dock.tsx` possuem responsabilidades sobrepostas.
- Logica de presenca, visibilidade e acao esta distribuida, o que dificulta evolucao para estados proativos.
- Inconsistencia visual: em alguns pontos usa `AiAssistantIcon`, em outros `FluxyAvatar`.

## Arquitetura Proposta

## FluxyPresenceProvider
Novo provider global para consolidar sinais de contexto e estados emocionais.

### Responsabilidades
- Agregar sinais de board/sprint (saude, bloqueios, WIP).
- Agregar sinais de sistema (loading AI, streaming, anomalias).
- Resolver estado visual final com regras de prioridade.
- Expor mensagem recomendada e CTA contextual.

### Contrato sugerido
```ts
type FluxyVisualState =
  | "idle"
  | "waving"
  | "thinking"
  | "talking"
  | "celebrating"
  | "sleeping"
  | "worried"
  | "focused"
  | "curious"
  | "proud"
  | "listening"
  | "writing";

type FluxyContextState = {
  visualState: FluxyVisualState;
  message?: string;
  action?: {
    label: string;
    type: "open_copilot" | "open_sprint_panel" | "open_anomaly_center" | "open_retro";
    payload?: Record<string, unknown>;
  };
  source: "board" | "workspace" | "system";
};
```

## Hook `useFluxyState()`
- API unica para consumo em header, dock, empty states, toasts e paineis.
- Deve suportar modo:
  - `compact` (16-24px)
  - `dock` (48-64px)
  - `panel` (hero)
- Retorna estado ja resolvido, sem exigir if/else em cada componente.

## Dock Unificado (`FluxyDock`)
- Componente unico com prop `mode: "board" | "workspace"`.
- Internamente compartilha:
  - abertura/fechamento
  - stream/chat
  - render de avatar + mensagem
  - tracking de eventos
- Mantem apenas variacoes de contexto via `mode` e `scope`.

## Plano de Migracao (sem regressao)
1. **Fase A - Introducao sem trocar UI**
   - Criar provider + hook.
   - Adaptar `WorkspaceFluxyDock` para consumir `useFluxyState`.
2. **Fase B - Paridade no board**
   - Adaptar `BoardFluxyDock` para o mesmo hook.
   - Trocar `AiAssistantIcon` por `FluxyAvatar` onde aplicavel.
3. **Fase C - Extracao**
   - Criar `FluxyDock` unico.
   - `BoardFluxyDock` e `WorkspaceFluxyDock` viram wrappers leves/deprecated.
4. **Fase D - Cleanup**
   - Remover logica duplicada remanescente.
   - Consolidar stores de visibilidade quando a análise de impacto estiver concluída.

## Regras de Prioridade de Estado (Emotion Engine v1)
1. `listening` / `writing` durante input ou geracao ativa.
2. `worried` em violacao de WIP, atraso critico ou anomalia alta.
3. `celebrating` em conclusao de card/meta sprint.
4. `thinking` em processamento AI.
5. `waving` em first-open / onboarding.
6. fallback `idle`.

## Observabilidade
- Eventos de telemetria:
  - `fluxy_state_changed`
  - `fluxy_cta_clicked`
  - `fluxy_dock_opened`
  - `fluxy_proactive_message_viewed`
- Campos minimos: `mode`, `state`, `boardId?`, `sprintId?`, `origin`.

## Criterios de Aceite
- Um unico contrato de estado (`useFluxyState`) utilizado em board e workspace.
- Duplicacao de logica de chat/dock reduzida significativamente.
- FluxyAvatar presente nos pontos primarios de invocacao.
- Nenhuma regressao nas rotas/fluxos de chat existentes.

## PRs Sugeridos
- **PR-06** Provider + hook + testes unitarios de prioridade de estado.
- **PR-07** Integracao em workspace dock.
- **PR-08** Integracao em board dock e swap de icones.
- **PR-09** FluxyDock unificado + wrappers de compatibilidade.
- **PR-10** Cleanup final + hardening de analytics.

