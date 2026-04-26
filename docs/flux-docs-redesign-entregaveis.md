# Flux Docs — Entregáveis de planejamento (redesign)

Documento consolidado para os itens **diagnostico-ux**, **blueprint-ui**, **integracao-board**, **dados-api** e **roadmap-fases**. Não substitui o plano de alto nível; formaliza diagnóstico, blueprint, integração, dados/APIs e fases executáveis.

**Referências de código:** [`app/docs/page.tsx`](app/docs/page.tsx), [`components/docs/docs-sidebar-tree.tsx`](components/docs/docs-sidebar-tree.tsx), [`components/docs/docs-editor.tsx`](components/docs/docs-editor.tsx), [`components/kanban/card-modal-tabs/card-doc-refs-panel.tsx`](components/kanban/card-modal-tabs/card-doc-refs-panel.tsx), [`components/kanban/card-modal-context.tsx`](components/kanban/card-modal-context.tsx), [`lib/docs-types.ts`](lib/docs-types.ts), [`lib/kv-docs.ts`](lib/kv-docs.ts), [`app/api/docs`](app/api/docs), [`components/command-palette/command-palette.tsx`](components/command-palette/command-palette.tsx).

---

## 1. Diagnóstico UX — experiência atual e gaps críticos

### 1.1 Mapa da jornada atual

| Área | O que existe hoje | Onde vive |
|------|-------------------|-----------|
| **Hub de docs** | Página dedicada com header, árvore lateral, painel de geração IA, busca e editor (rich + preview, autosave). | `app/docs/page.tsx`, `docs-editor.tsx` |
| **Navegação global** | Link para `/docs` na sidebar inteligente e uma entrada estática no command palette (“ir para docs”). | `sidebar-intelligence.tsx`, `command-palette.tsx` |
| **Modelo mental de pasta** | Árvore por `parentId`, mas a UI só **renderiza dois níveis** (raiz + filhos diretos). Subárvores mais profundas não aparecem na lateral. | `docs-sidebar-tree.tsx`, `listDocsTree` em `kv-docs.ts` |
| **Busca** | Campo com debounce; resultados são lista clicável que seleciona o doc. Sem filtros de escopo (projeto/board). | `page.tsx`, `GET /api/docs/search` |
| **Board ↔ docs** | `docRefs` no card (persistido com o card); aba no modal com busca e chips; no corpo do card só indica **contagem** de docs vinculados. | `card-doc-refs-panel.tsx`, `card-modal-context.tsx`, `kanban-card-body.tsx` |
| **Capacidades backend “escondidas”** | Ex.: resumo de doc para descrição do card (`summarize-to-card`), geração a partir do board, pipeline, reindex — nem todas têm superfície de produto equivalente ao valor que entregam. | `app/api/docs/*` |

### 1.2 Gaps críticos de entendimento e usabilidade

1. **Contexto espacial ausente:** o usuário edita docs no **nível da organização**, sem “estou neste projeto/board” embutido na UI. Isso quebra o modelo “Control Center do projeto” e dificulta saber o que é genérico vs. operacional.
2. **Hierarquia enganosa:** dados permitem árvore N-níveis; a lateral mostra só dois. Usuários podem perder docs “netos” ou achar que o produto não suporta profundidade.
3. **Integração board é reativa, não proativa:** vincular docs é possível, mas não há **backlinks** no doc, **atalhos no fluxo do board** (ex.: “docs deste board”), nem ações de primeira classe tipo “abrir doc a partir do card” com um clique óbvio.
4. **Busca sem relevância situacional:** `searchDocs` usa índice de texto Mongo ou heurística KV por termos; **não há boost por board/projeto/card atual**, nem sinônimos de contexto de execução.
5. **Sobrecarga cognitiva no eixo central:** geração IA, busca e editor competem verticalmente na mesma coluna; falta um **painel contextual fixo** que agrupe vínculos, status e próximas ações.
6. **Command palette genérico:** uma rota para docs não aproveita o padrão “Linear-like” de ações contextuais (criar doc de reunião, filtrar por board aberto, vincular ao card selecionado).

### 1.3 Riscos de adoção

- Docs permanecem “módulo paralelo” ao trabalho diário no kanban.
- Usuários power criam estrutura profunda que a UI não revela integralmente.
- Busca retorna ruído quando o acervo cresce, sem âncoras de projeto/board.

---

## 2. Blueprint UI — layout premium em 3 painéis, sistema visual e ícones

### 2.1 Arquitetura de layout (shell)

| Painel | Função principal | Conteúdo mínimo viável (MVP visual) |
|--------|------------------|-------------------------------------|
| **Esquerda (~280–320px, redimensionável)** | Navegação e estrutura | Árvore **recursiva** (ou lista indentada virtualizada), DnD de reordenação/parentagem, ações inline (novo, arquivar, duplicar), indicador de escopo (workspace/projeto/board) quando existir no modelo. |
| **Centro (flex)** | Conteúdo | Cabeçalho do doc: título, breadcrumb, estado de sync/autosave, tags/tipo. Corpo: editor + preview (split ou tabs), com transições leves já alinhadas ao `DocsEditor`. |
| **Direita (~320–400px, colapsável)** | Inteligência operacional | Abas ou seções: **Vínculos** (cards, boards, projetos), **Atividade** (últimas edições se houver telemetria), **IA** (gerar, resumir, sugerir links) espelhando capacidades já expostas na API onde fizer sentido. |

**Cabeçalho global da página (acima dos 3 painéis):** breadcrumb (`Org > Projeto? > Board? > Doc`), busca unificada com pill de escopo, botões de ação rápida (novo doc a partir de template, comando ⌘K contextual).

### 2.2 Sistema visual (alinhamento ao app shell)

- **Tokens:** reutilizar superfícies e bordas já usadas na sidebar/docs (`--flux-surface-mid`, `--flux-chrome-alpha-*`, `--flux-primary-alpha-*`) para evitar “segundo produto”.
- **Hierarquia tipográfica:** título do doc (semibold, escala do header), metadados em `text-xs` / muted, painel direito com **cards** de informação (não parede de texto).
- **Estados:** saved/saving/error já existentes no editor; estender com **badge de “vinculado a N cards”** e freshness (quando `updatedAt` e regras de negócio existirem).
- **Densidade:** árvore compacta com hover states consistentes com `DocsSidebarTree` (variante minimal vs. gradient), porém com suporte a profundidade e foco por teclado.

### 2.3 Ícones Flux Docs (conjunto proposto)

Manter `IconDocs` na sidebar como âncora; adicionar **sub-glyps semânticos** (Lucide ou SVGs locais no padrão dos ícones existentes em `components/sidebar/icons/`):

| Conceito | Uso na UI |
|----------|-----------|
| Documento genérico | Doc raiz / padrão |
| Pasta / coleção | Agrupamento ou projeto |
| Board-linked | Doc com `boardIds` |
| Card-linked | Seção de backlinks de cards |
| Template | Biblioteca de modelos (briefing, ata, PRD, retro, decisão) |
| IA / sparkle | Ações de co-piloto |
| Freshness / relógio | Alerta de desatualização |
| Link bidirecional | Backlinks |

**Princípio:** mesma espessura de traço e tamanho base `h-4 w-4` na navegação; ícones maiores apenas em empty states.

---

## 3. Integração operacional profunda — docs ↔ cards ↔ board

### 3.1 Princípios

- **Bidirecionalidade:** todo vínculo card→doc deve ser recuperável como doc→card (backlink), com permissões respeitando acesso ao board.
- **Contexto do dia:** ações aparecem onde o usuário está (board aberto, card aberto, doc aberto), não só na página de docs.
- **Ações únicas:** cada ação mapeia a um endpoint ou mutação já existente quando possível, evitando duplicar lógica.

### 3.2 Fluxos desenhados

| Fluxo | Gatilho (UI) | Comportamento |
|-------|---------------|---------------|
| **Anexar doc ao card** | Aba atual no modal + busca | Mantém `docRefs`; melhorar com preview, abrir doc em nova aba/panel slide. |
| **Abrir doc do card** | Chip/link no card body e no modal | Deep-link `/{locale}/docs?docId=` + opcional `boardId` para contexto. |
| **Resumir doc → card** | Botão na aba de docs ou no painel direito do editor | `POST /api/docs/[id]/summarize-to-card` (já exige `boardId` + `cardId`). |
| **Gerar doc a partir do board** | Command palette + botão no board | `generate-from-board` / pipeline já existentes; entrada explícita no board header ou menu “…” . |
| **Docs do board** | Command palette + sidebar contextual | Lista docs filtrados por `boardIds` (após evolução de dados); atalho “ver docs deste board”. |
| **Criar card a partir do trecho** (médio prazo) | Seleção no editor + “criar card” | Novo contrato: snippet, título sugerido, `boardId` default = board atual. |

### 3.3 Superfícies de UI prioritárias

1. **Card modal:** elevar doc refs a linha de **“documentação”** com links clicáveis e ação “resumir neste card”.
2. **Kanban card:** além da contagem, **primeiro título** ou ícone + tooltip com lista.
3. **Board chrome:** strip opcional “N docs ligados a este board” (agregação via índice reverso ou query por `boardIds`).
4. **Docs hub:** painel direito sempre mostra **cards que referenciam este doc** (derivado de scan de `docRefs` nos boards da org ou de índice mantido incrementalmente).

### 3.4 Considerações de permissão e performance

- Agregação doc→cards exige **leitura de boards da org** ou materialização em coleção auxiliar; para escala, preferir **índice de backlinks** atualizado em webhook de save de card/board.
- `summarize-to-card` e gerações devem respeitar os mesmos gates de plano (`flux_docs`, `flux_docs_rag`) já usados nas rotas.

---

## 4. Evolução de modelo de dados e APIs — contexto e busca

### 4.1 Extensão do modelo `DocData` (proposta)

Campos adicionais conceituais (nomes indicativos):

| Campo | Tipo | Objetivo |
|-------|------|----------|
| `projectId` | `string \| null` | Escopo de projeto quando existir entidade de projeto no produto. |
| `boardIds` | `string[]` | Doc “pertence” ou é prioritário nestes boards. |
| `linkedCardIds` | `string[]` | Opcional: cache denormalizado de cards que referenciam o doc (ou manter só via índice reverso). |
| `docType` | enum string | `briefing \| minutes \| decision \| prd \| retro \| general` para templates e filtros. |
| `ownerUserId` | `string \| null` | Governança (“owner” do doc). |
| `freshnessPolicy` | opcional | SLA ou `reviewBy` para indicadores de saúde (fase 3). |

**Migração:** defaults não quebram clientes atuais (`boardIds: []`, `docType: 'general'`). Índices Mongo sugeridos: `{ orgId: 1, projectId: 1, updatedAt: -1 }`, `{ orgId: 1, boardIds: 1 }`, texto composto existente mantido.

### 4.2 APIs: evolução por rota

| Rota / área | Mudança proposta |
|-------------|------------------|
| `GET /api/docs` | Aceitar `?projectId=&boardId=` para **filtrar árvore** ou reordenar roots relevantes primeiro. |
| `GET /api/docs/search` | Query params: `q`, `projectId`, `boardId`, `docType`, `limit`. Implementar **boost**: match textual base + peso por overlap de `boardIds`/`projectId` com o contexto da requisição (header ou query). |
| `POST /api/docs` | Body opcional: `projectId`, `boardIds`, `docType` para criação contextual a partir do board. |
| `PUT /api/docs/[id]` | Permitir atualizar metadados de contexto e tags. |
| Nova rota opcional | `GET /api/docs/[id]/backlinks` — lista cards/boards que referenciam o doc (com cache). |
| Reindex / chunks | Manter `syncDocChunksFromDocument`; se houver busca semântica vetorial no futuro, **unificar** ranking híbrido (BM25/texto + vetor + contexto). |

### 4.3 Relevância de busca (“semântica situacional”)

**Curto prazo (sem vetor):** reordenar resultados de `searchDocs` com função de score: `textScore * (1 + α * contextBoost)`, onde `contextBoost` soma pesos se `boardId` ∈ `doc.boardIds`, se `projectId` bate, ou se o doc está em `docRefs` de cards do board atual (se passado).

**Médio prazo:** embeddings por chunk (infra já encostada em `kv-doc-chunks`) com filtro por `orgId` e metadados `boardIds`/`projectId` no payload do chunk para **similaridade + filtro** conjunto.

---

## 5. Roadmap por fases — quick wins e médio prazo

### 5.1 Fase A — Quick wins (1–2 sprints, alto impacto percebido)

| Entrega | Impacto no usuário | Notas |
|---------|-------------------|--------|
| Árvore recursiva + indentação consistente | Encontrar e organizar docs sem surpresas | Corrige gap estrutural da UI vs. dados |
| Deep-link `?docId=` na página de docs | Abrir doc a partir do card/board | Melhora fluxo diário imediato |
| Painel direito mínimo: vínculos e backlinks básicos | Docs “sentem” integrados | Pode começar read-only com agregação simples |
| Command palette: “Docs deste board”, “Novo doc” | Descoberta sem navegação manual | Usa `boardId` do contexto da rota quando disponível |
| Card: chips clicáveis para abrir doc | Reduz atrito entre kanban e docs | |

### 5.2 Fase B — Médio prazo (integração operacional completa)

| Entrega | Impacto |
|---------|---------|
| DnD na árvore + move API já existente | Organização visual = modelo mental |
| Metadados `boardIds` / `projectId` / `docType` + filtros na busca | Contexto e menos ruído |
| Índice ou endpoint de backlinks performático | Doc como hub de rastreabilidade |
| Expor “resumir no card” e “gerar do board” na UI com fluxos guiados | Adoção das APIs já prontas |
| Templates por `docType` | Velocidade para rituais (ata, PRD, retro) |

### 5.3 Fase C — Inteligência e governança (horizonte)

| Entrega | Impacto |
|---------|---------|
| Painel de saúde documental (stale, sem owner) | Reduz risco operacional |
| Busca híbrida vetorial + textual | Relevância em acervo grande |
| IA com trilha de evidências (citações por chunk) | Confiança em sugestões |
| Multi-select e ações em lote na árvore | Escala para admins |

### 5.4 Ordenação por valor vs. esforço (resumo)

1. **Primeiro:** árvore real + deep links + chips clicáveis (baixa complexidade, corrige confusão grave).
2. **Em seguida:** metadados de contexto + busca com boost (média complexidade, alinha produto ao modelo de 3 camadas).
3. **Depois:** backlinks materializados + painel rico + templates (média–alta, eleva o hub).
4. **Por último:** governança e RAG híbrido avançado (infra + produto).

---

## 6. Critérios de sucesso (mensuráveis)

- Tempo médio para **abrir um doc referenciado por um card** (cliques).
- % de cards com `docRefs` em boards ativos (adoção).
- Resultados de busca clicados no **top 3** com contexto de board vs. sem contexto (qualidade percebida).
- Redução de incidentes de “doc sumiu” (árvore profunda visível).

---

*Última atualização: alinhada ao código do repositório na data de elaboração deste documento.*
