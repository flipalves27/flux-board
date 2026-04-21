# Flux-Board — Roadmap de 10 Novas Features com IA

> **Status:** Proposta / Planejamento
> **Versão:** 1.0
> **Branch:** `claude/plan-ai-features-tmSqD`
> **Stack alvo:** Next.js 15 · React 19 · Claude (Anthropic) + Together AI · Tailwind (Flux tokens) · Framer Motion · dnd-kit · Recharts · Zustand · MongoDB

## Contexto

O Flux-Board já possui uma base sólida de IA (Card Writer, Daily Insights, Anomaly Detection, Executive Brief, Docs RAG, Forms Auto-Triage, Meeting Summaries, Automation AI). Este roadmap propõe **10 novas features inovadoras, visuais e elegantes**, construídas sobre a infraestrutura existente (`lib/org-ai-routing.ts`, `lib/llm-provider.ts`) e respeitando o Flux Design System (CSS tokens + Framer Motion).

Cada feature segue quatro princípios:
1. **Inteligente:** usa LLM multimodal, embeddings ou heurísticas para gerar valor real.
2. **Visual:** interface rica (gráficos, grafos, heatmaps, animações) — não apenas texto.
3. **Moderna:** micro-interações, streaming, tokens de design, dark-mode nativo.
4. **Elegante:** integra-se ao fluxo existente sem poluir — aparece quando útil.

---

## Matriz de Priorização

| # | Feature | Impacto | Esforço | Plano | Provedor IA |
|---|---------|---------|---------|-------|-------------|
| 1 | Vision Board (foto → cards) | 🟢 Alto | 🟡 Médio | Pro | Claude multimodal |
| 2 | Predictive Sprint Planner | 🟢 Alto | 🟡 Médio | Business | Claude + heurística |
| 3 | Smart Dependency Graph | 🟢 Alto | 🟡 Médio | Pro | Embeddings + Claude |
| 4 | Voice Copilot (Fluxy Voice) | 🟡 Médio | 🔴 Alto | Business | Whisper + Claude |
| 5 | AI Retro Facilitator | 🟢 Alto | 🟢 Baixo | Pro | Claude |
| 6 | Workload Heatmap Balancer | 🟢 Alto | 🟡 Médio | Pro | Claude |
| 7 | Project Template Genesis | 🟡 Médio | 🟢 Baixo | Free+ | Together (fallback) |
| 8 | Async Standup Weaver | 🟢 Alto | 🟢 Baixo | Pro | Claude |
| 9 | Risk Radar | 🟡 Médio | 🟡 Médio | Business | Claude + análise |
| 10 | Smart Story Splitter | 🟢 Alto | 🟢 Baixo | Pro | Claude |

---

## 1. Vision Board — "Foto vira Kanban"

**Problema:** Times fazem brainstormings em quadros brancos, post-its e cadernos — mas perdem horas transcrevendo.

**Solução:** Upload de foto (ou colar do clipboard) de whiteboard/post-its. Claude multimodal identifica colunas, cards e agrupamentos. Uma animação de "escaneamento" mostra cada post-it sendo detectado e transformado em card Flux.

**UX visual:**
- Drop-zone com efeito de "raio-x" sobre a imagem (Framer Motion + mask).
- Cards detectados aparecem um a um com confetti sutil.
- Painel lateral para confirmar/editar antes de salvar.
- Badges coloridos por confiança da IA (verde >90%, amarelo <70%).

**Arquivos a criar:**
- `app/api/boards/[id]/ai-vision-board/route.ts` — upload + Claude `image` content block.
- `components/kanban/vision-board-importer.tsx` — UI de importação.
- `lib/ai-vision-parser.ts` — prompt + schema JSON (colunas/cards).

**Gating:** Pro+ (usa créditos de IA).

---

## 2. Predictive Sprint Planner — "Velocity Oracle"

**Problema:** Planning Poker é subjetivo. Gestores não sabem se cabe tudo no sprint.

**Solução:** Ao abrir o Sprint Planner, a IA analisa velocity histórico, complexidade dos cards (via embedding + LLM) e carga da equipe. Gera um **forecast probabilístico** com três cenários (otimista/realista/pessimista) visualizados em um gráfico de Monte Carlo animado.

**UX visual:**
- Gráfico de área tripla (Recharts) com gradiente `flux-primary`.
- Slider "Arraste para simular: se remover este card, probabilidade sobe para 87%".
- Badge "🎯 Confiança 72%" no cabeçalho do sprint.
- Animação de dados rolando (estilo dashboard) ao recalcular.

**Arquivos a criar:**
- `app/api/boards/[id]/sprint-forecast/route.ts`
- `components/sprint/velocity-oracle.tsx`
- `lib/sprint-forecaster.ts` — Monte Carlo + LLM para ajuste qualitativo.

**Gating:** Business.

---

## 3. Smart Dependency Graph — "Fluxo Interdependente"

**Problema:** Cards dependem uns dos outros mas essa relação fica escondida em descrições.

**Solução:** A IA lê descrições de todos os cards via embeddings + Claude e detecta dependências implícitas ("bloqueia", "precisa de", "depende de"). Exibe como **grafo interativo force-directed** (reuso do Xyflow já instalado para BPMN).

**UX visual:**
- Grafo fullscreen com nós arrastáveis, bordas animadas (pulse) em dependências críticas.
- Código de cor: caminho crítico em `flux-warning`, caminhos paralelos em `flux-accent`.
- Tooltip IA: "Este card bloqueia 3 outros — priorize".
- Botão "Reorganizar caminho crítico" que reagenda via LLM.

**Arquivos a criar:**
- `app/api/boards/[id]/ai-dependencies/route.ts`
- `components/kanban/dependency-graph-view.tsx` (Xyflow)
- `lib/dependency-detector.ts` — embeddings + pairwise ranking.

**Gating:** Pro+.

---

## 4. Fluxy Voice — "Copilot por Voz"

**Problema:** Mãos ocupadas em reuniões ou caminhando.

**Solução:** Integração de voz no dock do Fluxy (já existente em `components/fluxy/`). Botão microfone → transcrição via Whisper (Together AI compatível) → Claude interpreta intenção → ação executada com feedback visual e auditivo.

**UX visual:**
- Orb animado (Framer Motion + SVG) que pulsa conforme volume do áudio.
- Onda de áudio estilizada com gradiente Flux durante gravação.
- Card "falado" aparece com efeito typewriter.
- Modo hands-free com wake word "Ei Fluxy".

**Comandos de exemplo:**
- *"Crie card 'revisar PR do billing' para o João no sprint atual"*
- *"Mova 'login OAuth' para concluído"*
- *"Quantos cards estão bloqueados?"*

**Arquivos a criar:**
- `components/fluxy/voice-orb.tsx`
- `app/api/fluxy/voice/route.ts` — Whisper → Claude tool-use.
- `lib/voice-intent-router.ts`.

**Gating:** Business (custo de Whisper).

---

## 5. AI Retro Facilitator — "Retrospectiva Inteligente"

**Problema:** Retros são manuais, repetitivas e raramente geram ação.

**Solução:** Ao encerrar sprint, a IA analisa: velocity, anomalias detectadas, comentários dos cards, reabertos, atrasados. Gera uma **retro visual** com 4 quadrantes (Went Well / Didn't / Learn / Action) + insights preditivos.

**UX visual:**
- Layout de 4 quadrantes com bordas em gradiente animado.
- Cada insight tem um "sentimento" (emoji + cor) via análise de tom nos comentários.
- Heatmap de humor do time ao longo do sprint (Recharts).
- Botão "Gerar ações" cria cards automaticamente no próximo sprint.

**Arquivos a criar:**
- `app/api/boards/[id]/ai-retrospective/route.ts`
- `components/sprint/ai-retro-facilitator.tsx`
- `lib/retro-analyzer.ts` — consolida sinais + prompt estruturado.

**Gating:** Pro+.

---

## 6. Workload Heatmap Balancer — "Balanceador Visual"

**Problema:** Alguns membros ficam sobrecarregados enquanto outros estão ociosos.

**Solução:** Visualização heatmap (tipo GitHub contribution) mostrando carga por pessoa × semana. Claude sugere rebalanceamentos com drag-and-drop assistido.

**UX visual:**
- Grid heatmap com cores `flux-success` → `flux-danger`.
- Ao passar o mouse: mini-calendário com cards daquela semana.
- Sugestões de IA aparecem como "ghost cards" (tracejado) mostrando onde mover.
- Animação de transição suave ao aceitar sugestão.

**Arquivos a criar:**
- `app/api/boards/[id]/ai-workload/route.ts`
- `components/dashboard/workload-heatmap.tsx`
- `lib/workload-balancer.ts`.

**Gating:** Pro+.

---

## 7. Project Template Genesis — "Gênese de Projeto"

**Problema:** Começar um projeto do zero é trabalhoso — escolher colunas, cards, labels.

**Solução:** Campo único: *"Descreva seu projeto em uma frase"*. Ex: *"Lançamento do app mobile de pagamentos"*. A IA gera: colunas, 15-30 cards com acceptance criteria, labels, milestones, OKRs sugeridos.

**UX visual:**
- Wizard tela-cheia com fundo estrelado animado (particles sutis).
- Cards aparecem em cascata (staggered animation via Framer Motion).
- Preview 3D "tilt" do board antes de criar.
- Seletor de estilo: Ágil/Lean/Waterfall (muda template gerado).

**Arquivos a criar:**
- `app/[locale]/boards/new-ai/page.tsx` — wizard.
- `app/api/boards/ai-genesis/route.ts`
- `lib/template-genesis.ts`.

**Gating:** Free com limite 1/mês, Pro ilimitado. Usa Together (fallback) para free tier.

---

## 8. Async Standup Weaver — "Daily Tecida por IA"

**Problema:** Daily standups tomam tempo e perdem informação quando alguém falta.

**Solução:** A IA observa a atividade do board (cards movidos, comentários, commits via webhook) e gera automaticamente um resumo **"ontem / hoje / bloqueios"** por pessoa às 9h. Entregue via email + painel dedicado.

**UX visual:**
- Painel tipo "Stories" (horizontal scroll) com avatar + resumo de cada membro.
- Cada card tem animação de "tecer" (path drawing SVG) ao carregar.
- Bloqueios aparecem com ícone pulsante `flux-warning`.
- Reagir com emoji sem abrir card.

**Arquivos a criar:**
- `app/api/cron/async-standup/route.ts` (vercel.json cron).
- `components/dashboard/standup-weaver.tsx`
- `lib/standup-synthesizer.ts`.

**Gating:** Pro+.

---

## 9. Risk Radar — "Radar de Risco 360°"

**Problema:** Riscos de projeto são identificados tarde demais.

**Solução:** Gráfico radar (Recharts) com 6 dimensões: Prazo, Escopo, Qualidade, Equipe, Dependências, Orçamento. Claude avalia cada eixo usando sinais do board + explica em linguagem natural.

**UX visual:**
- Radar com área preenchida em gradiente Flux.
- Clicar em um eixo abre drawer com explicação IA + cards relacionados.
- Comparativo "radar fantasma" (semana passada vs atual).
- Animação de "pulso" nos eixos em zona vermelha.

**Arquivos a criar:**
- `app/api/boards/[id]/ai-risk-radar/route.ts`
- `components/dashboard/risk-radar.tsx`
- `lib/risk-analyzer.ts`.

**Gating:** Business.

---

## 10. Smart Story Splitter — "Fatiador Inteligente"

**Problema:** Stories grandes (epic-sized) entopem o sprint e escondem complexidade.

**Solução:** Botão "✂️ Fatiar com IA" em qualquer card. Claude aplica técnicas INVEST/SPIDR e gera 2-8 sub-stories com acceptance criteria, exibidas em **árvore hierárquica** animada.

**UX visual:**
- Modal com splitpane: original à esquerda, árvore à direita.
- Nós da árvore expansíveis com animação "unfold".
- Cada sub-story tem estimativa de pontos (badge) e dependências visuais.
- Botão "Aplicar" substitui o original e cria links parent-child.

**Arquivos a criar:**
- `app/api/cards/[id]/ai-split/route.ts`
- `components/kanban/story-splitter-modal.tsx`
- `lib/story-splitter.ts` — prompt com técnicas SPIDR.

**Gating:** Pro+.

---

## Arquitetura Transversal

### Componente compartilhado: `<AiStreamingResponse />`
Todas as features usam streaming (Server-Sent Events ou `ReadableStream`) para feedback em tempo real. Criar em `components/ai/ai-streaming-response.tsx` com:
- Skeleton shimmer durante espera.
- Cursor piscante estilo ChatGPT.
- Fallback gracioso quando cota excedida.

### Roteamento de Provedor
Reusar `lib/org-ai-routing.ts` — admins/whitelist → Claude, resto → Together. Novas features respeitam `org.aiSettings.claudeUserIds` e rate limits.

### Feature Flags
Adicionar em `lib/plan-gates.ts`:
```ts
AI_VISION_BOARD, AI_VELOCITY_ORACLE, AI_DEPENDENCY_GRAPH,
AI_VOICE_COPILOT, AI_RETRO, AI_WORKLOAD, AI_GENESIS,
AI_STANDUP, AI_RISK_RADAR, AI_STORY_SPLITTER
```
Cada flag checa plano + quota.

### Telemetria
Nova coleção `ai_feature_events` no MongoDB: `{ userId, orgId, feature, tokensIn, tokensOut, latencyMs, success, createdAt }`. Alimenta painel admin.

### Design Tokens Novos
```css
--flux-ai-gradient: linear-gradient(135deg, var(--flux-primary), var(--flux-accent));
--flux-ai-glow: 0 0 24px rgba(var(--flux-primary-rgb), 0.4);
--flux-ai-shimmer: /* animação gradient */;
```

---

## Fases de Entrega Sugeridas

**Fase 1 (4 semanas) — Quick wins:**
- Feature 7 (Genesis) — reusa Card Writer.
- Feature 5 (Retro) — reusa daily insights.
- Feature 10 (Splitter) — prompt simples.

**Fase 2 (6 semanas) — Visual forte:**
- Feature 1 (Vision Board) — diferencial de marketing.
- Feature 3 (Dependency Graph) — reusa Xyflow.
- Feature 6 (Workload Heatmap).

**Fase 3 (6 semanas) — Alto valor:**
- Feature 2 (Velocity Oracle).
- Feature 8 (Async Standup).
- Feature 9 (Risk Radar).

**Fase 4 (4 semanas) — Premium:**
- Feature 4 (Voice Copilot) — mais caro e complexo.

---

## Métricas de Sucesso

- **Adoção:** % usuários ativos que usam pelo menos 1 feature IA/semana.
- **Retenção:** uplift em D30/D90 para orgs com IA ativa.
- **Receita:** conversão free → pro atribuída a features Pro-gated.
- **Qualidade IA:** taxa de aceitação de sugestões (accept/dismiss).
- **Custo:** tokens/usuário/mês dentro do budget por plano.

---

## Riscos & Mitigações

| Risco | Mitigação |
|-------|-----------|
| Custo de LLM explode | Rate limits por org, cache de embeddings, Together como fallback |
| Respostas incorretas | Badges de confiança, sempre pedir confirmação antes de ação destrutiva |
| Latência alta | Streaming SSE + skeletons, pré-processamento em background |
| LGPD / privacidade | Nunca enviar PII para LLMs; redigir antes de prompt |
| Acessibilidade | Todas animações respeitam `prefers-reduced-motion` |

---

## Próximos Passos

1. Revisar prioridades com stakeholders.
2. Aprovar Fase 1 para prototipagem.
3. Criar protótipos de UI no Figma seguindo Flux Design System.
4. Abrir RFC técnico para cada feature aprovada.
