"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type { BoardData, CardData, DailyCreatedCard, DailyInsightEntry } from "@/app/board/[id]/page";
import { useToast } from "@/context/toast-context";
import { getDailyActionSuggestions, getDailyCreateSuggestions } from "../daily-utils";
import type {
  DailyLog,
  DailyStatusPhase,
  DailyTab,
  DailyLogStatus,
} from "../DailyInsightsPanel";

type DailySessionState = {
  transcript: string;
  fileName: string;
  sourceFileName: string;
  generating: boolean;
  tab: DailyTab;
  logs: DailyLog[];
  statusPhase: DailyStatusPhase;
  historyExpandedId: string | null;
  historyCreatedCardsExpandedId: string | null;
  historyDateFrom: string;
  historyDateTo: string;
  historySearchQuery: string;
};

const DAILY_SESSION_STORAGE_KEY = "flux.daily-ia.session.v1";
const DAILY_SESSION_MAX_TRANSCRIPT_CHARS = 15000;
const DAILY_SESSION_MAX_JSON_CHARS = 120000;
const DAILY_SESSION_WRITE_DEBOUNCE_MS = 400;
const DAILY_INSIGHT_TIMEOUT_MS = 60000;

export function useDailySession({
  db,
  updateDb,
  boardId,
  getHeaders,
  directions,
}: {
  db: BoardData;
  updateDb: (updater: (prev: BoardData) => BoardData) => void;
  boardId: string;
  getHeaders: () => Record<string, string>;
  directions: string[];
}) {
  const { pushToast } = useToast();

  const dailyInsights = Array.isArray(db.dailyInsights) ? db.dailyInsights : [];

  const [dailyOpen, setDailyOpen] = useState(false);

  const [dailyTranscript, setDailyTranscript] = useState("");
  const [dailyFileName, setDailyFileName] = useState("Nenhum arquivo anexado");
  const [dailySourceFileName, setDailySourceFileName] = useState("");
  const [dailyGenerating, setDailyGenerating] = useState(false);
  const [dailyTab, setDailyTab] = useState<DailyTab>("entrada");
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [dailyStatusPhase, setDailyStatusPhase] = useState<DailyStatusPhase>("idle");

  const [dailyHistoryExpandedId, setDailyHistoryExpandedId] = useState<string | null>(null);
  const [dailyHistoryCreatedCardsExpandedId, setDailyHistoryCreatedCardsExpandedId] = useState<string | null>(null);
  const [dailyHistoryDateFrom, setDailyHistoryDateFrom] = useState("");
  const [dailyHistoryDateTo, setDailyHistoryDateTo] = useState("");
  const [dailyHistorySearchQuery, setDailyHistorySearchQuery] = useState("");

  const [dailyDeleteConfirmId, setDailyDeleteConfirmId] = useState<string | null>(null);

  const dailyRequestSeqRef = useRef(0);
  const dailyAbortControllerRef = useRef<AbortController | null>(null);
  const dailyInFlightRef = useRef(false);

  const closeDailyModal = useCallback(() => setDailyOpen(false), []);

  const clearDailyInput = useCallback(() => {
    setDailyTranscript("");
    setDailyFileName("Nenhum arquivo anexado");
    setDailySourceFileName("");
    setDailyLogs([]);
    setDailyStatusPhase("idle");
    setDailyHistoryExpandedId(null);
    setDailyHistoryCreatedCardsExpandedId(null);
  }, []);

  const startNewDaily = useCallback(() => {
    setDailyTab("entrada");
    setDailyHistoryExpandedId(null);
    setDailyHistoryCreatedCardsExpandedId(null);

    // Regra original: só limpar entrada quando não há geração em andamento.
    if (!dailyGenerating) {
      clearDailyInput();
      try {
        window.localStorage?.removeItem(DAILY_SESSION_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }, [clearDailyInput, dailyGenerating]);

  const openDailyModal = useCallback(() => {
    setDailyHistoryExpandedId(null);
    setDailyHistoryCreatedCardsExpandedId(null);

    if (!dailyGenerating) {
      // Ao abrir uma execução nova: limpar contexto de entrada.
      setDailyTab("entrada");
      setDailyTranscript("");
      setDailyFileName("Nenhum arquivo anexado");
      setDailySourceFileName("");
      setDailyLogs([]);
      setDailyStatusPhase("idle");
      try {
        window.localStorage?.removeItem(DAILY_SESSION_STORAGE_KEY);
      } catch {
        // ignore
      }
    } else {
      setDailyTab("status");
    }

    setDailyOpen(true);
  }, [dailyGenerating]);

  const openHistoryTab = useCallback(() => setDailyTab("historico"), []);
  const openStatusTab = useCallback(() => setDailyTab("status"), []);

  const loadDailyTranscriptFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result || "");
      setDailyTranscript(text.slice(0, DAILY_SESSION_MAX_TRANSCRIPT_CHARS));
      setDailyFileName(`${file.name} carregado`);
      setDailySourceFileName(file.name);
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  }, []);

  const clearDailyAttachmentAndTranscript = useCallback(() => {
    setDailyTranscript("");
    setDailyFileName("Nenhum arquivo anexado");
    setDailySourceFileName("");
  }, []);

  const performDeleteDailyHistoryEntry = useCallback(
    (entryId: string) => {
      const nextEntry = dailyInsights.find((entry) => entry?.id && entry.id !== entryId);
      updateDb((prev) => ({
        ...prev,
        dailyInsights: (Array.isArray(prev.dailyInsights) ? prev.dailyInsights : []).filter(
          (entry) => entry?.id !== entryId
        ),
      }));

      if (dailyHistoryExpandedId === entryId) {
        setDailyHistoryExpandedId(nextEntry?.id ? String(nextEntry.id) : null);
      }
      if (dailyHistoryCreatedCardsExpandedId === entryId) {
        setDailyHistoryCreatedCardsExpandedId(nextEntry?.id ? String(nextEntry.id) : null);
      }
    },
    [dailyHistoryCreatedCardsExpandedId, dailyHistoryExpandedId, dailyInsights, updateDb]
  );

  const requestDeleteDailyHistoryEntry = useCallback((entryId: string) => {
    setDailyDeleteConfirmId(entryId);
  }, []);

  const cancelDeleteDailyHistoryEntry = useCallback(() => {
    setDailyDeleteConfirmId(null);
  }, []);

  const confirmDeleteDailyHistoryEntry = useCallback(() => {
    if (!dailyDeleteConfirmId) return;
    const entryId = dailyDeleteConfirmId;
    setDailyDeleteConfirmId(null);
    performDeleteDailyHistoryEntry(entryId);
    pushToast({ kind: "success", title: "Resumo excluído." });
  }, [dailyDeleteConfirmId, performDeleteDailyHistoryEntry, pushToast]);

  const slugDaily = useCallback(
    (value: string) =>
      String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    []
  );

  const createCardsFromInsight = useCallback(
    (entryId?: string) => {
      const entry = entryId ? dailyInsights.find((x) => x?.id === entryId) : dailyInsights[0];
      if (!entry?.insight) {
        pushToast({ kind: "error", title: "Resumo não encontrado." });
        return;
      }

      const suggestions = getDailyCreateSuggestions(entry);
      if (!suggestions.length) {
        pushToast({ kind: "error", title: "Não há itens em 'Criar' para transformar em card." });
        return;
      }

      const nowIso = new Date().toISOString();
      updateDb((prev) => {
        const bucketOrder = prev.config.bucketOrder || [];
        const normalizeCardTitle = (value: string) =>
          String(value || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ")
            .trim();

        const existingCardTitles = new Set(prev.cards.map((c) => normalizeCardTitle(c.title)));
        const backlogKey =
          bucketOrder.find((b) => String(b.label || "").toLowerCase() === "backlog")?.key ||
          bucketOrder[0]?.key ||
          "Backlog";

        const nextOrderByBucket: Record<string, number> = {};
        const created: CardData[] = [];
        const createdCardsPayload: DailyCreatedCard[] = [];
        let createdCount = 0;
        let existingCount = 0;

        suggestions.forEach((s, idx) => {
          const normalizedTitle = normalizeCardTitle(s.titulo);
          const alreadyExists = existingCardTitles.has(normalizedTitle);

          const lowerCol = String(s.coluna || "").trim().toLowerCase();
          const mapped = lowerCol
            ? bucketOrder.find(
                (b) =>
                  String(b.key || "").toLowerCase() === lowerCol ||
                  String(b.label || "").toLowerCase() === lowerCol
              )
            : null;
          const bucketKey = mapped ? mapped.key : backlogKey;

          if (!(bucketKey in nextOrderByBucket)) {
            nextOrderByBucket[bucketKey] = prev.cards.filter((c) => c.bucket === bucketKey).length;
          }

          const directionLower = String(s.direcionamento || "").toLowerCase();
          const direction = directions.map((d) => d.toLowerCase()).includes(directionLower) ? directionLower : null;

          const cardPayload: DailyCreatedCard = {
            cardId: alreadyExists ? `EXISTENTE-${idx + 1}` : `AI-${Date.now()}-${idx + 1}`,
            title: s.titulo,
            bucket: bucketKey,
            priority: s.prioridade,
            progress: s.progresso,
            desc: s.descricao || "Criado automaticamente a partir da Daily IA.",
            tags: s.tags?.length ? s.tags : ["Reborn"],
            direction,
            dueDate: s.dataConclusao || null,
            createdAt: nowIso,
            status: alreadyExists ? "existing" : "created",
          };

          if (!alreadyExists) {
            created.push({
              id: cardPayload.cardId,
              bucket: cardPayload.bucket,
              priority: cardPayload.priority,
              progress: cardPayload.progress,
              title: cardPayload.title,
              desc: cardPayload.desc,
              tags: cardPayload.tags,
              links: [],
              direction: cardPayload.direction,
              dueDate: cardPayload.dueDate,
              order: nextOrderByBucket[bucketKey]++,
            } as CardData);
            existingCardTitles.add(normalizedTitle);
            createdCount++;
          } else {
            existingCount++;
          }

          createdCardsPayload.push(cardPayload);
        });

        const nextDailyInsights = Array.isArray(prev.dailyInsights)
          ? prev.dailyInsights.map((insightEntry) => {
              if (!entryId || insightEntry?.id !== entryId) return insightEntry;
              const previousCreated = Array.isArray(insightEntry.createdCards) ? insightEntry.createdCards : [];
              return {
                ...insightEntry,
                createdCards: [...createdCardsPayload, ...previousCreated].slice(0, 100),
              };
            })
          : prev.dailyInsights;

        window.setTimeout(() => {
          if (createdCount > 0 && existingCount > 0) {
            pushToast({
              kind: "success",
              title: `${createdCount} card(s) criado(s) com sucesso.`,
              description: `${existingCount} item(ns) já existia(m) no board e foram apenas sinalizados.`,
            });
            return;
          }
          if (createdCount > 0) {
            pushToast({ kind: "success", title: `${createdCount} card(s) criado(s) com sucesso.` });
            return;
          }
          pushToast({
            kind: "info",
            title: "Nenhum novo card criado.",
            description: "Todos os itens sugeridos já existem no board.",
          });
        }, 0);

        return { ...prev, cards: [...prev.cards, ...created], dailyInsights: nextDailyInsights };
      });

      if (entryId) {
        setDailyHistoryCreatedCardsExpandedId(entryId);
      }
    },
    [dailyInsights, directions, pushToast, updateDb]
  );

  const buildDailyContextDoc = useCallback((entry: DailyInsightEntry) => {
    const insight = entry?.insight;
    const dt = entry?.createdAt ? new Date(entry.createdAt).toLocaleString("pt-BR") : "";
    const createItems = getDailyCreateSuggestions(entry);
    const ajustarItems = getDailyActionSuggestions(insight?.ajustar);
    const corrigirItems = getDailyActionSuggestions(insight?.corrigir);
    const pendenciasItems = getDailyActionSuggestions(insight?.pendencias);
    const curated = String(insight?.contextoOrganizado || "").trim();
    const generatedWithAi = Boolean(entry?.generationMeta?.usedLlm);
    const modelName = String(entry?.generationMeta?.model || "").trim();

    const blocks = [
      `Resumo Daily IA${dt ? ` - ${dt}` : ""}`,
      "",
      generatedWithAi
        ? `Texto aprimorado por IA${modelName ? ` (${modelName})` : ""}`
        : "Texto estruturado automaticamente",
      "",
      `Arquivo de origem: ${String(entry?.sourceFileName || "Transcrição colada no modal")}`,
      "",
      "Resumo executivo:",
      String(insight?.resumo || "Sem resumo."),
      "",
      "Contexto reorganizado e revisado:",
      curated || "Sem conteúdo estruturado para este resumo.",
      "",
      "Ações para criar:",
      ...(createItems.length
        ? createItems.map(
            (x, i) =>
              `${i + 1}. ${x.titulo}${
                x.descricao ? `\n   Descrição: ${x.descricao}` : ""
              }${x.coluna ? `\n   Coluna sugerida: ${x.coluna}` : ""}${
                x.dataConclusao ? `\n   Prazo sugerido: ${x.dataConclusao}` : ""
              }`
          )
        : ["- Sem itens identificados."]),
      "",
      "Ajustes:",
      ...(ajustarItems.length
        ? ajustarItems.map(
            (x, i) =>
              `${i + 1}. ${x.titulo}${
                x.descricao ? `\n   Descrição: ${x.descricao}` : ""
              }${x.coluna ? `\n   Coluna sugerida: ${x.coluna}` : ""}${
                x.dataConclusao ? `\n   Prazo sugerido: ${x.dataConclusao}` : ""
              }`
          )
        : ["- Sem itens identificados."]),
      "",
      "Correções:",
      ...(corrigirItems.length
        ? corrigirItems.map(
            (x, i) =>
              `${i + 1}. ${x.titulo}${
                x.descricao ? `\n   Descrição: ${x.descricao}` : ""
              }${x.coluna ? `\n   Coluna sugerida: ${x.coluna}` : ""}${
                x.dataConclusao ? `\n   Prazo sugerido: ${x.dataConclusao}` : ""
              }`
          )
        : ["- Sem itens identificados."]),
      "",
      "Pendências:",
      ...(pendenciasItems.length
        ? pendenciasItems.map(
            (x, i) =>
              `${i + 1}. ${x.titulo}${
                x.descricao ? `\n   Descrição: ${x.descricao}` : ""
              }${x.coluna ? `\n   Coluna sugerida: ${x.coluna}` : ""}${
                x.dataConclusao ? `\n   Prazo sugerido: ${x.dataConclusao}` : ""
              }`
          )
        : ["- Sem itens identificados."]),
    ];

    return blocks.join("\n");
  }, []);

  const downloadDailyContextDoc = useCallback(
    (entry: DailyInsightEntry) => {
      const a = document.createElement("a");
      const created = entry?.createdAt ? new Date(entry.createdAt) : new Date();
      const stamp = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-${String(
        created.getDate()
      ).padStart(2, "0")}_${String(created.getHours()).padStart(2, "0")}-${String(
        created.getMinutes()
      ).padStart(2, "0")}`;
      const content = buildDailyContextDoc(entry);
      a.href = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
      a.download = `daily-contexto-${stamp}.txt`;
      a.click();
    },
    [buildDailyContextDoc]
  );

  const copyDailyContextDoc = useCallback(
    async (entry: DailyInsightEntry) => {
      const content = buildDailyContextDoc(entry);
      if (!content.trim()) {
        pushToast({ kind: "error", title: "Não há contexto para copiar." });
        return;
      }
      if (!navigator?.clipboard?.writeText) {
        pushToast({ kind: "warning", title: "Seu navegador não suporta cópia automática." });
        return;
      }
      try {
        await navigator.clipboard.writeText(content);
        pushToast({ kind: "success", title: "Contexto copiado para a área de transferência." });
      } catch {
        pushToast({ kind: "error", title: "Não foi possível copiar o contexto." });
      }
    },
    [buildDailyContextDoc, pushToast]
  );

  const openDailyHistoryFromStatusEntry = useCallback((entryId: string) => {
    // Garante vínculo com o Histórico mesmo quando filtros estão ativos.
    setDailyHistoryDateFrom("");
    setDailyHistoryDateTo("");
    setDailyHistorySearchQuery("");
    setDailyHistoryCreatedCardsExpandedId(null);
    setDailyHistoryExpandedId(entryId);
    setDailyTab("historico");
  }, []);

  const onGenerateDailyInsight = useCallback(async () => {
    const transcript = dailyTranscript.trim();
    if (!transcript) {
      pushToast({ kind: "error", title: "Informe ou anexe a transcrição da daily." });
      return;
    }
    if (dailyInFlightRef.current) return;

    dailyInFlightRef.current = true;
    const requestSeq = ++dailyRequestSeqRef.current;
    const controller = new AbortController();
    dailyAbortControllerRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), DAILY_INSIGHT_TIMEOUT_MS);

    const startedAt = new Date().toISOString();
    setDailyGenerating(true);
    setDailyTab("status");
    setDailyStatusPhase("preparing");
    setDailyHistoryExpandedId(null);
    setDailyHistoryCreatedCardsExpandedId(null);

    setDailyLogs((prev) => [
      {
        timestamp: startedAt,
        status: "start" as DailyLogStatus,
        message: "Iniciando geração do resumo prático...",
      },
      ...prev,
    ].slice(0, 50));

    try {
      setDailyStatusPhase("requesting");
      const response = await fetch(`/api/boards/${encodeURIComponent(boardId)}/daily-insights`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ transcript, fileName: dailySourceFileName || undefined }),
        signal: controller.signal,
      });

      setDailyStatusPhase("processing");
      const data = await response.json();

      if (!response.ok) {
        setDailyStatusPhase("error");
        setDailyLogs((prev) => [
          {
            timestamp: new Date().toISOString(),
            status: "error" as DailyLogStatus,
            message: String(data?.error || "Erro ao gerar resumo."),
            errorKind: data?.llmDebug?.errorKind,
            errorMessage: data?.llmDebug?.errorMessage,
            provider: data?.llmDebug?.provider,
            model: data?.llmDebug?.model,
          } as DailyLog,
          ...prev,
        ].slice(0, 50));
        pushToast({ kind: "error", title: String(data?.error || "Erro ao gerar resumo.") });
        return;
      }

      updateDb((prev) => {
        const current = Array.isArray(prev.dailyInsights) ? prev.dailyInsights : [];
        const next = [data.entry, ...current.filter((x) => x?.id !== data.entry?.id)].slice(0, 20);
        return { ...prev, dailyInsights: next };
      });

      const modelName = String(data?.llmDebug?.model || data?.entry?.generationMeta?.model || "").trim();
      const providerName = String(
        data?.llmDebug?.provider || data?.entry?.generationMeta?.provider || ""
      ).trim();
      const generatedWithAI = Boolean(
        data?.llmDebug?.generatedWithAI ?? data?.entry?.generationMeta?.usedLlm
      );
      const errorKind = String(
        data?.llmDebug?.errorKind || data?.entry?.generationMeta?.errorKind || ""
      ).trim();
      const errorMessage = String(data?.llmDebug?.errorMessage || "").trim();
      const hasRealLlmFailure = Boolean(errorKind) || !generatedWithAI;
      const insightResumo = String(data?.entry?.insight?.resumo || "").trim();

      setDailyStatusPhase("done");

      setDailyLogs((prev) => [
        {
          timestamp: new Date().toISOString(),
          status: "success" as DailyLogStatus,
          message: generatedWithAI
            ? "Modelo gerado com sucesso."
            : "Resumo estruturado sem uso efetivo da IA (modo heurístico).",
          model: modelName || undefined,
          provider: providerName || undefined,
          resultSnippet: insightResumo
            ? `Resumo: ${insightResumo.slice(0, 200)}${insightResumo.length > 200 ? "..." : ""}`
            : undefined,
        } as DailyLog,
        ...(hasRealLlmFailure
          ? ([
              {
                timestamp: new Date().toISOString(),
                status: "error" as DailyLogStatus,
                message: `Falha na integração com IA${providerName ? ` (${providerName})` : ""}${
                  modelName ? ` - modelo: ${modelName}` : ""
                }${errorKind ? ` [${errorKind}]` : ""}. Conteúdo tratado em modo heurístico.`,
                errorKind,
                errorMessage: errorMessage || undefined,
                provider: providerName || undefined,
                model: modelName || undefined,
              } as DailyLog,
            ] as DailyLog[])
          : []),
        ...prev,
      ].slice(0, 50));
    } catch (err) {
      const isAbort = err instanceof Error && (err as unknown as { name?: string }).name === "AbortError";
      setDailyStatusPhase("error");
      setDailyLogs((prev) => [
        {
          timestamp: new Date().toISOString(),
          status: "error" as DailyLogStatus,
          message: isAbort ? "Tempo esgotado ao gerar a Daily IA." : "Erro ao gerar resumo com IA.",
        },
        ...prev,
      ].slice(0, 50));

      pushToast({
        kind: isAbort ? "warning" : "error",
        title: isAbort ? "Tempo esgotado ao gerar a Daily IA." : "Erro ao gerar resumo com IA.",
      });
    } finally {
      window.clearTimeout(timeoutId);
      dailyInFlightRef.current = false;
      if (dailyAbortControllerRef.current === controller) dailyAbortControllerRef.current = null;
      if (dailyRequestSeqRef.current === requestSeq) {
        setDailyGenerating(false);
        setDailyStatusPhase("idle");
        setDailyLogs([]);
        setDailyHistoryExpandedId(null);
        setDailyHistoryCreatedCardsExpandedId(null);
        setDailyTranscript("");
        setDailyFileName("Nenhum arquivo anexado");
        setDailySourceFileName("");
        try {
          window.localStorage?.removeItem(DAILY_SESSION_STORAGE_KEY);
        } catch {
          // ignore
        }
      }
    }
  }, [boardId, dailySourceFileName, dailyTranscript, getHeaders, pushToast, updateDb]);

  const statusStepIndex = useMemo(() => {
    return dailyStatusPhase === "preparing"
      ? 1
      : dailyStatusPhase === "requesting"
        ? 2
        : dailyStatusPhase === "processing"
          ? 3
          : dailyStatusPhase === "done"
            ? 4
            : dailyStatusPhase === "error"
              ? 0
              : 0;
  }, [dailyStatusPhase]);

  // Normalização usada nos filtros do histórico.
  const normalizeSearchText = useCallback((value: string) => {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }, []);

  const toLocalDateInputValue = useCallback((isoDate: string | undefined) => {
    if (!isoDate) return "";
    const dt = new Date(isoDate);
    if (Number.isNaN(dt.getTime())) return "";
    const tzOffsetMs = dt.getTimezoneOffset() * 60000;
    return new Date(dt.getTime() - tzOffsetMs).toISOString().slice(0, 10);
  }, []);

  const normalizedDailyHistorySearchQuery = useMemo(
    () => normalizeSearchText(dailyHistorySearchQuery),
    [dailyHistorySearchQuery, normalizeSearchText]
  );

  const dailyInsightsSearchIndex = useMemo(() => {
    return dailyInsights.map((entry) => {
      const insight = (entry as { insight?: unknown } | null | undefined)?.insight as
        | {
            resumo?: unknown;
            contextoOrganizado?: unknown;
            criar?: unknown;
            ajustar?: unknown;
            corrigir?: unknown;
            pendencias?: unknown;
            criarDetalhes?: unknown;
          }
        | undefined;

      const searchable = [
        insight?.resumo,
        insight?.contextoOrganizado,
        ...(Array.isArray(insight?.criar) ? (insight?.criar as unknown[]) : []),
        ...(getDailyActionSuggestions((insight as any)?.ajustar).map(
          (x) => `${x.titulo} ${x.descricao} ${x.prioridade} ${x.progresso}`
        ) ?? []),
        ...(getDailyActionSuggestions((insight as any)?.corrigir).map(
          (x) => `${x.titulo} ${x.descricao} ${x.prioridade} ${x.progresso}`
        ) ?? []),
        ...(getDailyActionSuggestions((insight as any)?.pendencias).map(
          (x) => `${x.titulo} ${x.descricao} ${x.prioridade} ${x.progresso}`
        ) ?? []),
        ...(Array.isArray((insight as any)?.criarDetalhes)
          ? (insight as any).criarDetalhes.map((item: any) => String(item?.titulo || ""))
          : []),
        (entry as any)?.transcript,
        (entry as any)?.sourceFileName,
      ]
        .map((item) => String(item || ""))
        .join(" \n ");

      return {
        entry,
        normalizedSearchable: normalizeSearchText(searchable),
      };
    });
  }, [dailyInsights, normalizeSearchText]);

  const filteredDailyInsights = useMemo(() => {
    return dailyInsightsSearchIndex
      .filter(({ entry, normalizedSearchable }) => {
        const entryDate = toLocalDateInputValue((entry as any)?.createdAt);
        if (dailyHistoryDateFrom && (!entryDate || entryDate < dailyHistoryDateFrom)) return false;
        if (dailyHistoryDateTo && (!entryDate || entryDate > dailyHistoryDateTo)) return false;
        if (!normalizedDailyHistorySearchQuery) return true;
        return normalizedSearchable.includes(normalizedDailyHistorySearchQuery);
      })
      .map(({ entry }) => entry);
  }, [
    dailyHistoryDateFrom,
    dailyHistoryDateTo,
    dailyInsightsSearchIndex,
    normalizedDailyHistorySearchQuery,
    toLocalDateInputValue,
  ]);

  const activeDailyHistoryId = useMemo(() => {
    if (!dailyHistoryExpandedId) return null;
    const existsInFiltered = filteredDailyInsights.some(
      (entry) => String(entry?.id || "") === dailyHistoryExpandedId
    );
    return existsInFiltered ? dailyHistoryExpandedId : null;
  }, [dailyHistoryExpandedId, filteredDailyInsights]);

  const activeCreatedCardsExpandedId = useMemo(() => {
    if (!dailyHistoryExpandedId) return null;
    if (!dailyHistoryCreatedCardsExpandedId) return null;
    const existsInFiltered = filteredDailyInsights.some(
      (entry) => String(entry?.id || "") === dailyHistoryCreatedCardsExpandedId
    );
    return existsInFiltered ? dailyHistoryCreatedCardsExpandedId : null;
  }, [dailyHistoryCreatedCardsExpandedId, dailyHistoryExpandedId, filteredDailyInsights]);

  const onToggleDailyHistoryExpanded = useCallback(
    (entryId: string) => {
      if (!entryId) return;
      if (dailyHistoryExpandedId === entryId) {
        setDailyHistoryExpandedId(null);
        setDailyHistoryCreatedCardsExpandedId(null);
      } else {
        setDailyHistoryExpandedId(entryId);
      }
    },
    [dailyHistoryCreatedCardsExpandedId, dailyHistoryExpandedId]
  );

  const onCollapseDailyHistoryExpanded = useCallback(() => {
    setDailyHistoryExpandedId(null);
    setDailyHistoryCreatedCardsExpandedId(null);
  }, []);

  const expandDailyHistoryCreatedCards = useCallback((entryId: string) => {
    setDailyHistoryCreatedCardsExpandedId(entryId);
  }, []);

  const clearDailyHistoryFilters = useCallback(() => {
    setDailyHistoryDateFrom("");
    setDailyHistoryDateTo("");
    setDailyHistorySearchQuery("");
  }, []);

  // Restaura estado persistido (resume) quando uma execução estava em andamento.
  useEffect(() => {
    const storage = typeof window !== "undefined" ? window.localStorage : null;
    if (!storage) return;

    try {
      const raw = storage.getItem(DAILY_SESSION_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Partial<DailySessionState>;

      if (typeof parsed.transcript === "string") {
        setDailyTranscript(parsed.transcript.slice(0, DAILY_SESSION_MAX_TRANSCRIPT_CHARS));
      }
      if (typeof parsed.fileName === "string") setDailyFileName(parsed.fileName || "Nenhum arquivo anexado");
      if (typeof parsed.sourceFileName === "string") setDailySourceFileName(parsed.sourceFileName);
      if (parsed.tab === "entrada" || parsed.tab === "historico" || parsed.tab === "status") setDailyTab(parsed.tab);
      if (Array.isArray(parsed.logs)) setDailyLogs(parsed.logs.slice(0, 50));
      if (
        parsed.statusPhase === "idle" ||
        parsed.statusPhase === "preparing" ||
        parsed.statusPhase === "requesting" ||
        parsed.statusPhase === "processing" ||
        parsed.statusPhase === "done" ||
        parsed.statusPhase === "error"
      ) {
        setDailyStatusPhase(parsed.statusPhase);
      }
      if (typeof parsed.historyExpandedId === "string" || parsed.historyExpandedId === null) {
        setDailyHistoryExpandedId(parsed.historyExpandedId ?? null);
      }
      if (
        typeof parsed.historyCreatedCardsExpandedId === "string" ||
        parsed.historyCreatedCardsExpandedId === null
      ) {
        setDailyHistoryCreatedCardsExpandedId(parsed.historyCreatedCardsExpandedId ?? null);
      }
      if (typeof parsed.historyDateFrom === "string") setDailyHistoryDateFrom(parsed.historyDateFrom);
      if (typeof parsed.historyDateTo === "string") setDailyHistoryDateTo(parsed.historyDateTo);
      if (typeof parsed.historySearchQuery === "string") setDailyHistorySearchQuery(parsed.historySearchQuery);

      if (parsed.generating) {
        setDailyGenerating(true);
        setDailyOpen(true);
        setDailyTab("status");
        // Sempre abrir colapsado no histórico (requisito do usuário).
        setDailyHistoryExpandedId(null);
        setDailyHistoryCreatedCardsExpandedId(null);
      }
    } catch {
      // Se houver lixo no storage, ignora silenciosamente.
    }
  }, []);

  // Persistência incremental (reduz chance de perder progresso ao fechar/reabrir modal).
  useEffect(() => {
    const storage = typeof window !== "undefined" ? window.localStorage : null;
    if (!storage) return;

    const timeoutId = window.setTimeout(() => {
      const transcriptToStore = dailyTranscript.slice(0, DAILY_SESSION_MAX_TRANSCRIPT_CHARS);

      let payload: DailySessionState = {
        transcript: transcriptToStore,
        fileName: dailyFileName,
        sourceFileName: dailySourceFileName,
        generating: dailyGenerating,
        tab: dailyTab,
        logs: dailyLogs.slice(0, 50),
        statusPhase: dailyStatusPhase,
        historyExpandedId: dailyHistoryExpandedId,
        historyCreatedCardsExpandedId: dailyHistoryCreatedCardsExpandedId,
        historyDateFrom: dailyHistoryDateFrom,
        historyDateTo: dailyHistoryDateTo,
        historySearchQuery: dailyHistorySearchQuery,
      };

      try {
        let json = JSON.stringify(payload);
        if (json.length > DAILY_SESSION_MAX_JSON_CHARS) {
          const hardTranscript = transcriptToStore.slice(
            0,
            Math.min(3500, DAILY_SESSION_MAX_TRANSCRIPT_CHARS)
          );
          payload = { ...payload, transcript: hardTranscript };
          json = JSON.stringify(payload);
          if (json.length > DAILY_SESSION_MAX_JSON_CHARS) {
            payload = { ...payload, transcript: "" };
          }
        }
        storage.setItem(DAILY_SESSION_STORAGE_KEY, JSON.stringify(payload));
      } catch {
        try {
          storage.removeItem(DAILY_SESSION_STORAGE_KEY);
        } catch {
          // ignore
        }
      }
    }, DAILY_SESSION_WRITE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [
    dailyTranscript,
    dailyFileName,
    dailySourceFileName,
    dailyGenerating,
    dailyTab,
    dailyLogs,
    dailyStatusPhase,
    dailyHistoryExpandedId,
    dailyHistoryCreatedCardsExpandedId,
    dailyHistoryDateFrom,
    dailyHistoryDateTo,
    dailyHistorySearchQuery,
  ]);

  return {
    dailyOpen,
    closeDailyModal,
    openDailyModal,
    startNewDaily,

    dailyTab,
    openHistoryTab,
    openStatusTab,

    dailyGenerating,
    dailyStatusPhase,
    statusStepIndex,
    dailyLogs,

    dailyTranscript,
    setDailyTranscript,
    dailyFileName,
    dailySourceFileName,

    dailyInsights,
    filteredDailyInsights,
    activeDailyHistoryId,
    activeCreatedCardsExpandedId,

    dailyHistoryDateFrom,
    setDailyHistoryDateFrom,
    dailyHistoryDateTo,
    setDailyHistoryDateTo,
    dailyHistorySearchQuery,
    setDailyHistorySearchQuery,
    clearDailyHistoryFilters,

    onToggleDailyHistoryExpanded,
    onCollapseDailyHistoryExpanded,
    expandDailyHistoryCreatedCards,

    loadDailyTranscriptFile,
    clearDailyAttachmentAndTranscript,
    onGenerateDailyInsight,
    clearDailyLogs: () => setDailyLogs([]),

    onOpenDailyHistoryFromStatusEntry: openDailyHistoryFromStatusEntry,

    slugDaily,
    onDownloadDailyContextDoc: downloadDailyContextDoc,
    onCopyDailyContextDoc: copyDailyContextDoc,
    onCreateCardsFromInsight: createCardsFromInsight,

    dailyDeleteConfirmId,
    requestDeleteDailyHistoryEntry,
    cancelDeleteDailyHistoryEntry,
    confirmDeleteDailyHistoryEntry,
  };
}

