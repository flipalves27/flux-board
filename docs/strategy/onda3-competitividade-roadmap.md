# Onda 3 - Roadmap Tecnico de Competitividade v1

## Objetivo
Entregar base de ecossistema e integracoes para elevar paridade competitiva: Git, API publica, PWA/push e automation builder.

## Status de Fechamento (atual)
- Integracoes GitHub/GitLab v1: **concluido (v1)** com webhook validado, sync basico de card e log de status.
- API Publica REST v1 + OpenAPI: **concluido (v1)** com boards/cards/sprints/comments, escopos e lifecycle de token admin.
- PWA + Push Notifications: **concluido (v1)** com subscription, outbox, dispatch/retry e endpoint cron.
- Automation Builder Visual v1: **concluido (v1)** com logs de execucao e acao de teste.
- Operacao diaria auditavel: **concluido (v1)** com painel em `admin/platform` aba `Operations`.

## Frentes e Dependencias

## 1) Integracoes GitHub/GitLab v1
### Escopo v1
- OAuth de conexao por organizacao.
- Inbound webhooks (PR aberto/merged, issue events, branch refs).
- Link bidirecional `card <-> branch/PR`.
- Atualizacao de status de card via eventos de PR.

### Dependencias
- Camada OAuth robusta em `lib/oauth`.
- Assinatura/verificacao de webhooks em `app/api/incoming-webhooks`.
- Mapeamento de identidade usuario/org entre provedores.

### Entregaveis
- `app/api/integrations/github/*`
- `app/api/integrations/gitlab/*`
- persistencia de conexoes por org
- painel de conexoes no workspace

## 2) API Publica REST v1 + OpenAPI
### Escopo v1
- Endpoints CRUD para:
  - boards
  - cards
  - sprints
  - comments
- Paginação, filtros basicos e erros padronizados.
- Auth por token de API com escopos.

### Dependencias
- Padrao unico de validacao por schema (Zod).
- Middleware de authz orientado a org/board role.
- Rate limit por plano/tier.

### Entregaveis
- Namespace de rotas publicas versionadas: `/api/public/v1/*`
- Documento OpenAPI 3.1 gerado e publicado.
- Guia de onboarding para desenvolvedores terceiros.

## 3) PWA + Push Notifications
### Escopo v1
- Web app instalavel.
- Cache de leitura para board/listas recentes.
- Push para:
  - mentions
  - due dates
  - blocked cards

### Dependencias
- Service worker e estrategia de cache segura.
- Registro de subscription por usuario/dispositivo.
- Sistema de preferencia de notificacao.

### Entregaveis
- manifesto e service worker versionado
- tela de consentimento de notificacoes
- job de disparo de notificacoes por evento

## 4) Automation Builder Visual v1
### Escopo v1
- Editor trigger->action:
  - trigger: card moved, label added, due date changed
  - action: move card, assign user, send notification, create follow-up card
- Simulacao basica ("test rule") antes de ativar.
- Execucao com logs por regra.

### Dependencias
- Reuso de infraestrutura de jobs/cron.
- Normalizacao de eventos de dominio.
- Auditoria minima de automacoes por org.

### Entregaveis
- UI builder em `components/automations/*`
- API de regras e execucao em `app/api/boards/[id]/automations/*`
- painel de historico de execucoes

## Sequencia de Releases
- **Release R1 (Semanas 11-12):**
  - API publica v1 base (boards/cards read/write)
  - OAuth GitHub inicial + link card/PR manual
- **Release R2 (Semanas 13-14):**
  - webhooks GitHub/GitLab + sync de status
  - PWA instalavel + cache de leitura
- **Release R3 (Semanas 15-16):**
  - push notifications por mencao/prazo
  - automation builder v1 (3 triggers, 4 actions)
- **Release R4 (Semanas 17-18):**
  - OpenAPI consolidada
  - hardening de seguranca/observabilidade
  - GA para clientes selecionados

## Matriz de Riscos
- **OAuth e webhooks** podem introduzir superficie de ataque.
  - Mitigacao: assinatura obrigatoria, nonce/timestamp e replay protection.
- **API publica** pode gerar abuso de uso.
  - Mitigacao: rate limiting por plano e quotas diarias.
- **PWA cache** pode servir dado desatualizado.
  - Mitigacao: stale-while-revalidate com TTL curto e invalidacao por eventos.
- **Automations** podem causar loops.
  - Mitigacao: limitador de profundidade e deduplicacao por janela.

## Criterios de Aceite
- Integracao Git ativa e funcional em boards piloto.
- API publica documentada e consumivel por cliente externo.
- PWA instalavel e push funcional em ambientes suportados.
- Automation builder operando com logs e rollback de regra.

