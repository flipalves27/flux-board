"use client";

import { useMemo, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { BucketConfig, CardData } from "@/app/board/[id]/page";

type PortfolioHealth = "green" | "yellow" | "red" | "blocked";

type PortfolioPatch = Partial<Pick<CardData, "priority" | "progress" | "bucket" | "dueDate" | "portfolioMeta">>;

type Props = {
  cards: CardData[];
  buckets: BucketConfig[];
  filterCard: (card: CardData) => boolean;
  onOpenCard: (card: CardData) => void;
  onMoveCard: (cardId: string, bucketKey: string, insertIndex: number) => void;
  onPatchCard: (cardId: string, patch: PortfolioPatch) => void;
  sensors: NonNullable<ComponentProps<typeof DndContext>["sensors"]>;
  collisionDetection: CollisionDetection;
};

const HEALTH_STYLES: Record<PortfolioHealth, { label: string; dot: string; badge: string; ring: string }> = {
  green: {
    label: "On track",
    dot: "bg-[var(--flux-success)]",
    badge: "border-[var(--flux-success)]/35 text-[var(--flux-success)] bg-[var(--flux-success)]/10",
    ring: "shadow-[0_0_22px_var(--flux-success-alpha-28)]",
  },
  yellow: {
    label: "Watch",
    dot: "bg-[var(--flux-warning)]",
    badge: "border-[var(--flux-warning)]/35 text-[var(--flux-warning)] bg-[var(--flux-warning)]/10",
    ring: "shadow-[0_0_22px_var(--flux-warning-alpha-25)]",
  },
  red: {
    label: "At risk",
    dot: "bg-[var(--flux-danger)]",
    badge: "border-[var(--flux-danger)]/35 text-[var(--flux-danger)] bg-[var(--flux-danger)]/10",
    ring: "shadow-[0_0_22px_var(--flux-danger-alpha-20)]",
  },
  blocked: {
    label: "Blocked",
    dot: "bg-[var(--flux-text-muted)]",
    badge: "border-[var(--flux-control-border)] text-[var(--flux-text)] bg-[var(--flux-chrome-alpha-10)]",
    ring: "shadow-[0_0_22px_var(--flux-primary-alpha-16)]",
  },
};

const PHASES = ["Discovery", "Build", "Rollout", "Scale", "Done"];

function portfolioMeta(card: CardData) {
  return card.portfolioMeta ?? {};
}

function businessOutcome(card: CardData): string {
  const meta = portfolioMeta(card);
  if (meta.businessOutcome?.trim()) return meta.businessOutcome.trim();
  const firstLine = card.desc.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return firstLine?.replace(/^Business outcome:\s*/i, "") || "Outcome to be defined";
}

function inferHealth(card: CardData): PortfolioHealth {
  const explicit = portfolioMeta(card).health;
  if (explicit === "green" || explicit === "yellow" || explicit === "red" || explicit === "blocked") return explicit;
  if (Array.isArray(card.blockedBy) && card.blockedBy.length > 0) return "blocked";
  if (card.dueDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(`${card.dueDate}T00:00:00`);
    if (!Number.isNaN(due.getTime())) {
      const days = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
      if (days < 0) return "red";
      if (days <= 7) return "yellow";
    }
  }
  return card.priority.toLowerCase().includes("alta") || card.priority.toLowerCase().includes("high") ? "yellow" : "green";
}

function milestoneLabel(card: CardData): string {
  return portfolioMeta(card).milestoneLabel?.trim() || (card.dueDate ? "Next milestone" : "No milestone");
}

function phaseLabel(card: CardData): string {
  return portfolioMeta(card).phase?.trim() || card.progress || "Discovery";
}

function ownerLabel(card: CardData): string {
  return portfolioMeta(card).ownerName?.trim() || card.assigneeId?.trim() || "Unassigned";
}

function Icon({ kind }: { kind: "target" | "health" | "phase" | "calendar" | "owner" }) {
  const paths = {
    target: "M12 3v3m0 12v3m9-9h-3M6 12H3m15 0a6 6 0 1 1-12 0 6 6 0 0 1 12 0zm-3 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
    health: "M5 12h2l2-5 4 10 2-5h4",
    phase: "M4 6h8M4 12h12M4 18h16",
    calendar: "M7 4v3m10-3v3M5 9h14M6 6h12a1 1 0 0 1 1 1v12H5V7a1 1 0 0 1 1-1z",
    owner: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0",
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-3.5 w-3.5 shrink-0">
      <path d={paths[kind]} />
    </svg>
  );
}

function DropShell({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      className={`${className ?? ""} ${
        isOver
          ? "ring-2 ring-[var(--flux-primary-alpha-45)] border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-08)]"
          : ""
      } transition-all duration-200 motion-reduce:transition-none`}
    >
      {children}
    </section>
  );
}

function PortfolioCard({
  card,
  onOpen,
  onPatch,
}: {
  card: CardData;
  onOpen: (card: CardData) => void;
  onPatch: (cardId: string, patch: PortfolioPatch) => void;
}) {
  const health = inferHealth(card);
  const style = HEALTH_STYLES[health];
  const meta = portfolioMeta(card);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `portfolio-card-${card.id}`,
    data: { cardId: card.id },
  });
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id: `portfolio-card-${card.id}` });

  const setRefs = (node: HTMLElement | null) => {
    setNodeRef(node);
    setDroppableRef(node);
  };

  const patchMeta = (next: Partial<NonNullable<CardData["portfolioMeta"]>>) => {
    onPatch(card.id, { portfolioMeta: { ...meta, ...next } });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(card);
    }
  };

  return (
    <article
      ref={setRefs}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(card)}
      onKeyDown={handleKeyDown}
      className={`group rounded-[var(--flux-rad-xl)] border bg-[var(--flux-surface-card)]/95 p-3.5 text-left outline-none backdrop-blur-sm cursor-grab active:cursor-grabbing hover:-translate-y-0.5 hover:border-[var(--flux-primary-alpha-35)] hover:shadow-[0_14px_34px_var(--flux-primary-alpha-18)] focus-visible:ring-2 focus-visible:ring-[var(--flux-primary-alpha-45)] transition-all duration-200 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
        isDragging ? "opacity-35 scale-[0.98]" : ""
      } ${isOver ? "border-[var(--flux-primary)] ring-1 ring-[var(--flux-primary-alpha-35)]" : "border-[var(--flux-chrome-alpha-12)]"} ${style.ring}`}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold leading-snug text-[var(--flux-text)] line-clamp-2">{card.title}</h4>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--flux-text-muted)] line-clamp-2">{businessOutcome(card)}</p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style.badge}`}>
          <span className={`h-2 w-2 rounded-full ${style.dot}`} />
          {style.label}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-[var(--flux-text-muted)]">
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-[var(--flux-chrome-alpha-06)] px-2 py-1">
          <Icon kind="phase" />
          <span className="truncate">{phaseLabel(card)}</span>
        </span>
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-[var(--flux-chrome-alpha-06)] px-2 py-1">
          <Icon kind="calendar" />
          <span className="truncate">{milestoneLabel(card)}</span>
        </span>
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-[var(--flux-chrome-alpha-06)] px-2 py-1">
          <Icon kind="owner" />
          <span className="truncate">{ownerLabel(card)}</span>
        </span>
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-[var(--flux-chrome-alpha-06)] px-2 py-1">
          <Icon kind="health" />
          <span className="truncate">{card.priority}</span>
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--flux-chrome-alpha-08)] pt-3">
        <label className="sr-only" htmlFor={`portfolio-health-${card.id}`}>Health</label>
        <select
          id={`portfolio-health-${card.id}`}
          value={health}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => patchMeta({ health: event.target.value as PortfolioHealth })}
          className="rounded-md border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-2 py-1 text-[11px] text-[var(--flux-text)]"
        >
          {Object.entries(HEALTH_STYLES).map(([key, item]) => (
            <option key={key} value={key}>{item.label}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor={`portfolio-phase-${card.id}`}>Phase</label>
        <select
          id={`portfolio-phase-${card.id}`}
          value={phaseLabel(card)}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => {
            const phase = event.target.value;
            onPatch(card.id, { progress: phase, portfolioMeta: { ...meta, phase } });
          }}
          className="rounded-md border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-2 py-1 text-[11px] text-[var(--flux-text)]"
        >
          {[...new Set([...PHASES, phaseLabel(card)])].map((phase) => (
            <option key={phase} value={phase}>{phase}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor={`portfolio-due-${card.id}`}>Milestone date</label>
        <input
          id={`portfolio-due-${card.id}`}
          type="date"
          value={card.dueDate ?? ""}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => onPatch(card.id, { dueDate: event.target.value || null })}
          className="min-w-[132px] rounded-md border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-2 py-1 text-[11px] text-[var(--flux-text)]"
        />
      </div>
    </article>
  );
}

function EmptyObjective() {
  return (
    <div className="rounded-[var(--flux-rad-lg)] border border-dashed border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/40 px-3 py-8 text-center text-xs text-[var(--flux-text-muted)]">
      Drop initiatives here to connect them to this objective.
    </div>
  );
}

export function BoardStrategicPortfolioView({
  cards,
  buckets,
  filterCard,
  onOpenCard,
  onMoveCard,
  onPatchCard,
  sensors,
  collisionDetection,
}: Props) {
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const visibleCards = useMemo(() => cards.filter(filterCard), [cards, filterCard]);
  const activeCard = activeCardId ? cards.find((card) => card.id === activeCardId) ?? null : null;
  const cardsByBucket = useMemo(() => {
    const grouped = new Map<string, CardData[]>();
    for (const bucket of buckets) grouped.set(bucket.key, []);
    for (const card of visibleCards) {
      const list = grouped.get(card.bucket);
      if (list) list.push(card);
    }
    for (const list of grouped.values()) list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return grouped;
  }, [buckets, visibleCards]);

  const healthCounts = useMemo(() => {
    const counts: Record<PortfolioHealth, number> = { green: 0, yellow: 0, red: 0, blocked: 0 };
    for (const card of visibleCards) counts[inferHealth(card)] += 1;
    return counts;
  }, [visibleCards]);

  const nextMilestones = useMemo(
    () =>
      visibleCards
        .filter((card) => card.dueDate)
        .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
        .slice(0, 3),
    [visibleCards]
  );

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    setActiveCardId(id.startsWith("portfolio-card-") ? id.slice("portfolio-card-".length) : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const cardId = activeCardId;
    setActiveCardId(null);
    if (!cardId || !event.over) return;
    const overId = String(event.over.id);
    const overCardId = overId.startsWith("portfolio-card-") ? overId.slice("portfolio-card-".length) : null;
    const overBucketKey = overId.startsWith("portfolio-bucket-") ? overId.slice("portfolio-bucket-".length) : null;
    const targetBucket = overCardId ? cards.find((card) => card.id === overCardId)?.bucket : overBucketKey;
    if (!targetBucket) return;
    const targetCards = cardsByBucket.get(targetBucket) ?? [];
    const overIndex = overCardId ? targetCards.findIndex((card) => card.id === overCardId) : targetCards.length;
    const insertIndex = overIndex >= 0 ? overIndex : targetCards.length;
    onMoveCard(cardId, targetBucket, insertIndex);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragCancel={() => setActiveCardId(null)}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-4">
        <section className="overflow-hidden rounded-[var(--flux-rad-2xl)] border border-[var(--flux-primary-alpha-20)] bg-[linear-gradient(135deg,var(--flux-surface-card),var(--flux-surface-elevated))] p-4 shadow-[0_18px_55px_var(--flux-primary-alpha-10)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--flux-primary-alpha-25)] bg-[var(--flux-primary-alpha-08)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-primary)]">
                <Icon kind="target" />
                Strategic Portfolio View
              </div>
              <h2 className="mt-3 font-display text-xl font-semibold text-[var(--flux-text)]">Portfolio by strategic objective</h2>
              <p className="mt-1 max-w-2xl text-sm text-[var(--flux-text-muted)]">
                A presentation-ready matrix for executive decisions: health, phase, milestone and owner stay visible while drag-and-drop changes the strategic objective.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi label="Initiatives" value={visibleCards.length} />
              <Kpi label="On track" value={healthCounts.green} tone="success" />
              <Kpi label="Needs attention" value={healthCounts.yellow + healthCounts.red + healthCounts.blocked} tone="warning" />
              <Kpi label="Objectives" value={buckets.length} />
            </div>
          </div>

          {nextMilestones.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {nextMilestones.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => onOpenCard(card)}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-08)] px-3 py-1 text-[11px] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-text)]"
                >
                  <Icon kind="calendar" />
                  <span className="font-semibold text-[var(--flux-text)]">{milestoneLabel(card)}</span>
                  <span>{card.dueDate}</span>
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
          {buckets.map((bucket) => {
            const items = cardsByBucket.get(bucket.key) ?? [];
            const risky = items.filter((card) => {
              const h = inferHealth(card);
              return h === "red" || h === "blocked";
            }).length;
            return (
              <DropShell
                key={bucket.key}
                id={`portfolio-bucket-${bucket.key}`}
                className="min-h-[420px] rounded-[var(--flux-rad-2xl)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)]/80 p-3 backdrop-blur"
              >
                <div className="mb-3 rounded-[var(--flux-rad-xl)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-elevated)]/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-[var(--flux-text)]">{bucket.label}</h3>
                      <p className="mt-1 text-[11px] leading-relaxed text-[var(--flux-text-muted)] line-clamp-2">{bucket.policy || "Strategic objective"}</p>
                    </div>
                    <span className="rounded-full border border-[var(--flux-control-border)] px-2 py-0.5 text-[10px] font-semibold text-[var(--flux-text-muted)]">{items.length}</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--flux-chrome-alpha-08)]">
                    <div
                      className="h-full rounded-full bg-[var(--flux-primary)] transition-all duration-300 motion-reduce:transition-none"
                      style={{ width: `${items.length === 0 ? 0 : Math.max(12, Math.round(((items.length - risky) / items.length) * 100))}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {items.length === 0 ? <EmptyObjective /> : null}
                  {items.map((card) => (
                    <PortfolioCard key={card.id} card={card} onOpen={onOpenCard} onPatch={onPatchCard} />
                  ))}
                </div>
              </DropShell>
            );
          })}
        </div>
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        {activeCard ? (
          <div className="w-[320px] rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-surface-card)] p-3 shadow-[var(--flux-shadow-kanban-card-lift)]">
            <div className="text-sm font-semibold text-[var(--flux-text)] line-clamp-2">{activeCard.title}</div>
            <div className="mt-1 text-xs text-[var(--flux-text-muted)] line-clamp-2">{businessOutcome(activeCard)}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "success" | "warning" }) {
  const color =
    tone === "success"
      ? "text-[var(--flux-success)]"
      : tone === "warning"
        ? "text-[var(--flux-warning)]"
        : "text-[var(--flux-text)]";
  return (
    <div className="min-w-[110px] rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-08)] px-3 py-2">
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--flux-text-muted)]">{label}</div>
    </div>
  );
}
