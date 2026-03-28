"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { SpecPlanAnalysisDrawer } from "@/components/spec-plan/spec-plan-analysis-drawer";
import type { SpecPlanRunLogEntry } from "@/lib/spec-plan-run-types";
import { SpecPlanPreviewCards } from "@/components/spec-plan/spec-plan-preview-cards";
import { SpecPlanProgressStepper } from "@/components/spec-plan/spec-plan-progress-stepper";
import { Header } from "@/components/header";
import { useAuth } from "@/context/auth-context";
import { apiDelete, apiGet, apiPost, ApiError } from "@/lib/api-client";
import { useSpecPlanActiveStore } from "@/stores/spec-plan-active-store";

function safeStringify(obj: unknown, max = 16_000): string {
  try {
    const s = JSON.stringify(obj, null, 2);
    return s.length > max ? `${s.slice(0, max)}\n…` : s;
  } catch {
    return String(obj);
  }
}

type PhaseState = "pending" | "running" | "done" | "error";

type BucketOpt = { key: string; label: string };

type SpecTab = "configure" | "progress" | "review" | "history";

type PreviewRow = {
  title: string;
  desc: string;
  bucketKey: string;
  priority: string;
  progress: string;
  tags: string[];
  rationale: string;
  blockedByTitles: string[];
  subtasks: { title: string }[];
  storyPoints: number | null;
  serviceClass: string | null;
};

function parseSseBlocks(buffer: string): { rest: string; events: { event: string; data: string }[] } {
  const events: { event: string; data: string }[] = [];
  let rest = buffer;
  let idx: number;
  while ((idx = rest.indexOf("\n\n")) >= 0) {
    const block = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    let ev = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) ev = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    events.push({ event: ev, data: dataLines.join("\n") });
  }
  return { rest, events };
}

type RunSummary = {
  id: string;
  createdAt: string;
  updatedAt?: string;
  status: string;
  methodology: string;
  remapOnly: boolean;
  sourceSummary: string;
  previewCount: number;
  streamError: string | null;
};

type RunFull = {
  id: string;
  status: string;
  methodology: "scrum" | "kanban" | "lss";
  remapOnly: boolean;
  sourceSummary: string;
  phases: Record<string, PhaseState>;
  logs: SpecPlanRunLogEntry[];
  docReadMeta: null | {
    fileName: string;
    kind: string;
    charCount?: number;
    pageCount?: number;
    warnings: string[];
  };
  outlineSummary: string | null;
  methodologySummary: string | null;
  workItemsPayload: string;
  preview: PreviewRow[];
  streamError: string | null;
  streamErrorDetail: string | null;
};

export default function SpecPlanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const localeRoot = `/${useLocale()}`;
  const t = useTranslations("specPlanPage");
  const { user, getHeaders, isChecked } = useAuth();

  const [featureOk, setFeatureOk] = useState<boolean | null>(null);
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [boardsErr, setBoardsErr] = useState<string | null>(null);
  const [boardId, setBoardId] = useState("");
  const [buckets, setBuckets] = useState<BucketOpt[]>([]);

  const [methodology, setMethodology] = useState<"scrum" | "kanban" | "lss">("scrum");
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");

  const [phaseParse, setPhaseParse] = useState<PhaseState>("pending");
  const [phaseChunks, setPhaseChunks] = useState<PhaseState>("pending");
  const [phaseEmbeddings, setPhaseEmbeddings] = useState<PhaseState>("pending");
  const [phaseRetrieval, setPhaseRetrieval] = useState<PhaseState>("pending");
  const [phaseOutline, setPhaseOutline] = useState<PhaseState>("pending");
  const [phaseWork, setPhaseWork] = useState<PhaseState>("pending");
  const [phaseCards, setPhaseCards] = useState<PhaseState>("pending");

  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamErrorDetail, setStreamErrorDetail] = useState<string | null>(null);
  const [analysisLogs, setAnalysisLogs] = useState<SpecPlanRunLogEntry[]>([]);
  const [docReadMeta, setDocReadMeta] = useState<null | {
    fileName: string;
    kind: string;
    charCount?: number;
    pageCount?: number;
    warnings: string[];
  }>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [workItemsPayload, setWorkItemsPayload] = useState<string>("");
  const [outlineSummary, setOutlineSummary] = useState<string | null>(null);
  const [methodologySummary, setMethodologySummary] = useState<string | null>(null);
  const [accept, setAccept] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [tab, setTab] = useState<SpecTab>("configure");
  const [analysisDrawerOpen, setAnalysisDrawerOpen] = useState(false);
  const [previewTableView, setPreviewTableView] = useState(false);
  const [persistence, setPersistence] = useState<boolean | null>(null);
  const [backgroundRunId, setBackgroundRunId] = useState<string | null>(null);
  const [historyRuns, setHistoryRuns] = useState<RunSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyErr, setHistoryErr] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const friendlyHints = useMemo(
    () => ({
      parse: t("stepperFriendly.parse"),
      chunks: t("stepperFriendly.chunks"),
      embeddings: t("stepperFriendly.embeddings"),
      retrieval: t("stepperFriendly.retrieval"),
      outline: t("stepperFriendly.outline"),
      work: t("stepperFriendly.work"),
      cards: t("stepperFriendly.cards"),
    }),
    [t]
  );

  const applyPhasesFromRecord = useCallback((ph: Record<string, PhaseState>) => {
    const g = (k: string): PhaseState => (ph[k] as PhaseState) || "pending";
    setPhaseParse(g("parse"));
    setPhaseChunks(g("chunks"));
    setPhaseEmbeddings(g("embeddings"));
    setPhaseRetrieval(g("retrieval"));
    setPhaseOutline(g("outline"));
    setPhaseWork(g("work"));
    setPhaseCards(g("cards"));
  }, []);

  const hydrateFromRunFull = useCallback(
    (run: RunFull) => {
      applyPhasesFromRecord(run.phases);
      setAnalysisLogs(Array.isArray(run.logs) ? run.logs : []);
      setDocReadMeta(run.docReadMeta);
      setOutlineSummary(run.outlineSummary);
      setMethodologySummary(run.methodologySummary);
      setWorkItemsPayload(run.workItemsPayload || "");
      setPreview(Array.isArray(run.preview) ? run.preview : []);
      setStreamError(run.streamError);
      setStreamErrorDetail(run.streamErrorDetail);
      if (run.methodology === "scrum" || run.methodology === "kanban" || run.methodology === "lss") {
        setMethodology(run.methodology);
      }
    },
    [applyPhasesFromRecord]
  );

  useEffect(() => {
    if (!isChecked) return;
    if (!user) {
      router.replace(`${localeRoot}/login`);
    }
  }, [isChecked, user, router, localeRoot]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isChecked || !user?.orgId) return;
      try {
        const f = await apiGet<{ spec_ai_scope_planner?: boolean }>("/api/org/features", getHeaders());
        if (!cancelled) setFeatureOk(Boolean(f?.spec_ai_scope_planner));
      } catch {
        if (!cancelled) setFeatureOk(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isChecked, user?.orgId, getHeaders]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isChecked || !user?.orgId || !featureOk) return;
      try {
        const data = await apiGet<{ boards: { id: string; name: string }[] }>("/api/boards", getHeaders());
        if (!cancelled) setBoards(Array.isArray(data.boards) ? data.boards : []);
      } catch (e) {
        if (!cancelled) {
          setBoardsErr(e instanceof ApiError ? e.message : t("loadBoardsError"));
          setBoards([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isChecked, user?.orgId, featureOk, getHeaders, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!boardId || !featureOk) {
        setBuckets([]);
        return;
      }
      try {
        const b = await apiGet<{ config?: { bucketOrder?: { key?: string; label?: string }[] } }>(
          `/api/boards/${encodeURIComponent(boardId)}`,
          getHeaders()
        );
        const order = Array.isArray(b.config?.bucketOrder) ? b.config.bucketOrder : [];
        const opts = order
          .map((x) => ({ key: String(x.key || "").trim(), label: String(x.label || "").trim() }))
          .filter((x) => x.key);
        if (!cancelled) setBuckets(opts);
      } catch {
        if (!cancelled) setBuckets([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId, featureOk, getHeaders]);

  const loadHistory = useCallback(async () => {
    if (!boardId) return;
    setHistoryLoading(true);
    setHistoryErr(null);
    try {
      const data = await apiGet<{ runs?: RunSummary[]; persistence?: boolean }>(
        `/api/boards/${encodeURIComponent(boardId)}/spec-plan/runs`,
        getHeaders()
      );
      setHistoryRuns(Array.isArray(data.runs) ? data.runs : []);
      if (typeof data.persistence === "boolean") setPersistence(data.persistence);
    } catch (e) {
      setHistoryErr(e instanceof ApiError ? e.message : t("historyLoadError"));
      setHistoryRuns([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [boardId, getHeaders, t]);

  useEffect(() => {
    if (tab === "history" && boardId && featureOk) void loadHistory();
  }, [tab, boardId, featureOk, loadHistory]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!boardId || !featureOk) {
        setPersistence(null);
        return;
      }
      try {
        const data = await apiGet<{ persistence?: boolean }>(
          `/api/boards/${encodeURIComponent(boardId)}/spec-plan/runs`,
          getHeaders()
        );
        if (!cancelled && typeof data.persistence === "boolean") setPersistence(data.persistence);
      } catch {
        if (!cancelled) setPersistence(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId, featureOk, getHeaders]);

  useEffect(() => {
    const r = searchParams.get("run");
    if (r?.trim() && boardId) {
      setBackgroundRunId(r.trim());
      setTab("progress");
      setAnalysisDrawerOpen(true);
    }
  }, [searchParams, boardId]);

  useEffect(() => {
    if (!boardId) return;
    try {
      const raw = sessionStorage.getItem("flux_spec_plan_bg");
      if (!raw) return;
      const o = JSON.parse(raw) as { boardId?: string; runId?: string };
      if (o.boardId === boardId && o.runId) {
        setBackgroundRunId(o.runId);
        setTab("progress");
      }
    } catch {
      /* ignore */
    }
  }, [boardId]);

  useEffect(() => {
    if (!backgroundRunId?.trim() || !boardId) return;
    let cancelled = false;
    const rid = backgroundRunId.trim();
    const poll = async () => {
      try {
        const data = await apiGet<{ run?: RunFull }>(
          `/api/boards/${encodeURIComponent(boardId)}/spec-plan/runs/${encodeURIComponent(rid)}`,
          getHeaders()
        );
        if (cancelled || !data.run) return;
        hydrateFromRunFull(data.run);
        const st = data.run.status;
        if (st === "completed" || st === "failed" || st === "cancelled") {
          setBackgroundRunId(null);
          try {
            sessionStorage.removeItem("flux_spec_plan_bg");
          } catch {
            /* ignore */
          }
          useSpecPlanActiveStore.getState().clearRun(rid);
          if (st === "completed" && data.run.preview?.length) setTab("review");
        }
      } catch {
        /* ignore transient */
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 2200);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [backgroundRunId, boardId, getHeaders, hydrateFromRunFull]);

  const appendAnalysisLog = useCallback(
    (level: SpecPlanRunLogEntry["level"], message: string, detail?: string) => {
      setAnalysisLogs((prev) => [
        ...prev,
        {
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${prev.length}`,
          timestamp: Date.now(),
          level,
          message,
          detail,
        },
      ]);
    },
    []
  );

  const resetPhases = useCallback(() => {
    setPhaseParse("pending");
    setPhaseChunks("pending");
    setPhaseEmbeddings("pending");
    setPhaseRetrieval("pending");
    setPhaseOutline("pending");
    setPhaseWork("pending");
    setPhaseCards("pending");
    setStreamError(null);
    setStreamErrorDetail(null);
    setOutlineSummary(null);
    setMethodologySummary(null);
    setAnalysisLogs([]);
    setDocReadMeta(null);
  }, []);

  const runStream = useCallback(
    async (opts: { remapOnly: boolean }) => {
      if (!boardId) return;
      setAnalyzing(true);
      setStreamError(null);
      setStreamErrorDetail(null);
      resetPhases();
      setPreview([]);
      setApplyMsg(null);
      setAnalysisDrawerOpen(true);
      setTab("progress");
      appendAnalysisLog(
        "info",
        t("analysisModal.logEvents.started"),
        safeStringify({ remapOnly: opts.remapOnly, boardId })
      );
      if (!opts.remapOnly) {
        setPhaseParse("running");
      } else {
        setPhaseParse("done");
        setPhaseChunks("done");
        setPhaseEmbeddings("done");
        setPhaseRetrieval("done");
        setPhaseOutline("done");
        setPhaseWork("done");
        setPhaseCards("running");
      }

      const form = new FormData();
      form.set("methodology", methodology);
      form.set("remapOnly", opts.remapOnly ? "1" : "0");
      if (opts.remapOnly) {
        form.set("workItemsJson", workItemsPayload);
      } else {
        if (pasted) form.set("pastedText", pasted);
        if (file) form.set("file", file, file.name);
      }

      const streamHeaders: Record<string, string> = {
        Accept: "text/event-stream",
        ...getHeaders(),
      };
      // getApiHeaders define application/json; com FormData o browser deve enviar multipart com boundary.
      delete streamHeaders["Content-Type"];

      const res = await fetch(`/api/boards/${encodeURIComponent(boardId)}/spec-plan/stream`, {
        method: "POST",
        credentials: "same-origin",
        headers: streamHeaders,
        body: form,
      });

      if (!res.ok) {
        const errText = await res.text();
        setStreamErrorDetail(errText.trim() || null);
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(errText) as Record<string, unknown>;
        } catch {
          parsed = { rawBody: errText };
        }
        const msg = typeof parsed.error === "string" ? parsed.error : t("streamError");
        setStreamError(msg);
        appendAnalysisLog(
          "error",
          t("analysisModal.logEvents.httpError", { status: res.status, message: msg }),
          safeStringify({ httpStatus: res.status, ...parsed })
        );
        setAnalyzing(false);
        setPhaseParse("error");
        setPhaseChunks("error");
        setPhaseEmbeddings("error");
        setPhaseRetrieval("error");
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        const msg = t("streamError");
        setStreamError(msg);
        setStreamErrorDetail("Resposta sem corpo (stream) — não foi possível ler eventos SSE.");
        appendAnalysisLog("error", msg, "ReadableStream não disponível na resposta.");
        setAnalyzing(false);
        return;
      }

      const dec = new TextDecoder();
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const { rest, events } = parseSseBlocks(buf);
          buf = rest;
          for (const { event, data } of events) {
            let payload: Record<string, unknown> = {};
            try {
              payload = JSON.parse(data) as Record<string, unknown>;
            } catch {
              payload = {};
            }
            if (event === "document_parsed") {
              const fn = String(payload.fileName || "—");
              const chars =
                typeof payload.charCount === "number" && Number.isFinite(payload.charCount)
                  ? payload.charCount
                  : 0;
              const warns = Array.isArray(payload.warnings)
                ? payload.warnings.map((w) => String(w)).filter(Boolean)
                : [];
              setDocReadMeta({
                fileName: fn,
                kind: String(payload.kind || "—"),
                charCount: typeof payload.charCount === "number" ? payload.charCount : undefined,
                pageCount: typeof payload.pageCount === "number" ? payload.pageCount : undefined,
                warnings: warns,
              });
              appendAnalysisLog(
                "success",
                t("analysisModal.logEvents.documentParsed", { fileName: fn, chars }),
                safeStringify(payload)
              );
              setPhaseParse("done");
              setPhaseChunks("running");
            } else if (event === "chunks_ready") {
              appendAnalysisLog(
                "info",
                t("analysisModal.logEvents.chunksReady", {
                  count: Number(payload.chunkCount) || 0,
                  avgSize: Number(payload.avgSize) || 0,
                  truncated: String(Boolean(payload.truncated)),
                }),
                safeStringify(payload)
              );
              setPhaseChunks("done");
              setPhaseEmbeddings("running");
            } else if (event === "embeddings_ready") {
              const failed = Boolean(payload.failed);
              appendAnalysisLog(
                failed ? "error" : "success",
                t("analysisModal.logEvents.embeddingsReady", {
                  count: Number(payload.embeddedCount) || 0,
                  model: String(payload.modelHint || "—"),
                  status: failed
                    ? t("analysisModal.logEvents.embedRunFailed")
                    : t("analysisModal.logEvents.embedRunOk"),
                }),
                safeStringify(payload)
              );
              if (failed) {
                appendAnalysisLog("error", t("analysisModal.logEvents.embeddingsFailed"), undefined);
              }
              setPhaseEmbeddings("done");
              setPhaseRetrieval("running");
            } else if (event === "retrieval_ready") {
              appendAnalysisLog(
                "info",
                t("analysisModal.logEvents.retrievalReady", {
                  chunksUsed: Number(payload.chunksUsed) || 0,
                  fallback: String(Boolean(payload.fallback)),
                }),
                safeStringify(payload)
              );
              setPhaseRetrieval("done");
              setPhaseOutline("running");
            } else if (event === "outline_ready") {
              setPhaseOutline("done");
              setPhaseWork("running");
              const sections = payload.sections as unknown[];
              const kr = payload.keyRequirements as unknown[];
              setOutlineSummary(
                t("outlineStats", {
                  sections: Array.isArray(sections) ? sections.length : 0,
                  requirements: Array.isArray(kr) ? kr.length : 0,
                })
              );
              appendAnalysisLog(
                "success",
                t("analysisModal.logEvents.outlineReady"),
                safeStringify({
                  sectionCount: Array.isArray(sections) ? sections.length : 0,
                  keyRequirementsCount: Array.isArray(kr) ? kr.length : 0,
                })
              );
            } else if (event === "work_items_llm_started") {
              const chars =
                typeof payload.outlineJsonChars === "number" && Number.isFinite(payload.outlineJsonChars)
                  ? payload.outlineJsonChars
                  : 0;
              appendAnalysisLog(
                "info",
                t("analysisModal.logEvents.workItemsLlmStarted", { chars }),
                safeStringify(payload)
              );
            } else if (event === "work_items_draft") {
              setPhaseWork("done");
              setWorkItemsPayload(JSON.stringify(payload));
              appendAnalysisLog("success", t("analysisModal.logEvents.workItemsReady"), safeStringify(payload));
            } else if (event === "methodology_applied") {
              const s = payload.summary;
              if (typeof s === "string") setMethodologySummary(s.slice(0, 800));
              appendAnalysisLog("info", t("analysisModal.logEvents.methodologyApplied"), safeStringify(payload));
            } else if (event === "bucket_mapping") {
              setPhaseCards("running");
              appendAnalysisLog("info", t("analysisModal.logEvents.bucketMapping"), safeStringify(payload));
            } else if (event === "cards_preview") {
              setPhaseCards("done");
              const rows = payload.cardRows as Record<string, unknown>[] | undefined;
              const list: PreviewRow[] = [];
              if (Array.isArray(rows)) {
                for (const r of rows) {
                  list.push({
                    title: String(r.title || "").slice(0, 300),
                    desc: String(r.desc || "").slice(0, 6000),
                    bucketKey: String(r.bucketKey || ""),
                    priority: String(r.priority || "Média"),
                    progress: String(r.progress || "Não iniciado"),
                    tags: Array.isArray(r.tags) ? r.tags.map((x) => String(x)).filter(Boolean).slice(0, 30) : [],
                    rationale: String(r.rationale || ""),
                    blockedByTitles: Array.isArray(r.blockedByTitles)
                      ? r.blockedByTitles.map((x) => String(x)).filter(Boolean)
                      : [],
                    subtasks: Array.isArray(r.subtasks)
                      ? r.subtasks
                          .map((s) => ({ title: String((s as { title?: string }).title || "").slice(0, 300) }))
                          .filter((s) => s.title)
                          .slice(0, 12)
                      : [],
                    storyPoints: typeof r.storyPoints === "number" ? r.storyPoints : null,
                    serviceClass: typeof r.serviceClass === "string" ? r.serviceClass : null,
                  });
                }
              }
              setPreview(list);
              appendAnalysisLog(
                "success",
                t("analysisModal.logEvents.cardsPreview", { count: list.length }),
                safeStringify({ cardCount: list.length, payloadKeys: Object.keys(payload) })
              );
            } else if (event === "error") {
              const msg = typeof payload.message === "string" ? payload.message : t("streamError");
              setStreamError(msg);
              setStreamErrorDetail(safeStringify(payload));
              appendAnalysisLog("error", t("analysisModal.logEvents.streamError", { message: msg }), safeStringify(payload));
              setPhaseParse((p) => (p === "running" ? "error" : p));
              setPhaseCards("error");
              setPhaseChunks((p) => (p === "running" ? "error" : p));
              setPhaseEmbeddings((p) => (p === "running" ? "error" : p));
              setPhaseRetrieval((p) => (p === "running" ? "error" : p));
              setPhaseOutline((p) => (p === "running" ? "error" : p));
              setPhaseWork((p) => (p === "running" ? "error" : p));
            } else if (event === "done") {
              /* noop */
            }
          }
        }
      } catch (e) {
        const m = e instanceof Error ? e.message : t("streamError");
        const stack = e instanceof Error ? e.stack : undefined;
        const detail = stack ? `${m}\n\n${stack}` : m;
        setStreamError(m);
        setStreamErrorDetail(detail);
        appendAnalysisLog("error", m, detail);
      } finally {
        setAnalyzing(false);
      }
    },
    [appendAnalysisLog, boardId, file, getHeaders, methodology, pasted, resetPhases, t, workItemsPayload]
  );

  const onStart = useCallback(() => {
    if (!boardId) return;
    if (!file && !pasted.trim()) {
      setStreamError(t("noInputError"));
      return;
    }
    void runStream({ remapOnly: false });
  }, [boardId, file, pasted, runStream, t]);

  const onRemap = useCallback(() => {
    if (!boardId || !workItemsPayload.trim()) return;
    void runStream({ remapOnly: true });
  }, [boardId, workItemsPayload, runStream]);

  const postBackgroundRun = useCallback(
    async (opts: { remapOnly: boolean }) => {
      if (!boardId) return;
      if (persistence === false) {
        setStreamError(t("backgroundRequiresMongo"));
        return;
      }
      if (!opts.remapOnly && !file && !pasted.trim()) {
        setStreamError(t("noInputError"));
        return;
      }
      if (opts.remapOnly && !workItemsPayload.trim()) return;

      const form = new FormData();
      form.set("methodology", methodology);
      form.set("remapOnly", opts.remapOnly ? "1" : "0");
      if (opts.remapOnly) {
        form.set("workItemsJson", workItemsPayload);
      } else {
        if (pasted) form.set("pastedText", pasted);
        if (file) form.set("file", file, file.name);
      }
      const h: Record<string, string> = { ...getHeaders() };
      delete h["Content-Type"];
      const res = await fetch(`/api/boards/${encodeURIComponent(boardId)}/spec-plan/runs`, {
        method: "POST",
        credentials: "same-origin",
        headers: h,
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as { runId?: string; error?: string };
      if (!res.ok) {
        setStreamError(typeof data.error === "string" ? data.error : t("streamError"));
        return;
      }
      if (data.runId) {
        setBackgroundRunId(data.runId);
        try {
          sessionStorage.setItem("flux_spec_plan_bg", JSON.stringify({ boardId, runId: data.runId }));
        } catch {
          /* ignore */
        }
        useSpecPlanActiveStore.setState((s) => ({
          active: [
            ...s.active.filter((a) => a.runId !== data.runId),
            { runId: data.runId!, boardId, updatedAt: new Date().toISOString() },
          ],
        }));
        resetPhases();
        setPreview([]);
        setStreamError(null);
        setStreamErrorDetail(null);
        setTab("progress");
        setAnalysisDrawerOpen(true);
      }
    },
    [boardId, file, getHeaders, methodology, pasted, persistence, resetPhases, t, workItemsPayload]
  );

  const cancelBackgroundRun = useCallback(async () => {
    if (!backgroundRunId?.trim() || !boardId) return;
    try {
      await apiPost(
        `/api/boards/${encodeURIComponent(boardId)}/spec-plan/runs/${encodeURIComponent(backgroundRunId.trim())}/cancel`,
        {},
        getHeaders()
      );
    } catch {
      /* ignore */
    }
  }, [backgroundRunId, boardId, getHeaders]);

  const restoreFromHistory = useCallback(
    async (runId: string) => {
      if (!boardId) return;
      try {
        const data = await apiGet<{ run?: RunFull }>(
          `/api/boards/${encodeURIComponent(boardId)}/spec-plan/runs/${encodeURIComponent(runId)}`,
          getHeaders()
        );
        if (data.run) {
          hydrateFromRunFull(data.run);
          setTab("review");
        }
      } catch {
        setHistoryErr(t("historyLoadError"));
      }
    },
    [boardId, getHeaders, hydrateFromRunFull, t]
  );

  const deleteHistoryEntry = useCallback(
    async (runId: string) => {
      if (!boardId) return;
      try {
        await apiDelete(
          `/api/boards/${encodeURIComponent(boardId)}/spec-plan/runs/${encodeURIComponent(runId)}`,
          getHeaders()
        );
        setDeleteConfirmId(null);
        await loadHistory();
      } catch (e) {
        setHistoryErr(e instanceof ApiError ? e.message : t("historyDeleteError"));
      }
    },
    [boardId, getHeaders, loadHistory, t]
  );

  const onApply = useCallback(async () => {
    if (!boardId || !accept || preview.length === 0) return;
    setApplying(true);
    setApplyMsg(null);
    try {
      await apiPost(
        `/api/boards/${encodeURIComponent(boardId)}/spec-plan/apply`,
        {
          cards: preview.map((r) => ({
            title: r.title,
            desc: r.desc,
            bucketKey: r.bucketKey,
            priority: r.priority,
            progress: r.progress,
            tags: r.tags,
            storyPoints: r.storyPoints,
            serviceClass: r.serviceClass as "expedite" | "fixed_date" | "standard" | "intangible" | null,
            rationale: r.rationale,
            blockedByTitles: r.blockedByTitles,
            subtasks: r.subtasks,
          })),
        },
        getHeaders()
      );
      setApplyMsg(t("applySuccess"));
    } catch (e) {
      setApplyMsg(e instanceof ApiError ? e.message : t("applyError"));
    } finally {
      setApplying(false);
    }
  }, [accept, boardId, getHeaders, preview, t]);

  const analysisPhases = useMemo(
    () =>
      [
        { key: "parse", label: t("phaseParse"), state: phaseParse },
        { key: "chunks", label: t("phaseChunks"), state: phaseChunks },
        { key: "embeddings", label: t("phaseEmbeddings"), state: phaseEmbeddings },
        { key: "retrieval", label: t("phaseRetrieval"), state: phaseRetrieval },
        { key: "outline", label: t("phaseOutline"), state: phaseOutline },
        { key: "work", label: t("phaseWorkItems"), state: phaseWork },
        { key: "cards", label: t("phaseCards"), state: phaseCards },
      ] as const,
    [phaseCards, phaseChunks, phaseEmbeddings, phaseOutline, phaseParse, phaseRetrieval, phaseWork, t]
  );

  const expandedStepKey = useMemo(() => {
    const running = analysisPhases.find((p) => p.state === "running");
    if (running) return running.key;
    const err = analysisPhases.find((p) => p.state === "error");
    return err?.key ?? null;
  }, [analysisPhases]);

  if (!isChecked || !user) {
    return <div className="min-h-screen bg-[var(--flux-surface-dark)]" />;
  }

  if (featureOk === null) {
    return (
      <div className="min-h-screen bg-[var(--flux-surface-dark)]">
        <Header title={t("title")} backHref={`${localeRoot}/boards`} backLabel={t("headerBack")} />
        <div className="mx-auto max-w-lg px-4 py-16 text-center text-[var(--flux-text-muted)]">…</div>
      </div>
    );
  }

  if (!featureOk) {
    return (
      <div className="min-h-screen bg-[var(--flux-surface-dark)]">
        <Header title={t("title")} backHref={`${localeRoot}/boards`} backLabel={t("headerBack")} />
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <h2 className="font-display text-xl font-bold text-[var(--flux-text)]">{t("upgradeTitle")}</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--flux-text-muted)]">{t("upgradeBody")}</p>
          <Link
            href={`${localeRoot}/billing`}
            className="mt-6 inline-flex rounded-[var(--flux-rad-sm)] bg-[var(--flux-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
          >
            {t("goBilling")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header title={t("title")} backHref={`${localeRoot}/boards`} backLabel={t("headerBack")} />
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 pb-24">
        <div className="sticky top-0 z-20 -mx-4 border-b border-[var(--flux-primary-alpha-12)] bg-[var(--flux-surface-dark)]/92 px-4 py-3 backdrop-blur-md">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["configure", t("tabs.configure")],
                ["progress", t("tabs.progress")],
                ["review", t("tabs.review")],
                ["history", t("tabs.history")],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                disabled={key === "review" && preview.length === 0}
                onClick={() => setTab(key)}
                className={
                  tab === key
                    ? "rounded-[var(--flux-rad-sm)] bg-[var(--flux-primary)] px-3 py-2 text-xs font-bold text-white"
                    : "rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-20)] px-3 py-2 text-xs font-bold text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-light)] disabled:opacity-35"
                }
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--flux-text-muted)]">
            <span>
              {analyzing
                ? t("sticky.analyzingSync")
                : backgroundRunId
                  ? t("sticky.analyzingBackground")
                  : t("sticky.idle")}
            </span>
            <button
              type="button"
              onClick={() => setAnalysisDrawerOpen(true)}
              className="font-semibold text-[var(--flux-primary-light)] underline-offset-2 hover:underline"
            >
              {t("openAnalysisPanel")}
            </button>
            {backgroundRunId ? (
              <button
                type="button"
                onClick={() => void cancelBackgroundRun()}
                className="font-semibold text-[var(--flux-danger)]"
              >
                {t("cancelBackground")}
              </button>
            ) : null}
          </div>
        </div>

        {tab === "configure" ? (
          <div className="space-y-8">
        <p className="text-sm leading-relaxed text-[var(--flux-text-muted)]">{t("privacyNote")}</p>
        <p className="text-xs text-[var(--flux-text-muted)]">{t("privacyHistoryNote")}</p>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-15)] bg-[linear-gradient(135deg,var(--flux-primary-alpha-08),transparent)] p-5">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-[var(--flux-primary-light)]">
              {t("stepBoard")}
            </h2>
            <select
              className="mt-3 w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-elevated)] px-3 py-2.5 text-sm text-[var(--flux-text)]"
              value={boardId}
              onChange={(e) => setBoardId(e.target.value)}
            >
              <option value="">{t("boardPlaceholder")}</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {boardsErr ? <p className="mt-2 text-xs text-[var(--flux-danger)]">{boardsErr}</p> : null}
          </section>

          <section className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-surface-elevated)] p-5">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-[var(--flux-primary-light)]">
              {t("stepMethod")}
            </h2>
            <div className="mt-3 flex flex-col gap-2">
              {(
                [
                  ["scrum", t("methodScrum"), t("methodHintScrum")],
                  ["kanban", t("methodKanban"), t("methodHintKanban")],
                  ["lss", t("methodLss"), t("methodHintLss")],
                ] as const
              ).map(([key, label, hint]) => (
                <label
                  key={key}
                  className={`flex cursor-pointer flex-col rounded-[var(--flux-rad-sm)] border px-3 py-2.5 text-sm transition-colors ${
                    methodology === key
                      ? "border-[var(--flux-primary-light)] bg-[var(--flux-primary-alpha-10)]"
                      : "border-[var(--flux-primary-alpha-12)] hover:border-[var(--flux-primary-alpha-25)]"
                  }`}
                >
                  <span className="flex items-center gap-2 font-semibold text-[var(--flux-text)]">
                    <input type="radio" name="meth" checked={methodology === key} onChange={() => setMethodology(key)} />
                    {label}
                  </span>
                  <span className="mt-1 pl-6 text-xs text-[var(--flux-text-muted)]">{hint}</span>
                </label>
              ))}
            </div>
          </section>
        </div>

        <section className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-surface-elevated)] p-5">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-[var(--flux-primary-light)]">
            {t("stepSource")}
          </h2>
          <label className="mt-3 block text-xs font-semibold text-[var(--flux-text-muted)]">{t("fileLabel")}</label>
          <input
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="mt-1 w-full text-sm text-[var(--flux-text)]"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <label className="mt-4 block text-xs font-semibold text-[var(--flux-text-muted)]">{t("pasteLabel")}</label>
          <textarea
            className="mt-1 min-h-[120px] w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-dark)] px-3 py-2 text-sm text-[var(--flux-text)]"
            placeholder={t("pastePlaceholder")}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              disabled={!boardId || analyzing}
              onClick={() => void onStart()}
              className="w-full rounded-[var(--flux-rad-sm)] bg-[var(--flux-primary)] py-3 text-sm font-bold text-white disabled:opacity-40 sm:w-auto sm:px-8"
            >
              {analyzing ? "…" : t("startAnalysis")}
            </button>
            <button
              type="button"
              disabled={!boardId || analyzing || persistence === false}
              onClick={() => void postBackgroundRun({ remapOnly: false })}
              className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-28)] py-3 text-sm font-semibold text-[var(--flux-primary-light)] disabled:opacity-40 sm:w-auto sm:px-6"
            >
              {t("startBackground")}
            </button>
          </div>
        </section>
          </div>
        ) : null}

        {tab === "progress" ? (
        <section className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-black-alpha-04)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-sm font-bold text-[var(--flux-text)]">{t("timelineTitle")}</h2>
          </div>
          <div className="mt-4 rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-12)] bg-[var(--flux-surface-elevated)] p-3">
            <SpecPlanProgressStepper
              phases={analysisPhases.map((p) => ({ key: p.key, label: p.label, state: p.state }))}
              friendlyHints={friendlyHints}
              statusDone={t("statusDone")}
              statusRunning={t("statusRunning")}
              statusError={t("statusError")}
              statusPending={t("statusPending")}
              expandedKey={expandedStepKey}
            />
          </div>
          <div className="mt-4 space-y-2 text-xs text-[var(--flux-text-muted)]">
              {docReadMeta ? (
                <div className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-chrome-alpha-04)] p-3">
                  <p className="font-semibold text-[var(--flux-text)]">{t("analysisModal.docReadTitle")}</p>
                  <p className="mt-1">
                    {docReadMeta.fileName} · {docReadMeta.kind}
                    {typeof docReadMeta.charCount === "number"
                      ? ` · ${t("docReadCharSummary", { count: docReadMeta.charCount })}`
                      : null}
                  </p>
                  {docReadMeta.warnings.length > 0 ? (
                    <p className="mt-1 text-[var(--flux-amber)]">{docReadMeta.warnings.join(" · ")}</p>
                  ) : null}
                </div>
              ) : null}
              {outlineSummary ? (
                <p>
                  <span className="font-semibold text-[var(--flux-text)]">Outline — </span>
                  {outlineSummary}
                </p>
              ) : null}
              {methodologySummary ? (
                <p>
                  <span className="font-semibold text-[var(--flux-text)]">{t("methodologyBlockLabel")}: </span>
                  {methodologySummary}
                </p>
              ) : null}
          </div>
          {streamError ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-[var(--flux-danger)]">{streamError}</p>
              <button
                type="button"
                onClick={() => setAnalysisDrawerOpen(true)}
                className="text-xs font-semibold text-[var(--flux-primary-light)] underline-offset-2 hover:underline"
              >
                {t("errorOpenPanelHint")}
              </button>
            </div>
          ) : null}
        </section>
        ) : null}

        {tab === "review" && preview.length > 0 ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-lg font-bold text-[var(--flux-text)]">
                {t("previewTitle")} · {t("previewCount", { count: preview.length })}
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewTableView((v) => !v)}
                  className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-25)] px-3 py-2 text-xs font-semibold text-[var(--flux-primary-light)]"
                >
                  {previewTableView ? t("previewCardView") : t("previewTableView")}
                </button>
                <button
                  type="button"
                  disabled={!workItemsPayload || analyzing}
                  onClick={() => void onRemap()}
                  className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-25)] px-3 py-2 text-xs font-semibold text-[var(--flux-primary-light)] disabled:opacity-40"
                >
                  {t("regenerateMapping")}
                </button>
                <button
                  type="button"
                  disabled={!boardId || analyzing || persistence === false || !workItemsPayload.trim()}
                  onClick={() => void postBackgroundRun({ remapOnly: true })}
                  className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-25)] px-3 py-2 text-xs font-semibold text-[var(--flux-primary-light)] disabled:opacity-40"
                >
                  {t("regenerateMappingBackground")}
                </button>
              </div>
            </div>
            {previewTableView ? (
            <div className="overflow-x-auto rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-12)]">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--flux-primary-alpha-12)] bg-[var(--flux-surface-elevated)] text-xs uppercase tracking-wide text-[var(--flux-text-muted)]">
                    <th className="p-2">{t("colTitle")}</th>
                    <th className="p-2">{t("colBucket")}</th>
                    <th className="p-2">{t("colPriority")}</th>
                    <th className="p-2">{t("colTags")}</th>
                    <th className="p-2">{t("colRationale")}</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-b border-[var(--flux-primary-alpha-08)]">
                      <td className="p-2 align-top">
                        <input
                          className="w-full min-w-[140px] rounded border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-surface-dark)] px-2 py-1 text-[var(--flux-text)]"
                          value={row.title}
                          onChange={(e) =>
                            setPreview((p) => p.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                          }
                        />
                      </td>
                      <td className="p-2 align-top">
                        <select
                          className="w-full min-w-[120px] rounded border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-surface-dark)] px-2 py-1 text-[var(--flux-text)]"
                          value={buckets.some((b) => b.key === row.bucketKey) ? row.bucketKey : buckets[0]?.key || ""}
                          onChange={(e) =>
                            setPreview((p) => p.map((x, j) => (j === i ? { ...x, bucketKey: e.target.value } : x)))
                          }
                        >
                          {(buckets.length ? buckets : [{ key: row.bucketKey, label: row.bucketKey }]).map((b) => (
                            <option key={b.key} value={b.key}>
                              {b.label || b.key}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2 align-top">
                        <select
                          className="w-full rounded border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-surface-dark)] px-2 py-1 text-[var(--flux-text)]"
                          value={row.priority}
                          onChange={(e) =>
                            setPreview((p) => p.map((x, j) => (j === i ? { ...x, priority: e.target.value } : x)))
                          }
                        >
                          <option>Urgente</option>
                          <option>Importante</option>
                          <option>Média</option>
                        </select>
                      </td>
                      <td className="p-2 align-top">
                        <input
                          className="w-full min-w-[100px] rounded border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-surface-dark)] px-2 py-1 text-[var(--flux-text)]"
                          value={row.tags.join(", ")}
                          onChange={(e) =>
                            setPreview((p) =>
                              p.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      tags: e.target.value
                                        .split(",")
                                        .map((s) => s.trim())
                                        .filter(Boolean),
                                    }
                                  : x
                              )
                            )
                          }
                        />
                      </td>
                      <td className="max-w-[200px] p-2 align-top">
                        <details className="text-xs text-[var(--flux-text-muted)]">
                          <summary className="cursor-pointer text-[var(--flux-primary-light)]">{t("colRationale")}</summary>
                          <p className="mt-1 whitespace-pre-wrap">{row.rationale || "—"}</p>
                        </details>
                      </td>
                      <td className="p-2 align-top">
                        <button
                          type="button"
                          className="text-xs text-[var(--flux-danger)]"
                          onClick={() => setPreview((p) => p.filter((_, j) => j !== i))}
                        >
                          {t("removeRow")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            ) : (
            <SpecPlanPreviewCards
              preview={preview}
              buckets={buckets}
              colBucket={t("colBucket")}
              colPriority={t("colPriority")}
              colTags={t("colTags")}
              colRationale={t("colRationale")}
              colTitleField={t("colTitle")}
              removeLabel={t("removeRow")}
              onChangeTitle={(i, title) =>
                setPreview((p) => p.map((x, j) => (j === i ? { ...x, title } : x)))
              }
              onChangeBucket={(i, bucketKey) =>
                setPreview((p) => p.map((x, j) => (j === i ? { ...x, bucketKey } : x)))
              }
              onChangePriority={(i, priority) =>
                setPreview((p) => p.map((x, j) => (j === i ? { ...x, priority } : x)))
              }
              onChangeTags={(i, tags) =>
                setPreview((p) => p.map((x, j) => (j === i ? { ...x, tags } : x)))
              }
              onRemove={(i) => setPreview((p) => p.filter((_, j) => j !== i))}
            />
            )}
            <label className="flex items-start gap-2 text-sm text-[var(--flux-text-muted)]">
              <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-1" />
              <span>{t("acceptCheck")}</span>
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!accept || applying || preview.length === 0}
                onClick={() => void onApply()}
                className="rounded-[var(--flux-rad-sm)] bg-[var(--flux-accent)] px-6 py-3 text-sm font-bold text-[var(--flux-surface-dark)] disabled:opacity-40"
              >
                {applying ? t("applying") : t("applyCards")}
              </button>
              <Link
                href={`${localeRoot}/board/${encodeURIComponent(boardId)}`}
                className="inline-flex items-center rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-25)] px-6 py-3 text-sm font-semibold text-[var(--flux-primary-light)]"
              >
                {t("openBoard")}
              </Link>
            </div>
            {applyMsg ? <p className="text-sm text-[var(--flux-accent)]">{applyMsg}</p> : null}
          </section>
        ) : tab === "review" ? (
          <p className="mt-6 text-sm text-[var(--flux-text-muted)]">{t("reviewEmpty")}</p>
        ) : null}

        {tab === "history" ? (
          <section className="mt-6 space-y-4">
            <h2 className="font-display text-sm font-bold text-[var(--flux-text)]">{t("historyTitle")}</h2>
            {historyErr ? <p className="text-sm text-[var(--flux-danger)]">{historyErr}</p> : null}
            {historyLoading ? <p className="text-sm text-[var(--flux-text-muted)]">{t("historyLoading")}</p> : null}
            {!historyLoading && historyRuns.length === 0 ? (
              <p className="text-sm text-[var(--flux-text-muted)]">{t("historyEmpty")}</p>
            ) : null}
            <ul className="space-y-3">
              {historyRuns.map((hr) => (
                <li
                  key={hr.id}
                  className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-12)] bg-[var(--flux-surface-elevated)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[var(--flux-text)]">{hr.sourceSummary}</p>
                      <p className="mt-1 text-xs text-[var(--flux-text-muted)]">
                        {new Date(hr.createdAt).toLocaleString()} · {hr.methodology} · {hr.status} ·{" "}
                        {t("previewCount", { count: hr.previewCount })}
                      </p>
                      {hr.streamError ? (
                        <p className="mt-1 text-xs text-[var(--flux-danger)]">{hr.streamError}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void restoreFromHistory(hr.id)}
                        className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-25)] px-3 py-1.5 text-xs font-semibold text-[var(--flux-primary-light)]"
                      >
                        {t("historyRestore")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(hr.id)}
                        className="rounded-[var(--flux-rad-sm)] px-3 py-1.5 text-xs font-semibold text-[var(--flux-danger)]"
                      >
                        {t("historyDelete")}
                      </button>
                    </div>
                  </div>
                  {deleteConfirmId === hr.id ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--flux-primary-alpha-08)] pt-3 text-xs">
                      <span className="text-[var(--flux-text-muted)]">{t("historyDeleteConfirm")}</span>
                      <button
                        type="button"
                        onClick={() => void deleteHistoryEntry(hr.id)}
                        className="rounded-[var(--flux-rad-sm)] bg-[var(--flux-danger)] px-3 py-1.5 font-bold text-white"
                      >
                        {t("historyDeleteYes")}
                      </button>
                      <button type="button" onClick={() => setDeleteConfirmId(null)} className="btn-secondary">
                        {t("historyDeleteNo")}
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <SpecPlanAnalysisDrawer
        open={analysisDrawerOpen}
        onClose={() => setAnalysisDrawerOpen(false)}
        analyzing={analyzing}
        phases={analysisPhases.map((p) => ({ key: p.key, label: p.label, state: p.state }))}
        friendlyHints={friendlyHints}
        docMeta={docReadMeta}
        logs={analysisLogs}
        onClearLogs={() => setAnalysisLogs([])}
        streamError={streamError}
        errorDetail={streamErrorDetail}
      />
    </div>
  );
}
