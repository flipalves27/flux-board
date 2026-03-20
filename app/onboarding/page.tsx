"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { useSensor, useSensors, PointerSensor, KeyboardSensor } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "@/context/auth-context";
import { apiGet, apiPost, apiPut, ApiError } from "@/lib/api-client";
import { Header } from "@/components/header";
import {
  DEFAULT_TEMPLATE_ID,
  ONBOARDING_TEMPLATES,
  type BucketConfig,
  type TemplateId,
  getOnboardingDoneStorageKey,
  getOnboardingStateStorageKey,
} from "@/lib/onboarding";

type WizardStep = 1 | 2 | 3;

type PersistedWizardState = {
  step: WizardStep;
  boardId: string;
  templateId: TemplateId;
  boardName: string;
  bucketOrder: BucketConfig[];
  columnsPersisted: boolean;
};

const PRIORITIES = ["Urgente", "Importante", "Média"] as const;
const PROGRESSES = ["Não iniciado", "Em andamento", "Concluída"] as const;

function StepPill({
  index,
  current,
  label,
}: {
  index: number;
  current: WizardStep;
  label: string;
}) {
  const isDone = index < current;
  const isCurrent = index === current;
  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
        isCurrent
          ? "border-[var(--flux-primary)] bg-[rgba(108,92,231,0.18)] text-[var(--flux-primary-light)]"
          : isDone
            ? "border-[rgba(0,230,118,0.35)] bg-[rgba(0,230,118,0.10)] text-[var(--flux-success)]"
            : "border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)]"
      }`}
      aria-current={isCurrent ? "step" : undefined}
    >
      <span className="font-mono tabular-nums">{index.toString().padStart(2, "0")}</span>
      <span className="hidden sm:inline">
        {label}
      </span>
    </div>
  );
}

function ColumnItem({ column, dragAria }: { column: BucketConfig; dragAria: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.key,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between gap-3 rounded-[var(--flux-rad)] border px-3 py-2 ${
        isDragging
          ? "border-[var(--flux-primary)] bg-[rgba(108,92,231,0.14)] shadow-[0_12px_32px_rgba(108,92,231,0.18)]"
          : "border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-elevated)]"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          aria-hidden
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ background: column.color }}
        />
        <div className="min-w-0">
          <p className="font-display font-semibold text-sm text-[var(--flux-text)] truncate">{column.label}</p>
          <p className="font-mono text-[10px] text-[var(--flux-text-muted)] truncate">{column.key}</p>
        </div>
      </div>

      <button
        type="button"
        className="shrink-0 rounded-[var(--flux-rad-sm)] border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] px-2 py-1 text-xs text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:border-[rgba(255,255,255,0.2)] transition-colors"
        aria-label={dragAria}
        {...attributes}
        {...listeners}
      >
        ⇅
      </button>
    </div>
  );
}

function safeParseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, getHeaders, isChecked } = useAuth();
  const locale = useLocale();
  const t = useTranslations("onboarding");
  const localeRoot = `/${locale}`;

  const [step, setStep] = useState<WizardStep>(1);
  const [busy, setBusy] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const [boardId, setBoardId] = useState<string | null>(null);
  const [boardName, setBoardName] = useState<string>("");
  const [templateId, setTemplateId] = useState<TemplateId>(DEFAULT_TEMPLATE_ID);
  const [bucketOrder, setBucketOrder] = useState<BucketConfig[]>(ONBOARDING_TEMPLATES[DEFAULT_TEMPLATE_ID].buckets);
  const [columnsPersisted, setColumnsPersisted] = useState(false);

  // Step 3 form state
  const [cardTitle, setCardTitle] = useState("");
  const [cardDesc, setCardDesc] = useState("");
  const [cardBucketKey, setCardBucketKey] = useState<string>("");
  const [cardPriority, setCardPriority] = useState<(typeof PRIORITIES)[number]>("Média");
  const [cardProgress, setCardProgress] = useState<(typeof PROGRESSES)[number]>("Não iniciado");

  const storageKey = useMemo(() => (user ? getOnboardingStateStorageKey(user.id) : null), [user]);
  const doneKey = useMemo(() => (user ? getOnboardingDoneStorageKey(user.id) : null), [user]);

  const persistState = useCallback(
    (next: Omit<PersistedWizardState, "step"> & { step: WizardStep }) => {
      if (!user || !storageKey) return;
      const payload = JSON.stringify(next);
      localStorage.setItem(storageKey, payload);
    },
    [user, storageKey]
  );

  const markDone = useCallback(() => {
    if (!user || !doneKey) return;
    localStorage.setItem(doneKey, "1");
    if (storageKey) localStorage.removeItem(storageKey);
  }, [user, doneKey, storageKey]);

  const loadTemplateBuckets = useCallback((tid: TemplateId) => {
    const t = ONBOARDING_TEMPLATES[tid];
    setBucketOrder(t.buckets);
    setCardBucketKey((t.buckets[0]?.key ?? "").toString());
  }, []);

  useEffect(() => {
    if (!isChecked || !user) return;

    let cancelled = false;
    (async () => {
      try {
        setInitError(null);
        if (!doneKey || !storageKey) return;

        const doneRaw = localStorage.getItem(doneKey);
        if (doneRaw === "1") {
          router.replace(`${localeRoot}/boards`);
          return;
        }

        const persisted = safeParseJson<PersistedWizardState>(localStorage.getItem(storageKey));

        // Always verify if user has boards already; onboarding is only for first board.
        const boardsPayload = await apiGet<{ boards: Array<{ id: string }> }>("/api/boards", getHeaders());
        const boards = boardsPayload.boards ?? [];

        if (boards.length > 0) {
          if (persisted?.boardId && boards.some((b) => b.id === persisted.boardId)) {
            if (cancelled) return;
            setBoardId(persisted.boardId);
            setBoardName(persisted.boardName);
            setTemplateId(persisted.templateId);
            setBucketOrder(persisted.bucketOrder);
            setColumnsPersisted(persisted.columnsPersisted);
            const nextStep = persisted.step ?? 1;
            setStep(nextStep);
            setCardBucketKey((persisted.bucketOrder[0]?.key ?? "").toString());
            return;
          }
          // User already has boards and no matching in-progress onboarding => skip wizard.
          localStorage.setItem(doneKey, "1");
          router.replace(`${localeRoot}/boards`);
          return;
        }

        // No boards yet
        if (persisted?.boardId) {
          // State exists but server has no board => restart wizard.
          if (cancelled) return;
          localStorage.removeItem(storageKey);
          setStep(1);
          setBoardId(null);
          setBoardName("");
          setTemplateId(DEFAULT_TEMPLATE_ID);
          setColumnsPersisted(false);
          loadTemplateBuckets(DEFAULT_TEMPLATE_ID);
          return;
        }

        if (cancelled) return;
        setStep(1);
        setBoardId(null);
        setBoardName("");
        setTemplateId(DEFAULT_TEMPLATE_ID);
        setColumnsPersisted(false);
        loadTemplateBuckets(DEFAULT_TEMPLATE_ID);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof ApiError ? e.message : t("errors.init");
        setInitError(msg);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doneKey, getHeaders, loadTemplateBuckets, router, storageKey, user, isChecked, localeRoot]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      if (!e.over) return;
      const activeKey = String(e.active.id);
      const overKey = String(e.over.id);
      if (activeKey === overKey) return;

      setBucketOrder((prev) => {
        const oldIndex = prev.findIndex((c) => c.key === activeKey);
        const newIndex = prev.findIndex((c) => c.key === overKey);
        if (oldIndex < 0 || newIndex < 0) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
    },
    [setBucketOrder]
  );

  const persistColumnsAlways = useCallback(async () => {
    if (!user || !boardId) return;
    await apiPut(
      `/api/boards/${encodeURIComponent(boardId)}`,
      { config: { bucketOrder, collapsedColumns: [] } },
      getHeaders()
    );
    setColumnsPersisted(true);
  }, [boardId, bucketOrder, getHeaders, user]);

  const createBoardAndPersistTemplate = useCallback(
    async (nextTemplateId: TemplateId, nextBoardName: string) => {
      if (!user) return;
      setBusy(true);
      setInitError(null);
      try {
        const name = (nextBoardName || "").trim() || "Meu Board";
        const templateBuckets = ONBOARDING_TEMPLATES[nextTemplateId].buckets;

        const { board } = await apiPost<{ board: { id: string; name: string } }>(
          "/api/boards",
          { name },
          getHeaders()
        );

        await apiPut(
          `/api/boards/${encodeURIComponent(board.id)}`,
          { config: { bucketOrder: templateBuckets, collapsedColumns: [] } },
          getHeaders()
        );

        setBoardId(board.id);
        setTemplateId(nextTemplateId);
        setBoardName(name);
        setBucketOrder(templateBuckets);
        setColumnsPersisted(true);
        setCardBucketKey((templateBuckets[0]?.key ?? "").toString());
        setStep(2);

        persistState({
          step: 2,
          boardId: board.id,
          templateId: nextTemplateId,
          boardName: name,
          bucketOrder: templateBuckets,
          columnsPersisted: true,
        });
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : t("errors.createBoard");
        setInitError(msg);
      } finally {
        setBusy(false);
      }
    },
    [getHeaders, persistState, user]
  );

  const handleSkipStep1 = useCallback(async () => {
    await createBoardAndPersistTemplate(DEFAULT_TEMPLATE_ID, "Meu Board");
  }, [createBoardAndPersistTemplate]);

  const handleContinueStep1 = useCallback(async () => {
    await createBoardAndPersistTemplate(templateId, boardName);
  }, [boardName, createBoardAndPersistTemplate, templateId]);

  const handleContinueStep2 = useCallback(async () => {
    if (!boardId) return;
    setBusy(true);
    setInitError(null);
    try {
      await persistColumnsAlways();
      setStep(3);
      persistState({
        step: 3,
        boardId,
        templateId,
        boardName,
        bucketOrder,
        columnsPersisted: true,
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t("errors.saveColumns");
      setInitError(msg);
    } finally {
      setBusy(false);
    }
  }, [boardId, boardName, bucketOrder, persistColumnsAlways, persistState, templateId]);

  const handleSkipStep2 = useCallback(async () => {
    await handleContinueStep2();
  }, [handleContinueStep2]);

  const handleCreateCard = useCallback(async () => {
    if (!user || !boardId) return;
    const title = cardTitle.trim();
    if (!title) return;

    setBusy(true);
    setInitError(null);
    try {
      // Garantia: sempre persistir colunas antes do card.
      await persistColumnsAlways();

      const board = await apiGet<{ cards?: unknown[] }>(
        `/api/boards/${encodeURIComponent(boardId)}`,
        getHeaders()
      );
      const cards = Array.isArray(board.cards) ? board.cards : [];

      const bucketCardsCount = cards.filter((c) => (c as any)?.bucket === cardBucketKey).length;
      const cardId = `c_${Date.now()}_${Math.random().toString(16).slice(2)}`;

      const newCard = {
        id: cardId,
        bucket: cardBucketKey,
        priority: cardPriority,
        progress: cardProgress,
        title,
        desc: cardDesc.trim(),
        tags: [],
        direction: null,
        dueDate: null,
        order: bucketCardsCount,
      };

      await apiPut(
        `/api/boards/${encodeURIComponent(boardId)}`,
        { cards: [...cards, newCard] },
        getHeaders()
      );

      markDone();
      router.replace(`${localeRoot}/board/${encodeURIComponent(boardId)}`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t("errors.createCard");
      setInitError(msg);
    } finally {
      setBusy(false);
    }
  }, [
    boardId,
    cardBucketKey,
    cardDesc,
    cardPriority,
    cardProgress,
    cardTitle,
    getHeaders,
    markDone,
    persistColumnsAlways,
    router,
    localeRoot,
    user,
  ]);

  const handleSkipStep3 = useCallback(async () => {
    markDone();
    if (boardId) router.replace(`${localeRoot}/board/${encodeURIComponent(boardId)}`);
    else router.replace(`${localeRoot}/boards`);
  }, [boardId, markDone, router, localeRoot]);

  // Make sure card bucket defaults to first column.
  useEffect(() => {
    if (!bucketOrder.length) return;
    if (!cardBucketKey) setCardBucketKey(bucketOrder[0].key);
  }, [bucketOrder, cardBucketKey]);

  const template = ONBOARDING_TEMPLATES[templateId];
  const title =
    step === 1 ? t("titles.step1") : step === 2 ? t("titles.step2") : t("titles.step3");

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header title={t("header.title")} backHref={`${localeRoot}/boards`} backLabel={t("header.backLabel")}>
        <div className="flex items-center gap-2">
          <StepPill index={1} current={step} label={t("steps.pill1")} />
          <StepPill index={2} current={step} label={t("steps.pill2")} />
          <StepPill index={3} current={step} label={t("steps.pill3")} />
        </div>
      </Header>

      <main className="max-w-[980px] mx-auto px-6 py-10">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display font-bold text-xl text-[var(--flux-text)]">{title}</h2>
            <p className="mt-1 text-sm text-[var(--flux-text-muted)]">
              {step === 1
                    ? t("descriptions.step1")
                    : step === 2
                      ? t("descriptions.step2")
                      : t("descriptions.step3")}
            </p>
          </div>
        </div>

        {initError && (
          <div className="mb-4 bg-[rgba(255,107,107,0.12)] border border-[rgba(255,107,107,0.3)] text-[var(--flux-danger)] p-3 rounded-[var(--flux-rad)] text-sm">
            {initError}
          </div>
        )}

        {step === 1 && (
          <section className="rounded-[var(--flux-rad-xl)] border border-[rgba(108,92,231,0.2)] bg-[var(--flux-surface-card)] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.2)]">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6 items-start">
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">
                  {t("fields.boardName")}
                </label>
                <input
                  value={boardName}
                  onChange={(e) => setBoardName(e.target.value)}
                    placeholder={t("placeholders.boardName")}
                  className="w-full px-3 py-2 border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] outline-none"
                  disabled={busy}
                  autoFocus
                />

                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                    {t("fields.template")}
                  </p>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(Object.keys(ONBOARDING_TEMPLATES) as TemplateId[]).map((tid) => {
                      const t = ONBOARDING_TEMPLATES[tid];
                      const isSelected = tid === templateId;
                      return (
                        <button
                          key={tid}
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setTemplateId(tid);
                          }}
                          className={`text-left rounded-[var(--flux-rad)] border px-4 py-3 transition-colors ${
                            isSelected
                              ? "border-[var(--flux-primary)] bg-[rgba(108,92,231,0.14)]"
                              : "border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-elevated)] hover:border-[rgba(108,92,231,0.35)]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-display font-bold text-[var(--flux-text)]">{t.title}</p>
                            <span className="text-[10px] font-mono text-[var(--flux-text-muted)]">{t.buckets.length} col.</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {t.buckets.slice(0, 3).map((b) => (
                              <span
                                key={b.key}
                                className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] px-2 py-0.5 text-[11px] text-[var(--flux-text-muted)]"
                              >
                                <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: b.color }} />
                                {b.label}
                              </span>
                            ))}
                            {t.buckets.length > 3 && (
                              <span className="text-[11px] text-[var(--flux-text-muted)]">+{t.buckets.length - 3}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <div className="rounded-[var(--flux-rad-xl)] border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.03)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                    {t("preview.title")}
                  </p>
                  <div className="mt-3 space-y-2">
                    {template.buckets.map((b) => (
                      <div
                        key={b.key}
                        className="flex items-center justify-between gap-3 rounded-[var(--flux-rad)] border border-[rgba(255,255,255,0.10)] bg-[var(--flux-surface-elevated)] px-3 py-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span aria-hidden className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: b.color }} />
                          <span className="font-display font-semibold text-sm text-[var(--flux-text)] truncate">{b.label}</span>
                        </div>
                        <span className="font-mono text-[10px] text-[var(--flux-text-muted)]">{b.key}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 text-xs text-[var(--flux-text-muted)] leading-relaxed">
                    {t("preview.description")}
                  </div>
                </div>

                <div className="mt-5 flex gap-3 justify-end">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => handleSkipStep1()}
                  >
                    {t("buttons.skip")}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy}
                    onClick={() => handleContinueStep1()}
                  >
                    {busy ? t("buttons.creating") : t("buttons.continue")}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {step === 2 && boardId && (
          <section className="rounded-[var(--flux-rad-xl)] border border-[rgba(108,92,231,0.2)] bg-[var(--flux-surface-card)] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.2)]">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                  {t("step2.reorderTitle")}
                </p>
                <p className="mt-1 text-sm text-[var(--flux-text-muted)]">
                  {t("step2.reorderDescription")}
                </p>
              </div>
              <div className="text-xs text-[var(--flux-text-muted)]">
                {t("step2.boardLabel")}{" "}
                <span className="font-mono text-[var(--flux-text)]">{boardId}</span>
              </div>
            </div>

            <DndContext sensors={sensors} onDragEnd={onDragEnd}>
              <SortableContext items={bucketOrder.map((c) => c.key)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {bucketOrder.map((c) => (
                    <ColumnItem key={c.key} column={c} dragAria={t("dragReorderAria")} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <div className="mt-6 flex gap-3 justify-end">
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => handleSkipStep2()}>
                {t("buttons.skip")}
              </button>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => handleContinueStep2()}>
                {busy ? t("buttons.saving") : t("buttons.continue")}
              </button>
            </div>
          </section>
        )}

        {step === 3 && boardId && (
          <section className="rounded-[var(--flux-rad-xl)] border border-[rgba(108,92,231,0.2)] bg-[var(--flux-surface-card)] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.2)]">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                {t("step3.title")}
              </p>
              <p className="mt-1 text-sm text-[var(--flux-text-muted)]">
                {t("step3.description")}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">
                  {t("fields.cardTitle")}
                </label>
                <input
                  value={cardTitle}
                  onChange={(e) => setCardTitle(e.target.value)}
                  placeholder={t("placeholders.cardTitle")}
                  className="w-full px-3 py-2 border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] outline-none"
                  disabled={busy}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">
                  {t("fields.column")}
                </label>
                <select
                  value={cardBucketKey}
                  onChange={(e) => setCardBucketKey(e.target.value)}
                  className="w-full px-3 py-2 border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                  disabled={busy}
                >
                  {bucketOrder.map((b) => (
                    <option key={b.key} value={b.key}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">
                  {t("fields.priority")}
                </label>
                <select
                  value={cardPriority}
                  onChange={(e) => setCardPriority(e.target.value as (typeof PRIORITIES)[number])}
                  className="w-full px-3 py-2 border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                  disabled={busy}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {t(`options.priority.${p}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">
                  {t("fields.progress")}
                </label>
                <select
                  value={cardProgress}
                  onChange={(e) => setCardProgress(e.target.value as (typeof PROGRESSES)[number])}
                  className="w-full px-3 py-2 border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                  disabled={busy}
                >
                  {PROGRESSES.map((p) => (
                    <option key={p} value={p}>
                      {t(`options.progress.${p}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">
                  {t("fields.descriptionOptional")}
                </label>
                <textarea
                  value={cardDesc}
                  onChange={(e) => setCardDesc(e.target.value)}
                  placeholder={t("placeholders.cardDescriptionOptional")}
                  rows={4}
                  className="w-full px-3 py-2 border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] outline-none"
                  disabled={busy}
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => handleSkipStep3()}>
                {t("buttons.skip")}
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={busy || !cardTitle.trim()}
                onClick={() => handleCreateCard()}
              >
                {busy ? t("buttons.creating") : t("buttons.createCard")}
              </button>
            </div>
          </section>
        )}

        {step === 2 && !boardId && (
          <div className="rounded-[var(--flux-rad-xl)] border border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-card)] p-6">
            <p className="text-[var(--flux-text-muted)]">{t("loading.board")}</p>
          </div>
        )}
      </main>
    </div>
  );
}

