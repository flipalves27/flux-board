"use client";

import { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import type { CardData, BucketConfig, CardLink, CardDocRef } from "@/app/board/[id]/page";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/context/toast-context";
import { useTranslations } from "next-intl";
import {
  DESCRIPTION_BLOCKS,
  parseDescriptionToBlocks,
  serializeDescriptionBlocks,
} from "@/components/kanban/description-blocks";

interface CardModalProps {
  card: CardData;
  mode: "new" | "edit";
  buckets: BucketConfig[];
  priorities: string[];
  progresses: string[];
  filterLabels: string[];
  boardId: string;
  boardName: string;
  getHeaders: () => Record<string, string>;
  onCreateLabel?: (label: string) => void;
  onDeleteLabel?: (label: string) => void;
  /** Outros cards do board para selecionar dependências (bloqueado por). */
  peerCards?: CardData[];
  onClose: () => void;
  onSave: (card: CardData) => void;
  onDelete?: (cardId: string) => void;
}

const inputBase =
  "w-full px-4 py-3 border border-[rgba(255,255,255,0.12)] rounded-xl text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] transition-all duration-200 outline-none focus:border-[var(--flux-primary)] focus:ring-2 focus:ring-[rgba(108,92,231,0.25)] hover:border-[rgba(255,255,255,0.2)]";

const sectionShell =
  "rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[linear-gradient(148deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.02)_45%,rgba(0,0,0,0.08)_100%)] p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-[border-color,box-shadow] duration-300 ease-out hover:border-[rgba(108,92,231,0.2)] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07),0_16px_48px_-20px_rgba(0,0,0,0.5)]";

function CardModalSection({
  title,
  description,
  headerRight,
  children,
}: {
  title: string;
  description?: string;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={sectionShell}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--flux-text-muted)]">
            {title}
          </h3>
          {description ? (
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-[var(--flux-text-muted)]/90">{description}</p>
          ) : null}
        </div>
        {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function CardModal({
  card,
  mode,
  buckets,
  priorities,
  progresses,
  filterLabels,
  boardId,
  boardName,
  getHeaders,
  onCreateLabel,
  onDeleteLabel,
  peerCards = [],
  onClose,
  onSave,
  onDelete,
}: CardModalProps) {
  type AiContextPhase = "idle" | "preparing" | "requesting" | "processing" | "done" | "error";
  type AiLogStatus = "start" | "success" | "error";
  type AiContextLog = {
    timestamp: string;
    status: AiLogStatus;
    message: string;
    provider?: string;
    model?: string;
    errorKind?: string;
    errorMessage?: string;
    resultSnippet?: string;
  };

  const [aiContextApplied, setAiContextApplied] = useState<{
    usedLlm: boolean;
    provider?: string;
    model?: string;
    at: string;
  } | null>(null);
  const [aiContextBusinessSummary, setAiContextBusinessSummary] = useState("");
  const [aiContextObjective, setAiContextObjective] = useState("");

  const [id, setId] = useState(card.id);
  const [title, setTitle] = useState(card.title);
  const [descBlocks, setDescBlocks] = useState(() => parseDescriptionToBlocks(card.desc));
  const [bucket, setBucket] = useState(card.bucket);
  const [priority, setPriority] = useState(card.priority);
  const [progress, setProgress] = useState(card.progress);
  const [dueDate, setDueDate] = useState(card.dueDate || "");
  const [blockedBy, setBlockedBy] = useState<string[]>(() =>
    Array.isArray(card.blockedBy) ? [...card.blockedBy] : []
  );
  const [depSearch, setDepSearch] = useState("");
  const [tags, setTags] = useState<Set<string>>(new Set(card.tags || []));
  const [newLabel, setNewLabel] = useState("");
  const [links, setLinks] = useState<CardLink[]>(card.links && card.links.length > 0 ? [...card.links] : []);
  const [docRefs, setDocRefs] = useState<CardDocRef[]>(Array.isArray(card.docRefs) ? [...card.docRefs] : []);
  const [docQuery, setDocQuery] = useState("");
  const [docResults, setDocResults] = useState<Array<{ id: string; title: string; excerpt?: string }>>([]);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const { pushToast } = useToast();
  const t = useTranslations("kanban");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [aiContextOpen, setAiContextOpen] = useState(false);
  const [aiContextPhase, setAiContextPhase] = useState<AiContextPhase>("idle");
  const [aiContextLogs, setAiContextLogs] = useState<AiContextLog[]>([]);
  const aiContextInFlightRef = useRef(false);
  const aiContextAbortControllerRef = useRef<AbortController | null>(null);
  const aiContextRequestSeqRef = useRef(0);

  const descriptionForSave = serializeDescriptionBlocks(descBlocks);

  const selfId = useMemo(() => id.trim() || card.id, [id, card.id]);

  const selectablePeers = useMemo(() => {
    return peerCards.filter((c) => c.id && c.id !== selfId);
  }, [peerCards, selfId]);

  const filteredPeers = useMemo(() => {
    const q = depSearch.trim().toLowerCase();
    if (!q) return selectablePeers;
    return selectablePeers.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
    );
  }, [selectablePeers, depSearch]);
  const aiContextCanGenerate = Boolean(title.trim() && descriptionForSave.trim());
  const aiContextBusy =
    aiContextPhase === "preparing" || aiContextPhase === "requesting" || aiContextPhase === "processing";
  const aiContextStatusStepIndex =
    aiContextPhase === "preparing"
      ? 1
      : aiContextPhase === "requesting"
        ? 2
        : aiContextPhase === "processing"
          ? 3
          : aiContextPhase === "done"
            ? 4
            : aiContextPhase === "error"
              ? 0
              : 0;

  useModalA11y({
    // Evita conflitos de focus trap quando abrimos o ConfirmDialog.
    open: !confirmDeleteOpen,
    onClose,
    containerRef: dialogRef,
    initialFocusRef: closeBtnRef,
  });

  useEffect(() => {
    setId(card.id);
    setTitle(card.title);
    setDescBlocks(parseDescriptionToBlocks(card.desc));
    setAiContextApplied(null);
    setAiContextBusinessSummary("");
    setAiContextObjective("");
    setBucket(card.bucket);
    setPriority(card.priority);
    setProgress(card.progress);
    setDueDate(card.dueDate || "");
    setBlockedBy(Array.isArray(card.blockedBy) ? [...card.blockedBy] : []);
    setDepSearch("");
    setTags(new Set(card.tags || []));
    setNewLabel("");
    setLinks(card.links && card.links.length > 0 ? [...card.links] : []);
    setDocRefs(Array.isArray(card.docRefs) ? [...card.docRefs] : []);
    setDocQuery("");
    setDocResults([]);
  }, [card]);

  useEffect(() => {
    const q = docQuery.trim();
    if (!q) {
      setDocResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/docs/search?q=${encodeURIComponent(q)}&limit=8`, { headers: getHeaders() });
        const data = (await res.json().catch(() => ({}))) as { docs?: Array<{ id: string; title: string; excerpt?: string }> };
        setDocResults(Array.isArray(data.docs) ? data.docs : []);
      } catch {
        setDocResults([]);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [docQuery, getHeaders]);

  const toggleTag = (t: string) => {
    setTags((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const handleSave = () => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      pushToast({ kind: "error", title: t("cardModal.toasts.missingTitle") });
      return;
    }
    const finalId = id.trim() || (mode === "new" ? `NEW-${Date.now()}` : card.id);
    const validIds = new Set(selectablePeers.map((c) => c.id));
    const nextBlocked = blockedBy.filter((bid) => validIds.has(bid));
    onSave({
      ...card,
      id: finalId,
      title: normalizedTitle,
      desc: descriptionForSave.trim() || "Sem descrição.",
      bucket,
      priority,
      progress,
      dueDate: dueDate || null,
      blockedBy: nextBlocked,
      tags: [...tags],
      links: links.filter((l) => l.url.trim()),
      docRefs,
      order: card.order ?? 0,
    });
  };

  const handleCreateLabel = () => {
    const normalized = newLabel.trim();
    if (!normalized) return;
    onCreateLabel?.(normalized);
    setTags((prev) => new Set([...prev, normalized]));
    setNewLabel("");
  };

  const handleDeleteLabel = (label: string) => {
    onDeleteLabel?.(label);
    setTags((prev) => {
      const next = new Set(prev);
      next.delete(label);
      return next;
    });
  };

  const generateAiContextForCard = async () => {
    const normalizedTitle = title.trim();
    const d = descriptionForSave.trim();
    if (!normalizedTitle || !d) {
      pushToast({
        kind: "error",
        title: t("cardModal.toasts.missingTitleAndDescription"),
      });
      return;
    }
    if (aiContextInFlightRef.current) return;

    const CARD_CONTEXT_TIMEOUT_MS = 60000;
    aiContextInFlightRef.current = true;
    const requestSeq = ++aiContextRequestSeqRef.current;
    const controller = new AbortController();
    aiContextAbortControllerRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), CARD_CONTEXT_TIMEOUT_MS);

    const startedAt = new Date().toISOString();
    setAiContextOpen(true);
    setAiContextPhase("preparing");
    setAiContextBusinessSummary("");
    setAiContextObjective("");
    setAiContextApplied(null);
    setAiContextLogs([
      {
        timestamp: startedAt,
        status: "start",
        message: t("cardModal.logs.preparingContext"),
      },
    ]);

    try {
      setAiContextPhase("requesting");
      const response = await fetch(`/api/boards/${encodeURIComponent(boardId)}/card-context`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ title: normalizedTitle, description: d }),
        signal: controller.signal,
      });
      setAiContextPhase("processing");

      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        titulo?: string;
        descricao?: string;
        resumoNegocio?: string;
        objetivo?: string;
        generatedWithAI?: boolean;
        provider?: string;
        model?: string;
        llmDebug?: {
          generatedWithAI?: boolean;
          provider?: string;
          model?: string;
          errorKind?: string;
          errorMessage?: string;
        };
      };

      if (!response.ok) {
        const message = String(data?.error || t("cardModal.logs.contextGenerationErrorFallback"));
        setAiContextPhase("error");
        setAiContextLogs((prev) => [
          {
            timestamp: new Date().toISOString(),
            status: "error",
            message,
            provider: String(data?.provider || data?.llmDebug?.provider || "").trim() || undefined,
            model: String(data?.model || data?.llmDebug?.model || "").trim() || undefined,
            errorKind: String(data?.llmDebug?.errorKind || "").trim() || undefined,
            errorMessage: String(data?.llmDebug?.errorMessage || "").trim() || undefined,
          },
          ...prev,
        ]);
        pushToast({ kind: "error", title: message });
        return;
      }

      const nextTitle = String(data?.titulo || "").trim();
      const nextDesc = String(data?.descricao || "").trim();

      if (nextTitle) setTitle(nextTitle);
      if (nextDesc) setDescBlocks(parseDescriptionToBlocks(nextDesc));

      const usedLlm =
        Boolean(data?.generatedWithAI) ||
        Boolean(data?.llmDebug?.generatedWithAI) ||
        Boolean((data as any)?.usedLlm);

      const providerName = String(data?.provider || data?.llmDebug?.provider || "").trim() || undefined;
      const modelName = String(data?.model || data?.llmDebug?.model || "").trim() || undefined;

      setAiContextApplied({
        usedLlm,
        provider: providerName,
        model: modelName,
        at: new Date().toISOString(),
      });
      setAiContextBusinessSummary(String(data?.resumoNegocio || "").trim());
      setAiContextObjective(String(data?.objetivo || "").trim());

      setAiContextPhase("done");
      setAiContextLogs((prev) => [
        {
          timestamp: new Date().toISOString(),
          status: "success",
          message: usedLlm ? t("cardModal.logs.contextGeneratedByAI") : t("cardModal.logs.contextStructuredFallback"),
          provider: providerName,
          model: modelName,
          resultSnippet: String(data?.objetivo || data?.resumoNegocio || "").trim().slice(0, 180) || undefined,
        },
        ...prev,
      ]);
    } catch (err) {
      const isAbort = err instanceof Error && (err as unknown as { name?: string }).name === "AbortError";
      setAiContextPhase("error");
      setAiContextLogs((prev) => [
        {
          timestamp: new Date().toISOString(),
          status: "error",
          message: isAbort ? t("cardModal.logs.contextTimeout") : t("cardModal.logs.contextError"),
        },
        ...prev,
      ]);
      pushToast({
        kind: isAbort ? "warning" : "error",
        title: isAbort ? t("cardModal.logs.contextTimeout") : t("cardModal.logs.contextError"),
      });
    } finally {
      window.clearTimeout(timeoutId);
      aiContextInFlightRef.current = false;
      if (aiContextAbortControllerRef.current === controller) aiContextAbortControllerRef.current = null;
      if (aiContextRequestSeqRef.current === requestSeq) {
        // Modal permanece aberto para exibir o resultado.
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-6 card-modal-backdrop">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xl motion-safe:transition-[background-color] motion-safe:duration-300"
        aria-hidden
        onClick={onClose}
      />
      <div
        className="relative flex w-full max-w-[760px] flex-col overflow-hidden rounded-3xl border border-[rgba(108,92,231,0.22)] bg-[var(--flux-surface-card)] shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset,0_32px_96px_-24px_rgba(0,0,0,0.65),0_0_120px_-40px_rgba(108,92,231,0.35)] max-h-[min(90vh,880px)] card-modal-content"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-modal-title"
        tabIndex={-1}
      >
        <div
          className="card-modal-accent h-[3px] shrink-0"
          style={{
            background: "linear-gradient(90deg, var(--flux-primary), var(--flux-secondary), var(--flux-primary))",
            backgroundSize: "200% 100%",
          }}
        />

        <header className="relative shrink-0 overflow-hidden border-b border-[rgba(255,255,255,0.06)] px-8 pb-5 pt-7">
          <div
            className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full opacity-[0.14] blur-3xl motion-safe:transition-opacity"
            style={{
              background: "radial-gradient(circle at center, var(--flux-primary) 0%, transparent 68%)",
            }}
          />
          <div
            className="pointer-events-none absolute -left-16 bottom-0 h-40 w-40 rounded-full opacity-[0.08] blur-3xl"
            style={{
              background: "radial-gradient(circle at center, var(--flux-secondary) 0%, transparent 70%)",
            }}
          />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-2.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--flux-text-muted)]">
                  {mode === "edit" ? t("cardModal.modePill.edit") : t("cardModal.modePill.create")}
                </span>
                {mode === "edit" && (
                  <span className="inline-flex items-center rounded-full border border-[rgba(116,185,255,0.35)] bg-[rgba(116,185,255,0.1)] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--flux-info)]">
                    {card.id}
                  </span>
                )}
              </div>
              <h2 id="card-modal-title" className="font-display text-2xl font-bold tracking-tight text-[var(--flux-text)]">
                {mode === "edit" ? t("cardModal.header.title.edit") : t("cardModal.header.title.new")}
              </h2>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-[var(--flux-text-muted)]">
                {mode === "edit"
                  ? t("cardModal.header.description.edit")
                  : t("cardModal.header.description.new")}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              ref={closeBtnRef}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] text-[var(--flux-text-muted)] motion-safe:transition-all motion-safe:duration-200 hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--flux-text)] motion-safe:hover:rotate-90 active:scale-95"
              aria-label={t("cardModal.aria.close")}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6 scrollbar-kanban">
          <div className="space-y-5">
            <CardModalSection
              title={t("cardModal.sections.identification.title")}
              description={t("cardModal.sections.identification.description")}
            >
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
                  {t("cardModal.fields.id.label")}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    placeholder={t("cardModal.fields.id.placeholder")}
                    className={`${inputBase} flex-1`}
                  />
                  <CustomTooltip content={t("cardModal.aiContext.tooltips.trigger")}>
                    <button
                      type="button"
                      onClick={generateAiContextForCard}
                      disabled={!aiContextCanGenerate || aiContextBusy}
                      aria-label={t("cardModal.aiContext.tooltips.triggerAria")}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-[var(--flux-primary-light)] transition-all duration-200 motion-safe:active:scale-95 ${
                        !aiContextCanGenerate || aiContextBusy
                          ? "cursor-not-allowed border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.03)] opacity-45"
                          : "border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] hover:border-[rgba(108,92,231,0.45)] hover:bg-[rgba(108,92,231,0.14)] hover:shadow-[0_0_0_3px_rgba(108,92,231,0.12),0_8px_24px_-8px_rgba(108,92,231,0.25)]"
                      }`}
                      title={t("cardModal.aiContext.tooltips.triggerTitle")}
                    >
                      <span className="text-lg" aria-hidden>
                        🧠
                      </span>
                    </button>
                  </CustomTooltip>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
                  {t("cardModal.fields.column.label")}
                </label>
                <select
                  value={bucket}
                  onChange={(e) => setBucket(e.target.value)}
                  className={inputBase}
                >
                  {buckets.map((b) => (
                    <option key={b.key} value={b.key}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            </CardModalSection>

            <CardModalSection
              title={t("cardModal.sections.content.title")}
              description={t("cardModal.sections.content.description")}
            >
            <div>
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
                {t("cardModal.fields.title.label")}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setAiContextApplied(null);
                }}
                placeholder={t("cardModal.fields.title.placeholder")}
                className={`${inputBase} text-base font-medium`}
              />
              {aiContextApplied && (
                <div className="mt-2">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] border font-semibold ${
                      aiContextApplied.usedLlm
                        ? "bg-[rgba(108,92,231,0.12)] border-[rgba(108,92,231,0.35)] text-[var(--flux-primary-light)]"
                        : "bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.12)] text-[var(--flux-text-muted)]"
                    }`}
                  >
                    {aiContextApplied.usedLlm ? t("cardModal.badges.aiGenerated") : t("cardModal.badges.aiFallbackStructured")}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
                {t("cardModal.fields.description.label")}
              </label>
              <div className="rounded-xl border border-[rgba(108,92,231,0.22)] bg-[var(--flux-surface-mid)]/95 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
                <div className="space-y-3">
                  {DESCRIPTION_BLOCKS.map((block) => (
                    <div key={block.key}>
                      <label className="mb-1.5 block font-display text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                        {block.label}
                      </label>
                      <textarea
                        value={descBlocks[block.key] || ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setDescBlocks((prev) => ({ ...prev, [block.key]: value }));
                          setAiContextApplied(null);
                        }}
                        placeholder={block.placeholder}
                        rows={3}
                        className="min-h-[90px] w-full resize-y rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] p-3 text-sm leading-relaxed text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] outline-none transition-all duration-200 focus:border-[var(--flux-primary)] focus:shadow-[0_0_0_3px_rgba(108,92,231,0.12)] focus:ring-0 whitespace-pre-wrap"
                      />
                    </div>
                  ))}
                </div>
              </div>
              {aiContextApplied && (
                <div className="mt-2">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] border font-semibold ${
                      aiContextApplied.usedLlm
                        ? "bg-[rgba(108,92,231,0.12)] border-[rgba(108,92,231,0.35)] text-[var(--flux-primary-light)]"
                        : "bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.12)] text-[var(--flux-text-muted)]"
                    }`}
                  >
                    {aiContextApplied.usedLlm ? t("cardModal.badges.aiGeneratedText") : t("cardModal.badges.aiFallbackStructuredDescription")}
                  </span>
                </div>
              )}
            </div>
            </CardModalSection>

            <CardModalSection
              title={t("cardModal.sections.statusDue.title")}
              description={t("cardModal.sections.statusDue.description")}
            >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
                  {t("cardModal.fields.priority.label")}
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className={inputBase}
                >
                  {priorities.map((p) => (
                    <option key={p} value={p}>
                      {t(`cardModal.options.priority.${p}`) ?? p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
                  {t("cardModal.fields.progress.label")}
                </label>
                <select
                  value={progress}
                  onChange={(e) => setProgress(e.target.value)}
                  className={inputBase}
                >
                  {progresses.map((p) => (
                    <option key={p} value={p}>
                      {t(`cardModal.options.progress.${p}`) ?? p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
                  {t("cardModal.fields.dueDate.label")}
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={inputBase}
                />
              </div>
            </div>
            </CardModalSection>

            <CardModalSection
              title={t("cardModal.sections.dependencies.title")}
              description={t("cardModal.sections.dependencies.description")}
            >
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wider font-display">
                  {t("cardModal.fields.blockedBy.label")}
                </label>
                <input
                  type="search"
                  value={depSearch}
                  onChange={(e) => setDepSearch(e.target.value)}
                  placeholder={t("cardModal.fields.blockedBy.placeholder")}
                  className={inputBase}
                  autoComplete="off"
                />
                <p className="text-[11px] text-[var(--flux-text-muted)]">{t("cardModal.fields.blockedBy.hint")}</p>
                {selectablePeers.length === 0 ? (
                  <p className="text-sm text-[var(--flux-text-muted)]">{t("cardModal.fields.blockedBy.empty")}</p>
                ) : (
                  <ul
                    className="max-h-48 overflow-y-auto rounded-xl border border-[rgba(255,255,255,0.1)] divide-y divide-[rgba(255,255,255,0.06)] bg-[rgba(0,0,0,0.12)]"
                    role="listbox"
                    aria-multiselectable
                  >
                    {filteredPeers.map((c) => {
                      const checked = blockedBy.includes(c.id);
                      return (
                        <li key={c.id} role="option" aria-selected={checked}>
                          <label className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-[rgba(108,92,231,0.08)]">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setBlockedBy((prev) =>
                                  prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                                )
                              }
                              className="mt-1 rounded border-[rgba(255,255,255,0.2)]"
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-[var(--flux-text)] truncate">{c.title}</span>
                              <span className="block text-[11px] font-mono text-[var(--flux-text-muted)]">{c.id}</span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {selectablePeers.length > 0 && filteredPeers.length === 0 && depSearch.trim() ? (
                  <p className="text-sm text-[var(--flux-text-muted)]">{t("cardModal.fields.blockedBy.noMatch")}</p>
                ) : null}
              </div>
            </CardModalSection>

            <CardModalSection
              title={t("cardModal.sections.labels.title")}
              description={t("cardModal.sections.labels.description")}
            >
            <div>
              <label className="sr-only">{t("cardModal.fields.newLabel.srLabel")}</label>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateLabel();
                    }
                  }}
                  placeholder={t("cardModal.fields.newLabel.placeholder")}
                  className={`${inputBase} py-2.5`}
                />
                <button
                  type="button"
                  onClick={handleCreateLabel}
                  className="px-4 rounded-xl text-sm font-semibold border border-[var(--flux-primary)] bg-[rgba(108,92,231,0.15)] text-[var(--flux-primary-light)] hover:bg-[rgba(108,92,231,0.25)] hover:shadow-[0_0_0_3px_rgba(108,92,231,0.15)] transition-all duration-200 font-display whitespace-nowrap"
                >
                  {t("cardModal.buttons.createLabel")}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {filterLabels.map((label) => (
                  <div key={label} className="group relative">
                    <button
                      type="button"
                      onClick={() => toggleTag(label)}
                      className={`pl-4 pr-8 py-2 rounded-xl text-sm font-semibold border transition-all duration-200 font-display ${
                        tags.has(label)
                          ? "bg-[var(--flux-primary)] text-white border-[var(--flux-primary)] shadow-sm"
                          : "bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] border-[rgba(255,255,255,0.12)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] hover:bg-[rgba(108,92,231,0.1)]"
                      }`}
                    >
                      {label}
                    </button>
                    <CustomTooltip content={t("cardModal.tooltips.deleteLabel", { label })}>
                      <button
                        type="button"
                        onClick={() => handleDeleteLabel(label)}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md flex items-center justify-center text-[var(--flux-text-muted)] hover:text-[var(--flux-danger)] hover:bg-[rgba(255,107,107,0.15)] transition-all duration-200 opacity-60 group-hover:opacity-100"
                        aria-label={t("cardModal.tooltips.deleteLabelAria", { label })}
                      >
                        ×
                      </button>
                    </CustomTooltip>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[var(--flux-surface-elevated)]/50 overflow-hidden transition-all duration-200">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[rgba(255,255,255,0.06)]">
                <span className="text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wider flex items-center gap-2 font-display">
                  <svg className="w-3.5 h-3.5 text-[var(--flux-primary-light)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  {t("cardModal.sections.links.title")}
                </span>
                <button
                  type="button"
                  onClick={() => setLinks((prev) => [...prev, { url: "", label: "" }])}
                  className="text-xs font-semibold text-[var(--flux-primary-light)] hover:text-[var(--flux-primary)] px-2 py-1 rounded-lg hover:bg-[rgba(108,92,231,0.12)] transition-colors"
                >
                  {t("cardModal.sections.links.addButton")}
                </button>
              </div>
              <ul className="divide-y divide-[rgba(255,255,255,0.06)] max-h-[200px] overflow-y-auto scrollbar-kanban">
                {links.length === 0 ? (
                  <li className="px-4 py-4 text-center text-xs text-[var(--flux-text-muted)]">
                    {t("cardModal.sections.links.empty")}
                  </li>
                ) : (
                  links.map((link, idx) => (
                    <li key={idx} className="px-4 py-2.5 flex items-center gap-2 group">
                      <input
                        type="url"
                        value={link.url}
                        onChange={(e) =>
                          setLinks((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], url: e.target.value };
                            return next;
                          })
                        }
                        placeholder={t("cardModal.sections.links.urlPlaceholder")}
                        className="flex-1 min-w-0 px-3 py-2 text-sm border border-[rgba(255,255,255,0.12)] rounded-lg bg-[var(--flux-surface-card)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] focus:ring-1 focus:ring-[var(--flux-primary)]/20 outline-none transition-all"
                      />
                      <input
                        type="text"
                        value={link.label ?? ""}
                        onChange={(e) =>
                          setLinks((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], label: e.target.value };
                            return next;
                          })
                        }
                        placeholder={t("cardModal.sections.links.labelPlaceholder")}
                        className="w-32 shrink-0 px-3 py-2 text-sm border border-[rgba(255,255,255,0.12)] rounded-lg bg-[var(--flux-surface-card)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] focus:ring-1 focus:ring-[var(--flux-primary)]/20 outline-none transition-all"
                      />
                      {link.url.trim() ? (
                        <CustomTooltip content={t("cardModal.sections.links.tooltips.view")}>
                          <a
                            href={link.url.trim()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--flux-primary-light)] hover:bg-[rgba(108,92,231,0.15)] transition-colors shrink-0"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          </a>
                        </CustomTooltip>
                      ) : null}
                      <CustomTooltip content={t("cardModal.sections.links.tooltips.remove")}>
                        <button
                          type="button"
                          onClick={() => setLinks((prev) => prev.filter((_, i) => i !== idx))}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--flux-text-muted)] hover:bg-[rgba(255,107,107,0.15)] hover:text-[var(--flux-danger)] transition-colors opacity-70 group-hover:opacity-100"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </CustomTooltip>
                    </li>
                  ))
                )}
              </ul>
            </div>
            </CardModalSection>

            <CardModalSection title="Documentos vinculados" description="Anexe docs da base de conhecimento para contexto do card.">
              <div className="space-y-2">
                <input
                  type="text"
                  value={docQuery}
                  onChange={(e) => setDocQuery(e.target.value)}
                  placeholder="Buscar docs..."
                  className={inputBase}
                />
                {docQuery.trim() && (
                  <div className="max-h-[160px] overflow-auto rounded-xl border border-[rgba(255,255,255,0.08)] bg-[var(--flux-surface-mid)]">
                    {docResults.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-[var(--flux-text-muted)]">Nenhum doc encontrado.</div>
                    ) : (
                      docResults.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          className="block w-full border-b border-[rgba(255,255,255,0.06)] px-3 py-2 text-left hover:bg-[rgba(255,255,255,0.04)]"
                          onClick={() =>
                            setDocRefs((prev) => {
                              if (prev.some((r) => r.docId === d.id)) return prev;
                              return [...prev, { docId: d.id, title: d.title, excerpt: d.excerpt }];
                            })
                          }
                        >
                          <div className="text-xs font-semibold text-[var(--flux-text)]">{d.title}</div>
                          <div className="text-[11px] text-[var(--flux-text-muted)]">{d.excerpt || ""}</div>
                        </button>
                      ))
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {docRefs.map((r) => (
                    <span key={r.docId} className="inline-flex items-center gap-2 rounded-lg border border-[rgba(108,92,231,0.28)] bg-[rgba(108,92,231,0.12)] px-2 py-1 text-xs text-[var(--flux-primary-light)]">
                      {r.title || r.docId}
                      <button
                        type="button"
                        className="text-[var(--flux-text-muted)] hover:text-[var(--flux-danger)]"
                        onClick={() => setDocRefs((prev) => prev.filter((x) => x.docId !== r.docId))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </CardModalSection>
          </div>

          <div className="flex gap-3 justify-end mt-8 pt-6 border-t border-[rgba(255,255,255,0.08)] flex-wrap">
            {mode === "edit" && onDelete && (
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteOpen(true);
                }}
                className="mr-auto btn-danger"
              >
                {t("cardModal.buttons.delete")}
              </button>
            )}
            <button type="button" onClick={onClose} className="btn-secondary">
              {t("cardModal.buttons.cancel")}
            </button>
            <button type="button" onClick={handleSave} className="btn-primary">
              {t("cardModal.buttons.save")}
            </button>
          </div>
        </div>
        {aiContextOpen && (
          <div
            className="fixed inset-0 z-[420] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-context-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="w-full max-w-2xl bg-[var(--flux-surface-card)] border border-[rgba(108,92,231,0.2)] rounded-[var(--flux-rad)] p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3
                    id="ai-context-title"
                    className="font-display font-bold text-[var(--flux-text)] text-base"
                  >
                    {t("cardModal.aiContext.title")}
                  </h3>
                  <p className="text-xs text-[var(--flux-text-muted)]">
                    {t("cardModal.aiContext.boardLabel", {
                      boardName: boardName || t("cardModal.aiContext.boardFallback"),
                    })}
                  </p>
                </div>
                <button type="button" onClick={() => setAiContextOpen(false)} className="btn-secondary">
                  {t("cardModal.aiContext.close")}
                </button>
              </div>

              <div className="mb-3 rounded-[10px] border border-[rgba(108,92,231,0.28)] bg-[var(--flux-surface-mid)] p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-xs font-semibold text-[var(--flux-primary-light)]">
                    {t("cardModal.aiContext.trackingTitle")}
                  </div>
                  <div className="text-[11px] text-[var(--flux-text-muted)]">
                    {aiContextBusy
                      ? t("cardModal.aiContext.status.busy")
                      : aiContextPhase === "done"
                        ? t("cardModal.aiContext.status.done")
                        : aiContextPhase === "error"
                          ? t("cardModal.aiContext.status.error")
                          : t("cardModal.aiContext.status.idle")}
                  </div>
                </div>
                <div className="h-2 rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
                  <div
                    className="h-full bg-[linear-gradient(90deg,var(--flux-primary),var(--flux-secondary))] transition-all duration-700 ease-out"
                    style={{
                      width: `${aiContextPhase === "idle" ? 0 : Math.max(6, Math.min(100, aiContextStatusStepIndex * 25))}%`,
                      opacity: aiContextBusy ? 0.95 : 0.85,
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 mt-2">
                  {[t("cardModal.aiContext.steps.preparing"), t("cardModal.aiContext.steps.sending"), t("cardModal.aiContext.steps.processing"), t("cardModal.aiContext.steps.done")].map(
                    (step, idx) => {
                    const stepPos = idx + 1;
                    const active = aiContextStatusStepIndex >= stepPos;
                    return (
                      <div
                        key={step}
                        className={`text-[10px] rounded-[6px] px-2 py-1 border ${
                          active
                            ? "border-[rgba(108,92,231,0.45)] text-[var(--flux-primary-light)] bg-[rgba(108,92,231,0.12)]"
                            : "border-[rgba(255,255,255,0.1)] text-[var(--flux-text-muted)]"
                        }`}
                      >
                        {step}
                      </div>
                    );
                    }
                  )}
                </div>
              </div>

              {aiContextBusy ? (
                aiContextLogs.length > 0 ? (
                  <div className="bg-[var(--flux-surface-mid)] border border-[rgba(108,92,231,0.35)] rounded-[10px] p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)]">
                        {t("cardModal.aiContext.log.title")}
                      </div>
                      <button
                        type="button"
                        className="text-[10px] text-[var(--flux-text-muted)] hover:text-[var(--flux-primary-light)] underline-offset-2 hover:underline"
                        onClick={() => setAiContextLogs([])}
                      >
                        {t("cardModal.aiContext.log.clearButton")}
                      </button>
                    </div>
                    <div className="max-h-56 overflow-auto space-y-1 scrollbar-flux">
                      {aiContextLogs.map((log, index) => {
                        const dt = new Date(log.timestamp).toLocaleTimeString("pt-BR");
                        const baseClass =
                          log.status === "success"
                            ? "text-[var(--flux-primary-light)]"
                            : log.status === "error"
                              ? "text-[#F97373]"
                              : "text-[var(--flux-text-muted)]";
                        return (
                          <div key={`${log.timestamp}-${index}`} className="text-[11px] flex items-start gap-2">
                            <span className="text-[10px] text-[var(--flux-text-muted)] min-w-[54px]">{dt}</span>
                            <div className={`flex-1 ${baseClass} space-y-0.5`}>
                              <div>{log.message}</div>
                              {log.provider || log.model ? (
                                <div className="text-[10px] text-[var(--flux-text-muted)]">
                                  {log.provider && (
                                    <span>
                                      {t("cardModal.aiContext.log.llmPrefix")} {log.provider}
                                    </span>
                                  )}
                                  {log.provider && log.model ? <span> • </span> : null}
                                  {log.model && (
                                    <span>
                                      {t("cardModal.aiContext.log.modelPrefix")} {log.model}
                                    </span>
                                  )}
                                </div>
                              ) : null}
                              {log.errorKind ? (
                                <div className="text-[10px] text-[var(--flux-text-muted)]">
                                  {t("cardModal.aiContext.log.errorPrefix")} {log.errorKind}
                                  {log.errorMessage ? ` - ${log.errorMessage}` : ""}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--flux-text-muted)] mt-4">
                    {t("cardModal.aiContext.log.emptyMessage")}
                  </p>
                )
              ) : (
                <div className="mt-4 bg-[var(--flux-surface-mid)] border border-[rgba(108,92,231,0.35)] rounded-[10px] p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)]">
                      {t("cardModal.aiContext.result.appliedHeader")}
                    </div>
                    <span className="text-[10px] text-[var(--flux-text-muted)]">
                      {aiContextPhase === "done"
                        ? aiContextApplied?.usedLlm
                          ? t("cardModal.aiContext.result.applied.ai")
                          : t("cardModal.aiContext.result.applied.fallback")
                        : aiContextPhase === "error"
                          ? t("cardModal.aiContext.result.status.error")
                          : ""}
                    </span>
                  </div>

                  {aiContextPhase === "done" && aiContextApplied ? (
                    <div className="space-y-2">
                      <div className="text-xs text-[var(--flux-text-muted)]">
                        {t("cardModal.aiContext.result.autoFilledText")}
                      </div>
                      {(aiContextBusinessSummary || aiContextObjective) && (
                        <div className="rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] p-3">
                          {aiContextBusinessSummary ? (
                            <div className="text-[11px] mb-2">
                              <span className="font-semibold text-[var(--flux-text)]">{t("cardModal.aiContext.result.businessLabel")}</span>{" "}
                              <span className="text-[var(--flux-text-muted)]">{aiContextBusinessSummary}</span>
                            </div>
                          ) : null}
                          {aiContextObjective ? (
                            <div className="text-[11px]">
                              <span className="font-semibold text-[var(--flux-text)]">{t("cardModal.aiContext.result.objectiveLabel")}</span>{" "}
                              <span className="text-[var(--flux-text-muted)]">{aiContextObjective}</span>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ) : aiContextPhase === "error" ? (
                    <div className="text-xs text-[var(--flux-text-muted)]">
                      {t("cardModal.logs.unableToGenerateContext")}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )}

        <ConfirmDialog
          open={confirmDeleteOpen}
          title={t("cardModal.confirmDelete.title")}
          description={t("cardModal.confirmDelete.description")}
          intent="danger"
          confirmText={t("cardModal.confirmDelete.confirm")}
          cancelText={t("cardModal.confirmDelete.cancel")}
          onCancel={() => setConfirmDeleteOpen(false)}
          onConfirm={() => {
            onDelete?.(card.id);
            setConfirmDeleteOpen(false);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
