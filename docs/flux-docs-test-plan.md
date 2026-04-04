# Flux Docs Test Plan

## API
- `GET /api/docs` returns docs tree for authenticated org user.
- `POST /api/docs` creates a root doc and returns `201`.
- `GET /api/docs/[id]` returns specific doc.
- `PUT /api/docs/[id]` updates title/content and bumps `updatedAt`.
- `POST /api/docs/[id]/move` changes `parentId`.
- `GET /api/docs/search?q=foo` returns ranked matches.
- `DELETE /api/docs/[id]` archives doc and keeps children accessible at root.

## UI
- Open `/docs` and verify docs tree is visible.
- Create root doc and child doc from sidebar.
- Edit title/content and confirm autosave state transitions to `Salvo` (or localized “Saved”).
- Use **Salvar agora / Save now** and confirm save completes without waiting for the debounce.
- In **Editar / Edit**, use the formatting toolbar (headings, lists, task list, quote, code block, link, table) and confirm content persists after refresh.
- Switch to **Visualizar / Preview** and confirm Markdown renders (including tables and task lists when present).
- **Exportar .md / Export .md** downloads a file; **Importar .md / Import .md** replaces content after confirmation when the body is non-empty.
- Expand “Como usar / How to use” and keyboard shortcuts `<details>`; dismiss the IA tip banner once and confirm it stays hidden (localStorage).
- Search docs and select a result.
- Delete selected doc and confirm tree refresh.

## Card Linking
- Open card modal and search docs in "Documentos vinculados".
- Attach one or more docs, save card, reopen modal, and verify refs persist.
- Verify card tile displays linked doc count.

## RAG Actions
- In Copilot, ask a question that matches docs content and verify response contains doc-grounded context.
- Call `POST /api/docs/generate-from-board` and verify generated doc is created.
- Call `POST /api/docs/generate-pipeline` (SSE) with flows `board_status`, `daily_minutes`, `okr_progress`, `free_prompt` and verify events `step` → `preview` → `done` and doc tags `ia-docs`.
- Call `POST /api/docs/[id]/summarize-to-card` and verify card description gets summary + `docRefs`.

## Flags and Metrics
- Set `FLUX_DOCS_ENABLED=false` and verify docs APIs return `403`.
- Set `FLUX_DOCS_RAG_ENABLED=false` and verify RAG endpoints return `403`.
- Verify server logs include `[docs-metrics]` lines for `docs.search`.
