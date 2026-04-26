"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DocData } from "@/lib/docs-types";
import type { DocsGenerationFlow } from "@/lib/docs-generation";
import { AiModelHint } from "@/components/ai-model-hint";

type BoardListItem = { id: string; name: string };

type PipelineStep = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
};

function parseEventStreamFrame(frame: string): { event: string; data: unknown } | null {
  const lines = frame.split("\n").filter(Boolean);
  if (!lines.length) return null;

  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key === "event") event = value;
    if (key === "data") dataLines.push(value);
  }

  const dataRaw = dataLines.join("\n");
  if (!dataRaw) return { event, data: {} };
  try {
    return { event, data: JSON.parse(dataRaw) };
  } catch {
    return { event, data: dataRaw };
  }
}

const FLOWS: { id: DocsGenerationFlow; title: string; description: string }[] = [
  {
    id: "board_status",
    title: "Board → Status report",
    description: "Cards, colunas e métricas de portfólio em um relatório executivo.",
  },
  {
    id: "daily_minutes",
    title: "Daily → Ata",
    description: "Transcrição e insights da Daily viram ata de reunião.",
  },
  {
    id: "okr_progress",
    title: "OKRs → Progress report",
    description: "Objetivos, KRs e projeções para o comitê.",
  },
  {
    id: "free_prompt",
    title: "Prompt livre",
    description: "Instruções suas + contexto real do board.",
  },
];

function quarterNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

type Props = {
  getHeaders: () => Record<string, string>;
  onDocCreated: (doc: DocData) => void;
  /** When opening from a board (e.g. from command palette), preselect this board. */
  initialBoardId?: string | null;
};

export function DocsGenerationPanel({ getHeaders, onDocCreated, initialBoardId = null }: Props) {
  const [open, setOpen] = useState(false);
  const [boards, setBoards] = useState<BoardListItem[]>([]);
  const [boardId, setBoardId] = useState("");
  const [flow, setFlow] = useState<DocsGenerationFlow>("board_status");
  const [quarter, setQuarter] = useState(quarterNow);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [transcript, setTranscript] = useState("");
  const [dailyInsightId, setDailyInsightId] = useState<string>("");
  const [dailyOptions, setDailyOptions] = useState<{ id: string; label: string }[]>([]);

  const [generating, setGenerating] = useState(false);
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [usedAi, setUsedAi] = useState<boolean | null>(null);
  const [lastPipelineLlmModel, setLastPipelineLlmModel] = useState<string | null>(null);

  const loadBoards = useCallback(async () => {
    const res = await fetch("/api/boards", { headers: getHeaders() });
    const data = (await res.json().catch(() => ({}))) as { boards?: BoardListItem[] };
    const list = Array.isArray(data.boards) ? data.boards : [];
    setBoards(list);
    setBoardId((prev) => prev || list[0]?.id || "");
  }, [getHeaders]);

  useEffect(() => {
    if (!open) return;
    void loadBoards();
  }, [open, loadBoards]);

  useEffect(() => {
    if (initialBoardId?.trim()) setBoardId((prev) => (prev === initialBoardId ? prev : initialBoardId!));
  }, [initialBoardId]);

  useEffect(() => {
    if (!open || flow !== "daily_minutes" || !boardId) {
      setDailyOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/boards/${encodeURIComponent(boardId)}`, { headers: getHeaders() });
      const b = (await res.json().catch(() => ({}))) as { dailyInsights?: { id?: string; createdAt?: string }[] };
      if (cancelled || !res.ok) return;
      const raw = Array.isArray(b.dailyInsights) ? b.dailyInsights : [];
      const sorted = [...raw]
        .filter((x) => x && typeof x === "object")
        .sort((a, b) => {
          const ta = (a as { createdAt?: string }).createdAt
            ? new Date(String((a as { createdAt?: string }).createdAt)).getTime()
            : 0;
          const tb = (b as { createdAt?: string }).createdAt
            ? new Date(String((b as { createdAt?: string }).createdAt)).getTime()
            : 0;
          return tb - ta;
        });
      const opts = sorted.map((e, i) => ({
        id: String((e as { id?: string }).id?.trim() || `idx_${i}`),
        label: (e as { createdAt?: string }).createdAt
          ? new Date(String((e as { createdAt?: string }).createdAt)).toLocaleString("pt-BR")
          : `Daily #${i + 1}`,
      }));
      setDailyOptions(opts);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, flow, boardId, getHeaders]);

  const canRun = useMemo(() => {
    if (!boardId) return false;
    if (flow === "free_prompt" && !prompt.trim()) return false;
    return true;
  }, [boardId, flow, prompt]);

  const resetPipelineUi = () => {
    setSteps([]);
    setPreview("");
    setError(null);
    setUsedAi(null);
    setLastPipelineLlmModel(null);
  };

  const run = async () => {
    if (!canRun) return;
    setGenerating(true);
    resetPipelineUi();
    try {
      const res = await fetch("/api/docs/generate-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        body: JSON.stringify({
          flow,
          boardId,
          quarter: flow === "okr_progress" ? quarter : undefined,
          dailyInsightId: flow === "daily_minutes" && dailyInsightId ? dailyInsightId : undefined,
          transcript: flow === "daily_minutes" && transcript.trim() ? transcript : undefined,
          title: title.trim() || undefined,
          prompt: flow === "free_prompt" ? prompt : undefined,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data?.error || `Erro ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Sem stream na resposta.");

      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      const upsertStep = (id: string, label: string, status: PipelineStep["status"], detail?: string) => {
        setSteps((prev) => {
          const i = prev.findIndex((s) => s.id === id);
          const next: PipelineStep = { id, label, status, detail };
          if (i < 0) return [...prev, next];
          const copy = [...prev];
          copy[i] = next;
          return copy;
        });
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";
        for (const frame of frames) {
          const parsed = parseEventStreamFrame(frame);
          if (!parsed) continue;
          const { event, data } = parsed as { event: string; data: Record<string, unknown> };

          if (event === "step") {
            const id = String(data?.id || "");
            const label = String(data?.label || "");
            const st = data?.status === "running" ? "running" : data?.status === "done" ? "done" : "pending";
            let detail: string | undefined;
            if (id === "rag" && typeof data?.chunkCount === "number") {
              detail = `${data.chunkCount} trechos indexados para o Copilot`;
            } else if (id === "draft" && data?.status === "done" && data?.usedAi === false) {
              detail = "Modo estruturado (IA indisponível ou resposta inválida)";
            }
            upsertStep(id, label, st, detail);
          }

          if (event === "preview" && typeof data?.markdown === "string") {
            setPreview(data.markdown);
          }

          if (event === "done" && data?.doc && typeof data.doc === "object") {
            const doc = data.doc as DocData;
            onDocCreated(doc);
            if (typeof data.usedAi === "boolean") setUsedAi(data.usedAi);
            if (typeof data.llmModel === "string" && data.llmModel.trim()) setLastPipelineLlmModel(data.llmModel.trim());
          }

          if (event === "error") {
            setError(String((data as { message?: string })?.message || "Erro"));
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na geração");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="border-b border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-elevated)]">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-[var(--flux-chrome-alpha-04)]"
        onClick={() => setOpen((o) => !o)}
      >
        <div>
          <div className="font-display text-sm font-semibold text-[var(--flux-text)]">IA Docs — pipeline</div>
          <div className="text-xs text-[var(--flux-text-muted)]">
            Gere relatórios a partir do board, Daily, OKRs ou prompt livre; acompanhe cada etapa.
          </div>
        </div>
        <span className="text-[var(--flux-text-muted)]">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="grid gap-4 px-4 pb-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {FLOWS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFlow(f.id)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                    flow === f.id
                      ? "border-[var(--flux-primary)] bg-[var(--flux-indigo-500-alpha-12)]"
                      : "border-[var(--flux-chrome-alpha-10)] hover:border-[var(--flux-chrome-alpha-20)]"
                  }`}
                >
                  <div className="font-semibold text-[var(--flux-text)]">{f.title}</div>
                  <div className="mt-1 text-[var(--flux-text-muted)]">{f.description}</div>
                </button>
              ))}
            </div>

            <label className="block text-xs font-medium text-[var(--flux-text-muted)]">Board</label>
            <select
              value={boardId}
              onChange={(e) => setBoardId(e.target.value)}
              className="w-full rounded border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm text-[var(--flux-text)]"
            >
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            {flow === "okr_progress" && (
              <>
                <label className="block text-xs font-medium text-[var(--flux-text-muted)]">Quarter (ex.: 2026-Q1)</label>
                <input
                  value={quarter}
                  onChange={(e) => setQuarter(e.target.value)}
                  className="w-full rounded border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-3 py-2 font-mono text-sm text-[var(--flux-text)]"
                />
              </>
            )}

            {flow === "daily_minutes" && (
              <>
                <label className="block text-xs font-medium text-[var(--flux-text-muted)]">Daily (opcional)</label>
                <select
                  value={dailyInsightId}
                  onChange={(e) => setDailyInsightId(e.target.value)}
                  className="w-full rounded border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm text-[var(--flux-text)]"
                >
                  <option value="">Usar a mais recente</option>
                  {dailyOptions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <label className="block text-xs font-medium text-[var(--flux-text-muted)]">
                  Ou cole uma transcrição (prioridade sobre o histórico)
                </label>
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  rows={4}
                  placeholder="Cole aqui a transcrição se quiser ignorar o histórico da Daily…"
                  className="w-full resize-y rounded border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm text-[var(--flux-text)]"
                />
              </>
            )}

            {flow === "free_prompt" && (
              <>
                <label className="block text-xs font-medium text-[var(--flux-text-muted)]">O que você quer no documento?</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={5}
                  placeholder="Ex.: Liste riscos do pipeline e sugira mitigação com base nos cards…"
                  className="w-full resize-y rounded border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm text-[var(--flux-text)]"
                />
              </>
            )}

            <label className="block text-xs font-medium text-[var(--flux-text-muted)]">Título do doc (opcional)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Deixe em branco para um título sugerido"
              className="w-full rounded border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm text-[var(--flux-text)]"
            />

            <button
              type="button"
              disabled={!canRun || generating}
              onClick={() => void run()}
              className="btn-primary w-full py-2 text-sm font-semibold disabled:opacity-50"
            >
              {generating ? "Gerando…" : "Executar pipeline"}
            </button>

            {error && <div className="rounded border border-[var(--flux-danger)] bg-[var(--flux-red-500-alpha-08)] px-3 py-2 text-xs text-[var(--flux-danger)]">{error}</div>}
            {usedAi === false && !error && (
              <p className="text-xs text-[var(--flux-text-muted)]">
                A IA não respondeu no formato esperado; usamos o relatório estruturado. Verifique TOGETHER_API_KEY no ambiente.
              </p>
            )}
          </div>

          <div className="flex min-h-[280px] flex-col rounded-lg border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">Pipeline</div>
            <ol className="mb-4 space-y-2">
              {steps.length === 0 && !generating && (
                <li className="text-xs text-[var(--flux-text-muted)]">As etapas aparecem aqui em tempo real.</li>
              )}
              {steps.map((s) => (
                <li key={s.id} className="flex gap-2 text-xs">
                  <span
                    className={
                      s.status === "done"
                        ? "text-emerald-400"
                        : s.status === "running"
                          ? "text-[var(--flux-primary)]"
                          : "text-[var(--flux-text-muted)]"
                    }
                  >
                    {s.status === "done" ? "✓" : s.status === "running" ? "◉" : "○"}
                  </span>
                  <div>
                    <div className="text-[var(--flux-text)]">{s.label}</div>
                    {s.detail && <div className="text-[var(--flux-text-muted)]">{s.detail}</div>}
                  </div>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">Pré-visualização</div>
              {lastPipelineLlmModel ? <AiModelHint model={lastPipelineLlmModel} provider="openai_compat" /> : null}
            </div>
            <pre className="mt-2 max-h-[220px] flex-1 overflow-auto whitespace-pre-wrap rounded border border-[var(--flux-chrome-alpha-06)] bg-[var(--flux-black-alpha-20)] p-2 font-mono text-[11px] leading-relaxed text-[var(--flux-text)]">
              {preview || (generating ? "Aguardando conteúdo…" : "—")}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
