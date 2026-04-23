# Posicionamento: ICP, moat de fluxo, intake, inteligência e integrações

Documento operacional para alinhar produto, vendas e roadmap ao posicionamento **fluxo opinativo** (não paridade de checklist com Jira/Monday/Trello). Complementa o [RFC de discovery ágil](../flux-agile-discovery-rfc.md).

---

## 1. ICP, mensagem principal e anti-posicionamento

### Ideal Customer Profile (ICP)

Organizações em que **entrega contínua** e **visibilidade de gargalo** importam mais do que um catálogo infinito de tipos de artefato:

- **Squads de produto e operações** (Brasil e LATAM como praia inicial): PM, engenharia e operações/suporte no mesmo quadro.
- **Times híbridos negócio + tecnologia** que precisam de uma linguagem comum (cartão + colunas + políticas), sem administrador de ferramenta em tempo integral.
- **Consultorias de processo / melhoria contínua** que precisam demonstrar fluxo em semanas, com BPMN ou formulários de intake sem exigir licença para cada solicitante externo.

**Sinais de fit:** já usam ou respeitam Kanban; sofrem com “quadro bonito” sem WIP; querem **ordem explícita de backlog** e **sinais** (aging, bloqueios), não mais 30 campos customizados no primeiro dia.

### Mensagem principal (fluxo opinativo)

> **Menos quadro genérico; mais sistema puxável com limites reais, ordem explícita e sinais de atenção.**

Pilares que a mensagem deve reforçar:

1. **WIP e políticas** como cidadãos de primeira classe (não opcional escondido).
2. **Ordenação do backlog** (topo = próximo a puxar) como disciplina diária.
3. **Métricas mínimas de fluxo** (lead time, throughput, CFD no hub de relatórios) como consequência natural do uso do board, não como projeto paralelo de BI.

### Anti-posicionamento (o que **não** competir no curto prazo)

Declarar isto em vendas e roadmap reduz dispersão:

- **ITSM enterprise completo** (CMDB profundo, SLAs multi-nível, catálogo massivo de serviços) — não é meta imediata; intake leve (Flux Forms) sim.
- **Paridade Jira** em campos, workflows arbitrários, marketplace de extensões e governança multi-tenant de grande banco — **evitar**; integrações e API são **cirúrgicas** (ver secção 5).
- **“Work OS” generalista** estilo planilha infinita com automação sem opinião de fluxo — não é o território; preferir **defaults opinativos** e templates.

---

## 2. Núcleo premium: WIP + ordenação + métricas mínimas de fluxo e demo padrão

### Definição de produto

O **pacote premium de fluxo** é:

| Pilar | Comportamento no produto |
|--------|---------------------------|
| **WIP** | `wipLimit` por coluna, validação cliente/servidor, indicador `n/L` no header (ver RFC). |
| **Ordenação** | Coluna de backlog com ordem explícita; ação de **fixar no topo** / priorização dentro do bucket. |
| **Métricas mínimas** | Hub **Relatórios** (`/api/flux-reports`, CFD, lead time, throughput semanais) como visão org/portfólio; faixa de métricas no board onde já existir (ex.: strip de execução). |

### Demo padrão (onboarding)

- **Template inicial:** `projetos` (fluxo Backlog → Planejado → Execução → Revisão → Concluído) com **WIP sugerido** nas colunas de trabalho ativo.
- **Metodologia inicial sugerida:** **Kanban** (alinhado ao ICP de fluxo contínuo; Scrum continua disponível).
- **Lean Six Sigma:** continua a usar o snapshot DMAIC existente no wizard.

**Métrica de sucesso (produto):** % de boards com ao menos uma coluna com `wipLimit` + uso de ordenação/topo (alinhado ao RFC).

---

## 3. Jornada Flux Forms → classificação → coluna / automação

### Passos da jornada (estado alvo)

1. **Formulário público** (`intakeForm`: slug, título, coluna de destino padrão `targetBucketKey`).
2. **Submissão** cria card no bucket válido (fallback seguro se a coluna não existir — ver `app/api/forms/[slug]/route.ts`).
3. **Classificação** (manual ou assistida): labels, prioridade, triagem; opcionalmente **auto-triage** (`/api/boards/[id]/auto-triage`) quando políticas da org permitem.
4. **Automação:** regras “card criado / label / movimento” → mover para coluna sugerida, notificar responsável, criar follow-up (builder em `components/automations/*`).

### Critérios de sucesso mensuráveis

| KPI | Definição | Meta inicial (exemplo) |
|-----|-----------|-------------------------|
| **Ativação do form** | Board com `intakeForm.enabled` e slug publicável | Crescente; revisar por cohort |
| **Form → card** | Submissão válida que cria card | Taxa de erro abaixo de 1% em submissões válidas |
| **Form → movimento em 24–48h** | Card criado via form com `bucket` ou `order` alterado no período | ≥ X% (definir X por baseline após 30 dias de dados) |
| **Fecho do laço com automação** | Regra ativa com trigger “card criado” ou “label” ligada ao intake | ≥ 1 regra demoável por board “intake maduro” |

---

## 4. Pacote de inteligência operacional: digest, anomalias e brief executivo

Tratar **digest**, **detecção de anomalias** e **brief executivo** como um único **pacote** (“o board explica o que mudou e o que precisa de atenção”), distinto de dashboards passivos.

### Limites (custo e ruído)

- **Anomalias:** filtros por tipo (`lib/anomaly-board-settings.ts`: `notifyKinds`, `minSeverity`), dedupe de e-mail (`buildAnomalyNotifyDedupeKey`), opt-out por board (`emailEnabled: false`).
- **IA / LLM:** respeitar quotas e planos já documentados no README; não expandir escopo para “IA genérica fora do contexto do board”.
- **Digest / brief:** frequência e escopo ligados ao board ou org — evitar spam; priorizar resumos acionáveis.

### Explicabilidade (“por que isto?”)

- Anomalias devem carregar **diagnóstico estruturado** (`diagnostics` no payload) quando existir: coluna, IDs, janela temporal.
- Sugestões de ação (`lib/anomaly-suggested-action.ts`) como **próximo passo opcional**, não como verdade absoluta.

### Uso orientado a ação

Cada saída do pacote deve terminar com **uma pergunta ou ação** explícita: mover card, revisar WIP, desbloquear, convocar refinamento — e links diretos para o contexto no board ou em **Inteligência do board** (`/board/[id]/intelligence`).

---

## 5. Integrações cirúrgicas: GitHub, GitLab e API pública

Objetivo: **estender o fluxo** do ICP, não fechar paridade com Jira.

### Casos de uso priorizários

1. **Card ↔ branch/PR/MR:** identificador do card no branch/título/descrição; eventos de merge fecham o laço de entrega no quadro.
2. **Webhook inbound:** validação de assinatura, dedupe, atualização de estado do card com **log auditável**.
3. **API pública v1:** CRUD mínimo de boards/cards/comentários/sprints para automações internas (CI, bot interno), com **escopos** e **rate limit** — ver [public-api-v1.md](../public-api-v1.md).

### Fora do escopo curto (explícito)

- Replicação completa de workflow Jira, campos customizados arbitrários via API, ou marketplace de integrações.
- Sincronização bidirecional de comentários com GitHub Issues como sistema de tickets enterprise.

Detalhes técnicos v1: [integrations-git-v1.md](../integrations-git-v1.md).

---

## Referências rápidas no repositório

| Tema | Onde |
|------|------|
| WIP / buckets metodologia | `lib/board-methodology.ts`, `lib/board-wip.ts` |
| Onboarding / demo colunas | `lib/onboarding.ts`, `app/onboarding/page.tsx` |
| Forms intake | `app/api/forms/[slug]/route.ts`, `lib/forms-intake.ts` |
| Auto-triage | `app/api/boards/[id]/auto-triage/route.ts`, `lib/smart-auto-triage.ts` |
| Relatórios / lead time | `app/api/flux-reports/route.ts`, `components/reports/flux-reports-dashboard.tsx` |
| Anomalias / notificações | `lib/anomaly-board-settings.ts`, `lib/anomaly-service.ts` |

---

## 6. Fases do plano estratégico (execução)

| Fase | Foco | Entregas no repositório |
|------|------|-------------------------|
| **A — Clareza** | ICP, narrativa, anti-posicionamento | Secções 1 e 5 deste doc; link no README e no RFC. |
| **B — Moat de fluxo** | WIP, ordem, métricas, intake | Onboarding padrão (`lib/onboarding.ts`, `app/onboarding/page.tsx`); hub Relatórios acessível a partir do board; modal **Flux Forms** (`components/kanban/board-intake-forms-modal.tsx`). |
| **C — Inteligência** | Digest, anomalias, brief como pacote | Copy e hints na página de inteligência e no modal de brief; limites documentados na secção 4. |
| **D — Integrações** | Git + API enxutos | `docs/integrations-git-v1.md`, `docs/public-api-v1.md` e secção 5. |

### Histórias de vitória mensuráveis (exemplos para vendas e CS)

1. **“Idade média em ‘Em análise’ desceu X%”** — WIP + política na coluna + relatório de colunas.
2. **“Form público → primeiro movimento no board em menos de 48h”** — intake ativo + automação de triagem.
3. **“Gestores abrem digest/brief e agem”** — retenção semanal da superfície de inteligência (produto + e-mail).

### Métricas de sucesso (organização / produto)

- % de boards com **pelo menos uma coluna com WIP**.
- Uso de **ordenar / fixar no topo** no backlog.
- **Conversão** Form → card → movimento em 24–48h.
- **Retenção semanal** de gestores em digest, brief ou alertas (abrir ou ação).

### Checklist — demo Flux Forms em menos de 5 minutos

1. Abrir o board → **Configurações** → **Flux Forms (intake público)**.
2. Definir slug (≥3 caracteres), título, coluna padrão e salvar.
3. Copiar o link público e submeter um pedido de teste.
4. Confirmar o card na coluna esperada.
5. Abrir **Automações** → adicionar regra com gatilho **“Novo envio Flux Forms”** → ação (mover / etiquetar / notificar) → guardar.
