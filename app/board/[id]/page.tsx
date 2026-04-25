"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useShallow } from "zustand/react/shallow";

import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header-v2-shim";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import type { PortalClientState } from "@/components/kanban/board-portal-modal";

const BoardCopilotPanel = dynamic(
  () => import("@/components/kanban/board-copilot-panel").then((m) => ({ default: m.BoardCopilotPanel })),
  { ssr: false }
);
const BoardActivityPanel = dynamic(
  () => import("@/components/kanban/board-activity-panel").then((m) => ({ default: m.BoardActivityPanel })),
  { ssr: false }
);
const BoardDesktopToolsRail = dynamic(
  () => import("@/components/kanban/board-desktop-tools-rail").then((m) => ({ default: m.BoardDesktopToolsRail })),
  { ssr: false }
);
const SprintPanel = dynamic(() => import("@/components/kanban/sprint-panel"), { ssr: false });
const BoardAutomationsModal = dynamic(
  () => import("@/components/kanban/board-automations-modal").then((m) => ({ default: m.BoardAutomationsModal })),
  { ssr: false }
);
const BoardPortalModal = dynamic(
  () => import("@/components/kanban/board-portal-modal").then((m) => ({ default: m.BoardPortalModal })),
  { ssr: false }
);
const BoardTemplateExportModal = dynamic(
  () => import("@/components/board/board-template-export-modal").then((m) => ({ default: m.BoardTemplateExportModal })),
  { ssr: false }
);
const BoardEmbedModal = dynamic(
  () => import("@/components/board/board-embed-modal").then((m) => ({ default: m.BoardEmbedModal })),
  { ssr: false }
);
const BoardAnomalyNotificationsModal = dynamic(
  () => import("@/components/kanban/board-anomaly-notifications-modal").then((m) => ({
    default: m.BoardAnomalyNotificationsModal,
  })),
  { ssr: false }
);
const CopilotNudgeToast = dynamic(
  () => import("@/components/kanban/copilot-nudge-toast").then((m) => ({ default: m.CopilotNudgeToast })),
  { ssr: false }
);
const CollaborationCursors = dynamic(
  () => import("@/components/kanban/collaboration-cursors").then((m) => ({ default: m.CollaborationCursors })),
  { ssr: false }
);
const BoardExecutiveBriefModal = dynamic(
  () => import("@/components/kanban/board-executive-brief-modal").then((m) => ({ default: m.BoardExecutiveBriefModal })),
  { ssr: false }
);
const BoardGoalsModal = dynamic(
  () => import("@/components/kanban/board-goals-modal").then((m) => ({ default: m.BoardGoalsModal })),
  { ssr: false }
);
const BoardIntakeFormsModal = dynamic(
  () => import("@/components/kanban/board-intake-forms-modal").then((m) => ({ default: m.BoardIntakeFormsModal })),
  { ssr: false }
);
const BoardDiscoverySessionsModal = dynamic(
  () => import("@/components/kanban/board-discovery-sessions-modal").then((m) => ({ default: m.BoardDiscoverySessionsModal })),
  { ssr: false }
);
const BoardPdfListImportModal = dynamic(
  () => import("@/components/kanban/board-pdf-list-import-modal").then((m) => ({ default: m.BoardPdfListImportModal })),
  { ssr: false }
);
import type { BoardAnomalyNotifications } from "@/lib/anomaly-board-settings";
import { apiFetch, apiGet, getApiHeaders, ApiError } from "@/lib/api-client";
import { useToast } from "@/context/toast-context";
import { registerBoardVisit } from "@/lib/board-shortcuts";
import { normalizeBoardForPersist } from "@/lib/board-persist-normalize";
import { isDiscoveryMethodology, isSprintMethodology, type BoardMethodology } from "@/lib/board-methodology";
import type { CardServiceClass, SprintData, SubtaskData, SubtaskProgress } from "@/lib/schemas";
import {
  setBoardPersistenceHandler,
  useBoardStore,
  triggerCsvExport,
  triggerCsvImport,
  consumePendingWipOverrideReason,
} from "@/stores/board-store";
import { useKanbanUiStore } from "@/stores/ui-store";
import { useFilterStore } from "@/stores/filter-store";
import { useCopilotStore } from "@/stores/copilot-store";
import { useBoardNlqUiStore } from "@/stores/board-nlq-ui-store";
import { useSprintStore } from "@/stores/sprint-store";
import { useMinimumSkeletonDuration } from "@/lib/use-minimum-skeleton-duration";
import { DataFadeIn } from "@/components/ui/data-fade-in";
import { SkeletonKanbanBoard } from "@/components/skeletons/flux-skeletons";
import { BOARD_PRODUCT_TOUR_DAILY_STEP_INDEX, type BoardProductTourHandle } from "@/components/board/board-product-tour";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import { isPlatformAdminSession } from "@/lib/rbac";
import type { ViewerCapabilities } from "@/lib/board-viewer-capabilities";

const BoardFluxyDock = dynamic(
  () => import("@/components/fluxy/board-fluxy-dock").then((m) => ({ default: m.BoardFluxyDock })),
  { ssr: false }
);
const BoardProductTour = dynamic(
  () => import("@/components/board/board-product-tour").then((m) => ({ default: m.BoardProductTour })),
  { ssr: false }
);
const BoardPresenceAvatars = dynamic(
  () => import("@/components/kanban/board-presence-avatars").then((m) => ({ default: m.BoardPresenceAvatars })),
  { ssr: false }
);

const PRIORITIES = ["Urgente", "Importante", "Média"];
const PROGRESSES = ["Não iniciado", "Em andamento", "Concluída"];
const DIRECTIONS = ["Manter", "Priorizar", "Adiar", "Cancelar", "Reavaliar"];
const DIRECTION_STORAGE_VALUES = DIRECTIONS.map((d) => d.toLowerCase());
/** Referência estável — `?? []` no seletor com `useShallow` gerava novo array a cada tick e loop #185. */
const EMPTY_BOARD_LABELS: string[] = [];

export interface CardLink {
  url: string;
  label?: string;
}

export interface CardDocRef {
  docId: string;
  title?: string;
  excerpt?: string;
}

export interface DailyInsightPayload {
  resumo?: string;
  contextoOrganizado?: string;
  criar?: string[];
  criarDetalhes?: Array<DailyInsightActionPayload>;
  ajustar?: Array<string | DailyInsightActionPayload>;
  corrigir?: Array<string | DailyInsightActionPayload>;
  pendencias?: Array<string | DailyInsightActionPayload>;
}

export interface DailyInsightActionPayload {
  titulo?: string;
  descricao?: string;
  prioridade?: string;
  progresso?: string;
  coluna?: string;
  tags?: string[];
  dataConclusao?: string;
  direcionamento?: string;
}

export interface DailyCreatedCard {
  cardId: string;
  title: string;
  bucket: string;
  priority: string;
  progress: string;
  desc?: string;
  tags?: string[];
  direction?: string | null;
  dueDate?: string | null;
  createdAt?: string;
  status?: "created" | "existing";
}

export interface DailyInsightEntry {
  id: string;
  createdAt?: string;
  transcript?: string;
  sourceFileName?: string;
  insight?: DailyInsightPayload;
  createdCards?: DailyCreatedCard[];
  generationMeta?: {
    usedLlm?: boolean;
    model?: string;
  };
}

/** Checklist Definition of Ready (refinamento) — opcional por card. */
export type CardDorReady = {
  titleOk?: boolean;
  acceptanceOk?: boolean;
  depsOk?: boolean;
  sizedOk?: boolean;
};

/** Itens de Definition of Done no nível do board (Scrum adaptado ao Kanban). */
export type BoardDefinitionOfDoneItem = { id: string; label: string };

export type BoardDefinitionOfDone = {
  enabled: boolean;
  enforce: boolean;
  /** Chaves de coluna consideradas “feito”. Vazio = heurística por nome da coluna. */
  doneBucketKeys?: string[];
  items: BoardDefinitionOfDoneItem[];
};

export interface CardData {
  id: string;
  bucket: string;
  priority: string;
  progress: string;
  title: string;
  desc: string;
  tags: string[];
  links?: CardLink[];
  docRefs?: CardDocRef[];
  direction: string | null;
  dueDate: string | null;
  assigneeId?: string | null;
  /** Cards que precisam concluir antes deste (IDs). */
  blockedBy?: string[];
  order: number;
  columnEnteredAt?: string;
  completedAt?: string;
  completedCycleDays?: number;
  automationState?: { lastFired?: Record<string, string> };
  dorReady?: CardDorReady;
  /** Checkboxes DoD por id do item do board. */
  dodChecks?: Record<string, boolean>;
  /** Estimativa Fibonacci (Scrum). */
  storyPoints?: number | null;
  /** Classe de serviço explícita (Kanban). */
  serviceClass?: CardServiceClass | null;
  subtasks?: SubtaskData[];
  subtaskProgress?: SubtaskProgress;
  /** Peso calculado para priorização em templates de matriz (0-100). */
  matrixWeight?: number;
  /** Faixa de prioridade visual derivada do peso da matriz. */
  matrixWeightBand?: "low" | "medium" | "high" | "critical";
  /** Metadados estratégicos usados por templates SWOT/TOWS. */
  swotMeta?: Record<string, unknown>;
  /** Card pai quando criado por decomposição de épico (Fluxy). */
  epicParentId?: string | null;
  /** Histórias geradas automaticamente pela Fluxy. */
  createdByFluxy?: boolean;
  /** Briefing contextual ao ser assignado (onboarding inteligente). */
  fluxyAssigneeBriefing?: string;
}

export interface BucketConfig {
  key: string;
  label: string;
  color: string;
  /** Limite WIP (opcional). */
  wipLimit?: number;
  /** Como o time usa esta coluna (política explícita). */
  policy?: string;
}

export interface BoardData {
  version: string;
  lastUpdated: string;
  /** Scrum, Kanban ou Lean Six Sigma — condiciona sprints, cadências e UI do quadro. */
  boardMethodology?: BoardMethodology;
  cards: CardData[];
  config: {
    bucketOrder: BucketConfig[];
    collapsedColumns: string[];
    labels?: string[];
    /** Meta de produto (Product Goal) visível no quadro. */
    productGoal?: string;
    /** Nota do PO para contexto executivo (complementa o brief IA). */
    executiveStakeholderNote?: string;
    /** Coluna tratada como product backlog para ordenação explícita. */
    backlogBucketKey?: string;
    /** Marca templates estratégicos que habilitam visões dedicadas no board. */
    strategyTemplateKind?: "swot";
    definitionOfDone?: BoardDefinitionOfDone;
    cardRules?: { requireAssignee?: boolean };
  };
  mapaProducao?: { papel: string; equipe: string; linha: string; operacoes: string }[];
  dailyInsights?: DailyInsightEntry[];
  intakeForm?: {
    enabled?: boolean;
    slug?: string;
    title?: string;
    description?: string;
    targetBucketKey?: string;
    defaultPriority?: string;
    defaultProgress?: string;
    defaultTags?: string[];
  };
  portal?: PortalClientState;
  anomalyNotifications?: BoardAnomalyNotifications;
}

const DEFAULT_BUCKETS: BucketConfig[] = [
  { key: "Refinamento Negócio/Técnico", label: "Refinamento", color: "var(--flux-text-muted)" },
  { key: "Backlog", label: "Backlog", color: "var(--flux-primary)" },
  { key: "Priorizado", label: "Priorizado", color: "var(--flux-secondary)" },
  { key: "Em Execução (Desenvolvimento)", label: "Em Execução", color: "var(--flux-accent)" },
  { key: "Incidente", label: "Incidente", color: "var(--flux-warning)" },
  { key: "Em Produção", label: "Em Produção", color: "var(--flux-success)" },
];

function sanitizeBucketOrder(raw: unknown): BucketConfig[] {
  if (!Array.isArray(raw)) return DEFAULT_BUCKETS;
  const normalized = raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const rec = item as Partial<BucketConfig>;
      const key = typeof rec.key === "string" ? rec.key.trim() : "";
      const label = typeof rec.label === "string" ? rec.label.trim() : "";
      const color = typeof rec.color === "string" ? rec.color.trim() : "";
      if (!key) return null;
      let wipLimit: number | undefined;
      if (typeof rec.wipLimit === "number" && Number.isFinite(rec.wipLimit)) {
        const w = Math.floor(rec.wipLimit);
        if (w >= 1 && w <= 999) wipLimit = w;
      }
      const policyRaw = typeof rec.policy === "string" ? rec.policy.trim().slice(0, 500) : "";
      return {
        key,
        label: label || key,
        color: color || "var(--flux-text-muted)",
        ...(wipLimit !== undefined ? { wipLimit } : {}),
        ...(policyRaw ? { policy: policyRaw } : {}),
      };
    })
    .filter((b): b is BucketConfig => b !== null);
  if (normalized.length === 0) return DEFAULT_BUCKETS;
  const seen = new Set<string>();
  return normalized.filter((b) => {
    const id = b.key.toLowerCase();
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function sanitizeCollapsedColumns(raw: unknown, bucketOrder: BucketConfig[]): string[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(bucketOrder.map((b) => b.key));
  return raw
    .filter((key): key is string => typeof key === "string" && key.trim().length > 0)
    .map((key) => key.trim())
    .filter((key) => allowed.has(key));
}

function sanitizeLabels(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const labels = raw.filter((label): label is string => typeof label === "string" && label.trim().length > 0);
  return labels.length > 0 ? labels : [];
}

function sanitizeDorReady(raw: unknown): CardDorReady | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const pick = (k: string) => o[k] === true;
  const any =
    pick("titleOk") || pick("acceptanceOk") || pick("depsOk") || pick("sizedOk");
  if (!any) return undefined;
  return {
    ...(pick("titleOk") ? { titleOk: true } : {}),
    ...(pick("acceptanceOk") ? { acceptanceOk: true } : {}),
    ...(pick("depsOk") ? { depsOk: true } : {}),
    ...(pick("sizedOk") ? { sizedOk: true } : {}),
  };
}

function sanitizeProductGoal(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim().slice(0, 800);
  return t.length > 0 ? t : undefined;
}

function sanitizeExecutiveStakeholderNote(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim().slice(0, 2000);
  return t.length > 0 ? t : undefined;
}

function sanitizeBacklogBucketKey(raw: unknown, bucketOrder: BucketConfig[]): string | undefined {
  if (typeof raw !== "string") return undefined;
  const k = raw.trim().slice(0, 200);
  if (!k || !bucketOrder.some((b) => b.key === k)) return undefined;
  return k;
}

function sanitizeDefinitionOfDone(raw: unknown, bucketOrder: BucketConfig[]): BoardDefinitionOfDone | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const enabled = o.enabled === true;
  const enforce = o.enforce === true;
  let doneBucketKeys: string[] | undefined;
  if (Array.isArray(o.doneBucketKeys)) {
    const allowed = new Set(bucketOrder.map((b) => b.key));
    const keys = o.doneBucketKeys
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim().slice(0, 200))
      .filter((x) => allowed.has(x));
    if (keys.length > 0) doneBucketKeys = [...new Set(keys)];
  }
  const itemsRaw = Array.isArray(o.items) ? o.items : [];
  const items: BoardDefinitionOfDoneItem[] = [];
  const seen = new Set<string>();
  for (const it of itemsRaw) {
    if (!it || typeof it !== "object") continue;
    const rec = it as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id.trim().slice(0, 80) : "";
    const label = typeof rec.label === "string" ? rec.label.trim().slice(0, 300) : "";
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    items.push({ id, label });
    if (items.length >= 20) break;
  }
  if (!enabled && !items.length && !doneBucketKeys?.length) return undefined;
  return {
    enabled,
    enforce,
    ...(doneBucketKeys?.length ? { doneBucketKeys } : {}),
    items,
  };
}

function sanitizeDodChecks(raw: unknown, validIds: Set<string>): Record<string, boolean> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(o)) {
    if (!validIds.has(k) || v !== true) continue;
    out[k] = true;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export default function BoardPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const boardId = Array.isArray(params.id) ? params.id[0] ?? "" : (params.id as string);
  const { user, getHeaders, isChecked, setAuth, refreshSession } = useAuth();
  const { pushToast } = useToast();
  const locale = useLocale();
  const backToBoards = `/${locale}/boards`;
  const t = useTranslations("board");
  const tTour = useTranslations("board.productTour");
  const tListImport = useTranslations("kanban.boardListImport");
  const [boardName, setBoardName] = useState("Board");
  const [clientLabel, setClientLabel] = useState<string | null>(null);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const tourRef = useRef<BoardProductTourHandle | null>(null);
  const hasBoardData = useBoardStore((s) => s.db != null);
  const {
    bucketOrder: boardBucketOrder,
    portal: boardPortal,
    anomalyNotifications: boardAnomalyNotifications,
    boardMethodology: boardMethodologyForSprint,
    boardLabels,
  } = useBoardStore(
    useShallow((s) => {
      const d = s.db;
      return {
        bucketOrder: d?.config.bucketOrder,
        portal: d?.portal,
        anomalyNotifications: d?.anomalyNotifications,
        boardMethodology: d?.boardMethodology,
        boardLabels: d?.config?.labels?.length ? d.config.labels : EMPTY_BOARD_LABELS,
      };
    })
  );
  const updateDbSilent = useBoardStore((s) => s.updateDbSilent);
  const [loading, setLoading] = useState(true);
  const [automationsOpen, setAutomationsOpen] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const [templateExportOpen, setTemplateExportOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [anomalySettingsOpen, setAnomalySettingsOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [intakeFormsOpen, setIntakeFormsOpen] = useState(false);
  const [discoverySessionsOpen, setDiscoverySessionsOpen] = useState(false);
  const [pdfListImportOpen, setPdfListImportOpen] = useState(false);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefData, setBriefData] = useState<{ markdown: string; cached: boolean; model?: string } | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveRequestSeqRef = useRef(0);
  const tBoardRef = useRef(t);
  tBoardRef.current = t;
  const csvImportMode = useKanbanUiStore((s) => s.csvImportMode);
  const setCsvImportMode = useKanbanUiStore((s) => s.setCsvImportMode);
  const [formOrigin, setFormOrigin] = useState("");
  const [viewerCapabilities, setViewerCapabilities] = useState<ViewerCapabilities>({ canEdit: true, canAdmin: true });

  const showBoardSkeleton = useMinimumSkeletonDuration(loading);
  const tourExpandFilters = tourStep === BOARD_PRODUCT_TOUR_DAILY_STEP_INDEX;

  /** next/navigation `useRouter()` pode mudar identidade entre renders — evita re-disparar loadBoard (#185). */
  const routerRef = useRef(router);
  routerRef.current = router;
  const getHeadersRef = useRef(getHeaders);
  getHeadersRef.current = getHeaders;
  const pushToastRef = useRef(pushToast);
  pushToastRef.current = pushToast;
  const userRef = useRef(user);
  userRef.current = user;
  /**
   * Após um `refreshSession()` por convidado, incrementamos para o efeito voltar a correr
   * (React pode não re-renderizar se `user` continua `null` com o mesmo objeto de estado).
   */
  const [guestSessionGate, setGuestSessionGate] = useState(0);

  /** Rehydrate persisted stores early (while skeleton shows) so KanbanBoardLoaded
   *  doesn't trigger a state-update cascade on its first render (#185). */
  useEffect(() => {
    void useKanbanUiStore.persist.rehydrate();
    void useFilterStore.persist.rehydrate();
  }, []);

  /** Incrementado a cada `loadBoard`; evita `hydrate` com resposta atrasada após troca de rota (#corrida). */
  const loadSeqRef = useRef(0);

  const loadBoard = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const r = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/bootstrap`, {
        cache: "no-store",
        headers: getHeadersRef.current(),
      });
      if (seq !== loadSeqRef.current) return;
      if (r.status === 401) {
        routerRef.current.replace(`/${locale}/login?redirect=${encodeURIComponent(`/${locale}/board/${boardId}`)}`);
        return;
      }
      if (r.status === 403) {
        pushToastRef.current({ kind: "error", title: tBoardRef.current("toasts.noPermission") });
        routerRef.current.replace(`/${locale}/boards`);
        return;
      }
      if (!r.ok) throw new Error("Erro ao carregar");
      const body = (await r.json()) as {
        board?: BoardData & { name?: string; clientLabel?: string };
        sprints?: SprintData[];
        viewerCapabilities?: ViewerCapabilities;
      };
      if (body.viewerCapabilities && typeof body.viewerCapabilities.canAdmin === "boolean") {
        setViewerCapabilities({
          canEdit: Boolean(body.viewerCapabilities.canEdit),
          canAdmin: body.viewerCapabilities.canAdmin,
        });
      } else {
        setViewerCapabilities({ canEdit: true, canAdmin: true });
      }
      const d = body.board;
      if (!d || typeof d !== "object") throw new Error("Erro ao carregar");
      if (seq !== loadSeqRef.current) return;
      const sprints = Array.isArray(body.sprints) ? body.sprints : [];
      useSprintStore.getState().setSprints(boardId, sprints);
      useSprintStore
        .getState()
        .setActiveSprint(boardId, sprints.find((s) => s.status === "active") ?? null);
      setBoardName(d.name || "Board");
      const rawClient = typeof d.clientLabel === "string" ? d.clientLabel.trim() : "";
      setClientLabel(rawClient || null);
      const bucketOrder = sanitizeBucketOrder(d.config?.bucketOrder);
      const definitionOfDone = sanitizeDefinitionOfDone(d.config?.definitionOfDone, bucketOrder);
      const dodIdSet = new Set((definitionOfDone?.items ?? []).map((x) => x.id));
      const cards = (d.cards || []).map((c: CardData, i: number) => ({
        ...c,
        order: c.order ?? i,
        dueDate: c.dueDate ?? null,
        blockedBy: Array.isArray(c.blockedBy)
          ? [...new Set(c.blockedBy.filter((id) => typeof id === "string" && id.trim()))]
          : [],
        direction: c.direction ?? null,
        assigneeId: typeof c.assigneeId === "string" && c.assigneeId.trim() ? c.assigneeId.trim() : null,
        tags: Array.isArray(c.tags) ? c.tags : [],
        links: Array.isArray(c.links) ? c.links.filter((l) => l && typeof l.url === "string" && l.url.trim()) : [],
        docRefs: Array.isArray(c.docRefs)
          ? c.docRefs
              .filter((d) => d && typeof d.docId === "string" && d.docId.trim())
              .map((d) => ({ docId: String(d.docId), title: d.title ? String(d.title) : undefined, excerpt: d.excerpt ? String(d.excerpt) : undefined }))
          : [],
        subtasks: Array.isArray(c.subtasks) ? c.subtasks : [],
        subtaskProgress: c.subtaskProgress,
        dorReady: sanitizeDorReady((c as CardData).dorReady),
        dodChecks: dodIdSet.size > 0 ? sanitizeDodChecks((c as CardData).dodChecks, dodIdSet) : undefined,
      }));
      const productGoal = sanitizeProductGoal(d.config?.productGoal);
      const executiveStakeholderNote = sanitizeExecutiveStakeholderNote(
        (d.config as { executiveStakeholderNote?: unknown })?.executiveStakeholderNote
      );
      const backlogBucketKey = sanitizeBacklogBucketKey(d.config?.backlogBucketKey, bucketOrder);
      const methodologyRaw = d.boardMethodology;
      const boardMethodology =
        methodologyRaw === "kanban" ||
        methodologyRaw === "scrum" ||
        methodologyRaw === "lean_six_sigma" ||
        methodologyRaw === "discovery"
          ? methodologyRaw
          : undefined;
      useBoardStore.getState().hydrate(boardId, {
        version: d.version || "2.0",
        lastUpdated: d.lastUpdated || "",
        ...(boardMethodology ? { boardMethodology } : {}),
        cards,
        config: {
          bucketOrder,
          collapsedColumns: sanitizeCollapsedColumns(d.config?.collapsedColumns, bucketOrder),
          labels: sanitizeLabels(d.config?.labels),
          ...(productGoal ? { productGoal } : {}),
          ...(executiveStakeholderNote ? { executiveStakeholderNote } : {}),
          ...(backlogBucketKey ? { backlogBucketKey } : {}),
          ...(definitionOfDone ? { definitionOfDone } : {}),
          ...(d.config?.cardRules ? { cardRules: d.config.cardRules } : {}),
        },
        mapaProducao: d.mapaProducao,
        dailyInsights: Array.isArray(d.dailyInsights) ? d.dailyInsights : [],
        intakeForm: d.intakeForm,
        portal: d.portal,
        anomalyNotifications: d.anomalyNotifications,
      });
      const uid = userRef.current?.id;
      if (uid) {
        registerBoardVisit(uid, boardId);
      }
    } catch {
      if (seq !== loadSeqRef.current) return;
      pushToastRef.current({ kind: "error", title: tBoardRef.current("toasts.loadError") });
      routerRef.current.replace(`/${locale}/boards`);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [boardId, locale]);

  useEffect(() => {
    if (!boardId) {
      routerRef.current.replace(`/${locale}/boards`);
      return;
    }
    useKanbanUiStore.getState().resetForBoardSwitch();
    useCopilotStore.getState().resetSessionUi();
    loadBoard();
  }, [boardId, locale, loadBoard]);

  useEffect(() => {
    if (!isChecked) return;
    if (!user) {
      if (guestSessionGate === 0) {
        void refreshSession().finally(() => setGuestSessionGate(1));
        return;
      }
      routerRef.current.replace(`/${locale}/login?redirect=${encodeURIComponent(`/${locale}/board/${boardId}`)}`);
      return;
    }
    if (guestSessionGate !== 0) setGuestSessionGate(0);
  }, [isChecked, user?.id, guestSessionGate, boardId, locale, refreshSession]);

  useEffect(() => {
    const id = boardId;
    return () => {
      useBoardNlqUiStore.getState().clearBoardNlq(id);
    };
  }, [boardId]);

  useEffect(() => {
    if (searchParams.get("automations") === "1") {
      setAutomationsOpen(true);
      router.replace(`/${locale}/board/${boardId}`, { scroll: false });
    }
  }, [searchParams, boardId, locale, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setFormOrigin(window.location.origin);
  }, []);

  const persist = useCallback(
    (data?: BoardData) => {
      if (!data && !useBoardStore.getState().db) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        const requestSeq = ++saveRequestSeqRef.current;
        saveTimeoutRef.current = null;
        const maxAttempts = 3;
        const backoffBaseMs = 400;
        let lastSaveFailureMessage: string | undefined;
        let clientRuleError = false;
        try {
          saveLoop: for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
              const rawNow = data ?? useBoardStore.getState().db;
              if (!rawNow) return;
              const wipOr = consumePendingWipOverrideReason();
              const payload = {
                ...normalizeBoardForPersist(rawNow),
                lastUpdated: new Date().toISOString(),
                ...(wipOr ? { wipOverrideReason: wipOr } : {}),
              };
              const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}`, {
                method: "PUT",
                body: JSON.stringify(payload),
                headers: getApiHeaders(getHeaders()),
              });
              const saveJson = (await res.json()) as {
                error?: string;
                lastUpdated?: string;
                cards?: CardData[];
              };
              if (!res.ok) {
                lastSaveFailureMessage = saveJson.error?.trim() || `Erro ${res.status}`;
                if (res.status >= 400 && res.status < 500) {
                  clientRuleError = true;
                  break saveLoop;
                }
                throw new Error(lastSaveFailureMessage);
              }
              if (Array.isArray(saveJson.cards)) {
                const snap = useBoardStore.getState().db;
                const dodIdSet = new Set((snap?.config?.definitionOfDone?.items ?? []).map((x) => x.id));
                const cards = saveJson.cards!.map((c: CardData, i: number) => ({
                  ...c,
                  order: c.order ?? i,
                  dueDate: c.dueDate ?? null,
                  blockedBy: Array.isArray(c.blockedBy)
                    ? [...new Set(c.blockedBy.filter((id) => typeof id === "string" && id.trim()))]
                    : [],
                  direction: c.direction ?? null,
                  assigneeId: typeof c.assigneeId === "string" && c.assigneeId.trim() ? c.assigneeId.trim() : null,
                  tags: Array.isArray(c.tags) ? c.tags : [],
                  links: Array.isArray(c.links)
                    ? c.links.filter((l) => l && typeof l.url === "string" && l.url.trim())
                    : [],
                  docRefs: Array.isArray(c.docRefs)
                    ? c.docRefs
                        .filter((d) => d && typeof d.docId === "string" && d.docId.trim())
                        .map((d) => ({
                          docId: String(d.docId),
                          title: d.title ? String(d.title) : undefined,
                          excerpt: d.excerpt ? String(d.excerpt) : undefined,
                        }))
                    : [],
                  subtasks: Array.isArray(c.subtasks) ? c.subtasks : [],
                  subtaskProgress: c.subtaskProgress,
                  dorReady: sanitizeDorReady(c.dorReady),
                  dodChecks:
                    dodIdSet.size > 0 ? sanitizeDodChecks((c as CardData).dodChecks, dodIdSet) : (c as CardData).dodChecks,
                }));
                useBoardStore.getState().updateDbSilent((d) => {
                  d.cards = cards;
                  if (saveJson.lastUpdated) d.lastUpdated = saveJson.lastUpdated;
                });
              }
              if (saveRequestSeqRef.current !== requestSeq) return;
              return;
            } catch (e) {
              if (e instanceof Error && e.message && !lastSaveFailureMessage) {
                lastSaveFailureMessage = e.message;
              }
              if (attempt >= maxAttempts) break;
              const waitMs = backoffBaseMs * Math.pow(2, attempt - 1);
              await new Promise((r) => window.setTimeout(r, waitMs));
            }
          }
          if (saveRequestSeqRef.current !== requestSeq) return;
          const useServerAsTitle = Boolean(clientRuleError && lastSaveFailureMessage);
          pushToast({
            kind: "error",
            title: useServerAsTitle
              ? lastSaveFailureMessage!.slice(0, 500)
              : tBoardRef.current("toasts.saveError"),
            ...(!useServerAsTitle && lastSaveFailureMessage
              ? { description: lastSaveFailureMessage.slice(0, 400) }
              : {}),
          });
        } finally {
          saveTimeoutRef.current = null;
        }
      }, 300);
    },
    [boardId, getHeaders]
  );

  useEffect(() => {
    setBoardPersistenceHandler(() => persist());
    return () => setBoardPersistenceHandler(null);
  }, [persist]);

  const handleGenerateBrief = useCallback(async () => {
    setBriefLoading(true);
    try {
      const data = await apiGet<{ markdown: string; cached: boolean; model?: string }>(
        `/api/boards/${encodeURIComponent(boardId)}/executive-brief-ai`,
        getHeaders(),
      );
      setBriefData(data);
      setBriefOpen(true);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t("executiveBrief.error");
      pushToast({ kind: "error", title: msg });
    } finally {
      setBriefLoading(false);
    }
  }, [boardId, getHeaders, pushToast, t]);

  if (showBoardSkeleton || !hasBoardData) {
    return (
      <div className="flux-page-contract min-h-screen" data-flux-area="operational">
        <Header title={boardName}>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="h-8 w-24 rounded-[var(--flux-rad)] bg-[var(--flux-chrome-alpha-12)] flux-animate-skeleton-pulse" />
            <div className="h-8 w-24 rounded-[var(--flux-rad)] bg-[var(--flux-chrome-alpha-12)] flux-animate-skeleton-pulse" />
          </div>
        </Header>
        <SkeletonKanbanBoard />
      </div>
    );
  }
  return (
    <div className="flux-page-contract min-h-screen" data-flux-area="operational">
      <DataFadeIn active animate={false} key={boardId}>
        <div>
          <Header
            title={boardName}
            titleLine2={clientLabel ? t("clientLabelInHeader", { label: clientLabel }) : undefined}
            boardTourHeader
            backHref={backToBoards}
            backLabel={t("backToBoards")}
          >
            <div className="flex items-center justify-end gap-1.5 flex-wrap">
              {/* Presence */}
              <BoardPresenceAvatars />

              {/* Separator */}
              <div className="w-px h-5 bg-[var(--flux-border-default)] mx-0.5 shrink-0" />

              {/* Board Settings dropdown — secondary actions */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="btn-secondary flex items-center gap-1.5 py-2 px-3 text-sm"
                    aria-label={t("boardSettings.open")}
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {t("boardSettings.open")}
                    <svg className="w-3 h-3 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[180px]">
                  <DropdownMenuItem onSelect={() => setAutomationsOpen(true)}>
                    <svg className="w-3.5 h-3.5 mr-2 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    {t("automations.open")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setAnomalySettingsOpen(true)}>
                    <svg className="w-3.5 h-3.5 mr-2 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {t("anomalyAlerts.open")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setPortalOpen(true)}>
                    <svg className="w-3.5 h-3.5 mr-2 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    {t("portal.open")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setIntakeFormsOpen(true)}>
                    <svg className="w-3.5 h-3.5 mr-2 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    {t("intakeForm.open")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Sprint — kept visible */}
              <button
                type="button"
                className="btn-secondary flex items-center gap-1.5 py-2 px-3 text-sm"
                onClick={() => useSprintStore.getState().setPanelOpen(boardId)}
                aria-label="Abrir painel Sprint"
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Sprint
              </button>

              {/* Goals — Flux Goals/OKRs */}
              <button
                type="button"
                className="btn-secondary flex items-center gap-1.5 py-2 px-3 text-sm"
                onClick={() => setGoalsOpen(true)}
                aria-label="Abrir Flux Goals"
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l2 2 4-4" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8 8-4-4" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2 2 1-1" />
                </svg>
                Goals
              </button>

              {isDiscoveryMethodology(boardMethodologyForSprint ?? "scrum") ? (
                <button
                  type="button"
                  className="btn-secondary flex items-center gap-1.5 py-2 px-3 text-sm"
                  onClick={() => setDiscoverySessionsOpen(true)}
                  aria-label={t("discoverySessions.open")}
                >
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  {t("discoverySessions.open")}
                </button>
              ) : null}

              <Link
                href={`/${locale}/reports`}
                className="btn-secondary flex items-center gap-1.5 py-2 px-3 text-sm no-underline"
                aria-label={t("reports.aria")}
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                {t("reports.open")}
              </Link>

              {/* Admin tools — collapsed into dropdown */}
              {user?.isAdmin && (
                <>
                  <div className="w-px h-5 bg-[var(--flux-border-default)] mx-0.5 shrink-0" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="btn-secondary flex items-center gap-1.5 py-2 px-3 text-sm"
                        aria-label="Opções de administrador"
                      >
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <svg className="w-3 h-3 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[160px]">
                      <DropdownMenuItem onSelect={() => setTemplateExportOpen(true)}>
                        <svg className="w-3.5 h-3.5 mr-2 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                        </svg>
                        Template
                      </DropdownMenuItem>
                      {user && isPlatformAdminSession(user) ? (
                        <>
                          <DropdownMenuItem onSelect={() => router.push(`/${locale}/admin/tracer`)}>
                            <svg className="w-3.5 h-3.5 mr-2 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Tracer
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      ) : null}
                      <DropdownMenuItem onSelect={() => setEmbedOpen(true)}>
                        <svg className="w-3.5 h-3.5 mr-2 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                        Widget
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => setCsvImportMode("replace")}
                        className={csvImportMode === "replace" ? "text-[var(--flux-primary-light)]" : ""}
                      >
                        <svg className="w-3.5 h-3.5 mr-2 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        {csvImportMode === "replace" ? "✓ " : ""}Substituir
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setCsvImportMode("merge")}
                        className={csvImportMode === "merge" ? "text-[var(--flux-primary-light)]" : ""}
                      >
                        <svg className="w-3.5 h-3.5 mr-2 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                        {csvImportMode === "merge" ? "✓ " : ""}Mesclar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => triggerCsvImport()}>
                        <svg className="w-3.5 h-3.5 mr-2 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Importar CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setPdfListImportOpen(true)}>
                        <svg className="w-3.5 h-3.5 mr-2 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        {tListImport("menuItem")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => triggerCsvExport()}>
                        <svg className="w-3.5 h-3.5 mr-2 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Exportar CSV
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={handleGenerateBrief} disabled={briefLoading}>
                        <svg className="w-3.5 h-3.5 mr-2 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        {briefLoading ? t("executiveBrief.generating") : t("executiveBrief.menuItem")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}

              {/* Tour — ghost help button, deemphasized */}
              <div className="w-px h-5 bg-[var(--flux-border-default)] mx-0.5 shrink-0" />
              {tourStep !== null ? (
                <button
                  type="button"
                  className="btn-ghost flex items-center gap-1.5 py-2 px-3 text-xs"
                  onClick={() => void tourRef.current?.skip()}
                >
                  {tTour("skip")}
                </button>
              ) : (
                <CustomTooltip
                  content={user?.boardProductTourCompleted ? tTour("redo") : tTour("start")}
                  position="bottom"
                >
                  <button
                    type="button"
                    className="btn-ghost flex items-center justify-center p-2"
                    onClick={() => tourRef.current?.redo()}
                    aria-label={user?.boardProductTourCompleted ? tTour("redo") : tTour("start")}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </CustomTooltip>
              )}

            </div>
          </Header>

          <KanbanBoard
            boardName={boardName}
            boardId={boardId}
            getHeaders={getHeaders}
            priorities={PRIORITIES}
            progresses={PROGRESSES}
            directions={DIRECTIONS}
            canAdminBoard={viewerCapabilities.canAdmin}
            productTourExpandFilters={tourExpandFilters}
            allowExternalMerge={true}
            reloadBoardFromServer={loadBoard}
          />
        </div>
      </DataFadeIn>

      <BoardAutomationsModal
        open={automationsOpen}
        onClose={() => setAutomationsOpen(false)}
        boardId={boardId}
        bucketKeys={(boardBucketOrder ?? []).map((b) => b.key)}
        priorities={PRIORITIES}
        progresses={PROGRESSES}
        getHeaders={getHeaders}
      />

      <BoardPortalModal
        open={portalOpen}
        onClose={() => setPortalOpen(false)}
        boardId={boardId}
        bucketOrder={boardBucketOrder ?? []}
        portal={boardPortal}
        getHeaders={getHeaders}
        onSaved={(portal) => {
          updateDbSilent((d) => {
            d.portal = portal;
          });
        }}
      />

      <BoardIntakeFormsModal
        open={intakeFormsOpen}
        onClose={() => setIntakeFormsOpen(false)}
        boardId={boardId}
        bucketOrder={boardBucketOrder ?? []}
        priorities={PRIORITIES}
        progresses={PROGRESSES}
        getHeaders={getHeaders}
        formOrigin={formOrigin}
        onSaved={() => loadBoard()}
      />

      <BoardDiscoverySessionsModal
        open={discoverySessionsOpen}
        onClose={() => setDiscoverySessionsOpen(false)}
        boardId={boardId}
        bucketOrder={boardBucketOrder ?? []}
        priorities={PRIORITIES}
        progresses={PROGRESSES}
        getHeaders={getHeaders}
        onBoardReload={() => loadBoard()}
      />

      <BoardPdfListImportModal
        open={pdfListImportOpen}
        onClose={() => setPdfListImportOpen(false)}
        boardId={boardId}
        getHeaders={getHeaders}
        onBoardReload={loadBoard}
        bucketOrder={boardBucketOrder ?? []}
        boardLabels={boardLabels}
        directionStorageValues={DIRECTION_STORAGE_VALUES}
      />

      <BoardTemplateExportModal
        open={templateExportOpen}
        onClose={() => setTemplateExportOpen(false)}
        boardId={boardId}
        getHeaders={getHeaders}
      />

      <BoardEmbedModal open={embedOpen} onClose={() => setEmbedOpen(false)} boardId={boardId} getHeaders={getHeaders} />

      <BoardGoalsModal boardId={boardId} isOpen={goalsOpen} onClose={() => setGoalsOpen(false)} />

      <BoardAnomalyNotificationsModal
        open={anomalySettingsOpen}
        onClose={() => setAnomalySettingsOpen(false)}
        boardId={boardId}
        initial={boardAnomalyNotifications}
        getHeaders={getHeaders}
        onSaved={(next) => {
          updateDbSilent((d) => {
            d.anomalyNotifications = next;
          });
        }}
      />

      <BoardCopilotPanel boardId={boardId} boardName={boardName} getHeaders={getHeaders} hideDesktopFab />

      {isSprintMethodology(boardMethodologyForSprint ?? "scrum") ? (
        <SprintPanel boardId={boardId} getHeaders={getHeaders} />
      ) : null}

      <BoardActivityPanel boardId={boardId} getHeaders={getHeaders} hideDesktopFab />

      <BoardDesktopToolsRail />

      <BoardFluxyDock />

      <CopilotNudgeToast boardId={boardId} />
      <CollaborationCursors />

      <BoardExecutiveBriefModal
        open={briefOpen}
        onClose={() => setBriefOpen(false)}
        markdown={briefData?.markdown ?? ""}
        cached={briefData?.cached ?? false}
        model={briefData?.model}
      />

      <BoardProductTour
        ref={tourRef}
        user={user}
        setAuth={setAuth}
        getHeaders={getHeaders}
        tourStep={tourStep}
        onTourStepChange={setTourStep}
      />
    </div>
  );
}

